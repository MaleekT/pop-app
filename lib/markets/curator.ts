import { createWalletClient, createPublicClient, keccak256, toHex, parseEventLogs } from 'viem'
import { arcTransport } from '@/lib/markets/rpc'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, USDC } from '@/lib/predict/contracts'
import { fetchSpotPrice } from '@/lib/markets/engines/crypto-price'
import { marketDefinition, deriveOutcomes, asUTC } from '@/lib/markets/definition'
import { CRYPTO_COINS, PRICE_BANDS, HORIZONS, TARGET_OPEN_PER_COIN, MAX_CREATES_PER_RUN, SPORTS_FOLLOW, TARGET_OPEN_SPORTS, FIXTURES_PER_TEAM, FOOTBALL_MAX_DAYS, BOARD_TARGET, BOARD_MIN, type CryptoCoin, type PriceBand, type Horizon } from '@/lib/markets/curator-config'
import type { MarketRow } from '@/lib/markets/db.types'
import { erc20Abi } from '@/lib/contracts'
import { SEED_PER_OUTCOME, SEED_APPROVE_BUFFER } from '@/lib/markets/bankroll-config'
import { fetchUpcomingFixtures, type UpcomingFixture } from '@/lib/markets/engines/sports-fixtures'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!
const MS_PER_HOUR = 3_600_000

type CryptoTemplateKey = 'crypto_price_above' | 'crypto_price_below'

export interface CryptoCandidate {
  templateKey: CryptoTemplateKey
  category: 'crypto'
  slotKey: string                    // stable logical identity for dedup across runs
  params: Record<string, string>     // coin, coinName, target, resolveAt, band, horizon
  outcomes: string[]
  definitionText: string
  definitionHash: `0x${string}`
}

// A ready-to-create market spec from any category (crypto or sports). The create + seed
// loop is category-agnostic and works off this shape (CryptoCandidate is assignable to it).
export interface MarketCandidate {
  category: string
  templateKey: string
  slotKey: string
  params: Record<string, string>
  outcomes: string[]
  definitionText: string
  definitionHash: `0x${string}`
}

// Stable identity for a curated crypto market, independent of the exact target price
// or timestamp (which drift every run). Used to skip slots that are already live.
export function cryptoSlotKey(coinId: string, templateKey: string, band: string, horizon: string): string {
  return `${coinId}|${templateKey}|${band}|${horizon}`
}

// Ordered (band, horizon) slots. Horizons are the outer loop and bands alternate
// direction, so walking the list yields opposite-direction picks rather than a run of
// "above" markets.
function cryptoSlots(): { band: PriceBand; horizon: Horizon }[] {
  const slots: { band: PriceBand; horizon: Horizon }[] = []
  for (const horizon of HORIZONS) {
    for (const band of PRICE_BANDS) {
      slots.push({ band, horizon })
    }
  }
  return slots
}

// Pure generation: round-robins across coins and walks each coin's slots from its own
// rotated offset, so a run spreads across coins, directions and horizons instead of
// filling one coin first. Respects a per-coin target and the per-run cap. Deterministic
// and side-effect free so it can be unit tested without chain or DB.
export function generateCryptoCandidates(args: {
  prices: Record<string, number>
  existingSlotKeys: Set<string>
  openCountByCoin: Record<string, number>
  now: number
  limit: number
}): CryptoCandidate[] {
  const { prices, existingSlotKeys, openCountByCoin, now, limit } = args
  const out: CryptoCandidate[] = []
  if (limit <= 0) return out

  const slots = cryptoSlots()
  const used = new Set(existingSlotKeys)
  const projected: Record<string, number> = { ...openCountByCoin }
  const cursor = CRYPTO_COINS.map(() => 0) // per-coin position walked through `slots`

  let progressed = true
  while (out.length < limit && progressed) {
    progressed = false

    for (let ci = 0; ci < CRYPTO_COINS.length; ci++) {
      if (out.length >= limit) break
      const coin = CRYPTO_COINS[ci]
      const price = prices[coin.id]
      if (!price || price <= 0) continue
      if ((projected[coin.id] ?? 0) >= TARGET_OPEN_PER_COIN) continue

      const candidate = nextCandidate(coin, ci, slots, cursor, used, price, now)
      if (!candidate) continue

      out.push(candidate)
      used.add(candidate.slotKey)
      projected[coin.id] = (projected[coin.id] ?? 0) + 1
      progressed = true
    }
  }

  return out
}

// Rounds a strike to a precision that fits its magnitude: whole dollars at/above $10 (BTC, ETH,
// SOL, BNB, HYPE), cents from $1–$10 (XRP, NEAR), finer below $1 (SUI). A flat Math.round() would
// collapse every band of a low-priced coin onto the same integer — SUI at $0.77 would make both
// +5% and −5% resolve to "$1", a meaningless market — so the price bands must keep sub-dollar
// precision or they stop being distinct.
function roundTarget(price: number): number {
  if (price >= 10) return Math.round(price)
  if (price >= 1) return Math.round(price * 100) / 100
  return Math.round(price * 1000) / 1000
}

// Advances a coin's cursor to its next not-yet-live slot and builds that market spec,
// or returns null if the coin has no free slots left.
function nextCandidate(
  coin: CryptoCoin,
  ci: number,
  slots: { band: PriceBand; horizon: Horizon }[],
  cursor: number[],
  used: Set<string>,
  price: number,
  now: number,
): CryptoCandidate | null {
  const offset = ci * (PRICE_BANDS.length + 1) // rotate each coin's start for board variety
  while (cursor[ci] < slots.length) {
    const slot = slots[(cursor[ci] + offset) % slots.length]
    cursor[ci]++

    const templateKey: CryptoTemplateKey = slot.band.direction === 'above' ? 'crypto_price_above' : 'crypto_price_below'
    const slotKey = cryptoSlotKey(coin.id, templateKey, slot.band.label, slot.horizon.label)
    if (used.has(slotKey)) continue

    const raw = slot.band.direction === 'above'
      ? price * (1 + slot.band.pct)
      : price * (1 - slot.band.pct)
    const target = roundTarget(raw)
    if (target <= 0) continue

    const resolveAt = new Date(now + slot.horizon.hours * MS_PER_HOUR).toISOString().slice(0, 16) // "YYYY-MM-DDTHH:mm" UTC
    const params: Record<string, string> = {
      coin: coin.id,
      coinName: coin.name,
      target: String(target),
      resolveAt,
      band: slot.band.label,
      horizon: slot.horizon.label,
    }
    const outcomes = deriveOutcomes(templateKey, params)
    const definitionText = marketDefinition(templateKey, params)
    return {
      templateKey,
      category: 'crypto',
      slotKey,
      params,
      outcomes,
      definitionText,
      definitionHash: keccak256(toHex(definitionText)),
    }
  }
  return null
}

// Betting on a fixture closes at kick-off, so resolveAt IS the kick-off. resolveAt does double duty
// in the contract: it is the betting deadline (PredictMarket:109 BettingClosed) and the earliest the
// resolver may propose (PredictMarket:150 TooEarly). Padding it past kick-off therefore did two bad
// things at once — it left betting open on a match whose result was already public, and it blocked
// settlement until the pad expired. Nothing here needs to wait for the match to end: the engine
// reports `pending` until the fixture reads FT, so settlement fires on the first run after the
// final whistle and not a moment before.
const SPORTS_MIN_LEAD_MS = 30 * 60_000

// Betting shuts a minute BEFORE the whistle, never on it. resolveAt is minute-truncated below, and
// a fixture's listed start is not its exact start, so closing exactly on kick-off leaves the last
// seconds of a market open against a game that may already be underway. A minute of margin costs a
// bettor nothing and removes the ambiguity entirely.
//
// This is the same separation PvP gets from two on-chain fields — Pop.sol has joinDeadline (betting
// shuts, Pop.sol:94) and resolveAt (result callable, Pop.sol:124). PredictMarket has ONE resolveAt
// doing both jobs and no setter, so the split lives here instead: resolveAt closes betting at
// kick-off minus this, and the "result callable" half is the engine's FT gate, which reports
// `pending` until the fixture is actually finished. Same guarantee, no contract change.
const LOCK_BEFORE_KICKOFF_MS = 60_000

// Pure generation: turns upcoming fixtures into 3-way sports_winner market specs, skipping
// fixtures already listed or whose resolve time is past. Deterministic and side-effect free.
export function generateSportsCandidates(args: {
  fixtures: UpcomingFixture[]
  existingFixtureIds: Set<string>
  now: number
  limit: number
}): MarketCandidate[] {
  const { fixtures, existingFixtureIds, now, limit } = args
  const out: MarketCandidate[] = []
  if (limit <= 0) return out
  const used = new Set(existingFixtureIds)

  for (const f of fixtures) {
    if (out.length >= limit) break
    if (used.has(f.id)) continue
    const kickoff = Date.parse(f.date)
    if (isNaN(kickoff)) continue
    // A fixture about to start is not worth opening — there is no betting window left — and
    // createMarket reverts BadTiming if kick-off has passed by the time the create tx lands.
    if (kickoff - now < SPORTS_MIN_LEAD_MS) continue

    const params: Record<string, string> = {
      sport: f.sport,
      fixtureId: f.id,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      resolveAt: new Date(kickoff - LOCK_BEFORE_KICKOFF_MS).toISOString().slice(0, 16),
    }
    // 2-way "draw no bet": a drawn match voids and refunds (the resolver voids a draw in a
    // 2-outcome market). Safe for knockout ties decided on penalties, which a 3-way market
    // would otherwise mis-resolve to Draw since the engine reads the 90-minute score.
    const outcomes = [f.homeTeam, f.awayTeam]
    const definitionText = marketDefinition('sports_winner', params)
    used.add(f.id)
    out.push({
      category: 'sports',
      templateKey: 'sports_winner',
      slotKey: `sports|${f.id}`,
      params,
      outcomes,
      definitionText,
      definitionHash: keccak256(toHex(definitionText)),
    })
  }
  return out
}

interface CuratorLog {
  slot: string
  outcome: string
  id?: string
}

export interface CuratorResult {
  created: number
  results: CuratorLog[]
}

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Reads live crypto market params into stable slot keys so generation can skip them.
function openCryptoSlotKeys(open: MarketRow[]): Set<string> {
  const keys = new Set<string>()
  for (const m of open) {
    const p = m.params
    if (m.category === 'crypto' && p?.coin && p?.band && p?.horizon) {
      keys.add(cryptoSlotKey(p.coin, m.template_key, p.band, p.horizon))
    }
  }
  return keys
}

// Counts live crypto markets per coin so generation can respect the per-coin target.
function openCryptoCountByCoin(open: MarketRow[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const m of open) {
    if (m.category === 'crypto' && m.params?.coin) {
      counts[m.params.coin] = (counts[m.params.coin] ?? 0) + 1
    }
  }
  return counts
}

// Fixture ids already listed as open sports markets, so generation can skip them.
function openSportsFixtureIds(open: MarketRow[]): Set<string> {
  const ids = new Set<string>()
  for (const m of open) {
    if (m.category === 'sports' && m.params?.fixtureId) ids.add(m.params.fixtureId)
  }
  return ids
}

// Markets the owner created by hand are tagged src='owner' (see app/predict/new). They are still
// DEDUPED against, so the curator never re-lists a fixture or price slot the owner already listed,
// but they do NOT COUNT toward the board target: a market you make by hand adds to the board
// instead of displacing a curated one. Untagged markets are curator-made (the tag postdates them).
function isCurated(m: MarketRow): boolean {
  return m.params?.src !== 'owner'
}

// Keeps a target number of open markets (crypto + sports) alive. Reuses the owner=resolver
// wallet (createMarket is onlyOwner, and that key already auto-signs resolution txs),
// so no new trust surface. Rate limited, idempotent (dedup by slot), and isolated.
export async function runCurator(): Promise<CuratorResult> {
  const key = requireEnv('RESOLVER_PRIVATE_KEY') as `0x${string}`
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT not configured')

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: arcTransport() })

  // createMarket is onlyOwner — fail fast on a key/deploy mismatch rather than sending
  // doomed txs (mirrors the resolver's on-chain resolver check).
  const onChainOwner = await publicClient.readContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'owner',
  })
  if ((onChainOwner as string).toLowerCase() !== account.address.toLowerCase()) {
    throw new Error(`Owner mismatch: on-chain=${onChainOwner} wallet=${account.address}`)
  }

  // Best-effort gas floor. On Arc, gas is paid in USDC (the native token), so a zero
  // native balance means creation cannot proceed. Skip the run rather than spin. Any
  // non-zero balance proceeds and lets the per-market tx be the hard backstop.
  let nativeBalance: bigint | null = null
  try {
    nativeBalance = await publicClient.getBalance({ address: account.address })
  } catch {
    nativeBalance = null
  }
  if (nativeBalance === 0n) {
    return { created: 0, results: [{ slot: '-', outcome: 'owner-balance-zero' }] }
  }

  const db = createMarketsClient()
  const nowIso = new Date().toISOString()
  const { data: openData, error: openErr } = await db
    .from('markets')
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('status', 'Pending')
    .gt('resolve_at', nowIso)
  if (openErr) throw new Error(openErr.message)
  const open = (openData ?? []) as MarketRow[]

  // Only curated markets count toward the board target; the owner's own sit on top of it.
  const curated = open.filter(isCurated)
  const boardRoom = BOARD_TARGET - curated.length

  // ── Sports first ────────────────────────────────────────────────────────────
  // Fixtures are timely and viral, so they get first claim on the board and on the per-run cap.
  // fetchUpcomingFixtures ranks real competitions above preseason, so a World Cup tie or a league
  // match is always taken ahead of a July friendly, and friendlies only fill what is left.
  let sportsCandidates: MarketCandidate[] = []
  const openSports = curated.filter((m) => m.category === 'sports').length
  const sportsRoom = Math.min(TARGET_OPEN_SPORTS - openSports, boardRoom)
  if (SPORTS_FOLLOW.length > 0 && sportsRoom > 0) {
    const fixtures = await fetchUpcomingFixtures(SPORTS_FOLLOW, FIXTURES_PER_TEAM, FOOTBALL_MAX_DAYS * 24 * MS_PER_HOUR)
    sportsCandidates = generateSportsCandidates({
      fixtures,
      existingFixtureIds: openSportsFixtureIds(open), // dedup against EVERY open market, the owner's included
      now: Date.now(),
      limit: sportsRoom,
    })
  }

  // ── Crypto fills whatever the board still needs ─────────────────────────────
  // This is the guaranteed supply (36 slots), so it is what actually holds BOARD_MIN when fixtures
  // are thin, which out of season is most of the time.
  let cryptoCandidates: MarketCandidate[] = []
  const cryptoRoom = boardRoom - sportsCandidates.length
  if (cryptoRoom > 0) {
    const prices: Record<string, number> = {}
    for (const coin of CRYPTO_COINS) {
      const price = await fetchSpotPrice(coin.id)
      if (price != null) prices[coin.id] = price
    }
    cryptoCandidates = generateCryptoCandidates({
      prices,
      existingSlotKeys: openCryptoSlotKeys(open),      // dedup against EVERY open market
      openCountByCoin: openCryptoCountByCoin(curated), // ...but count only our own
      now: Date.now(),
      limit: cryptoRoom,
    })
  }

  const candidates = [...sportsCandidates, ...cryptoCandidates].slice(0, MAX_CREATES_PER_RUN)
  if (candidates.length === 0) {
    return { created: 0, results: [{ slot: '-', outcome: 'nothing-to-create' }] }
  }

  // Guards passed and we have work — build the signing client once.
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: arcTransport() })

  const results: CuratorLog[] = []
  let created = 0

  // Ensure a USDC allowance to PredictMarket that covers this run's seeding, so each market can be
  // seeded the instant it exists. The approve is the curator's most RPC-fragile step: on the laggy
  // Arc RPC the tx routinely mines while its receipt wait times out, which previously aborted the
  // whole run even though the allowance was set. So skip the approve when a standing allowance
  // already covers the budget, approve a multi-run buffer when it does not (so most runs skip it),
  // and after a wait timeout re-read the allowance before giving up.
  const seedBudget = SEED_PER_OUTCOME * BigInt(candidates.reduce((n, c) => n + c.outcomes.length, 0))
  const readAllowance = () =>
    publicClient.readContract({
      address: USDC, abi: erc20Abi, functionName: 'allowance', args: [account.address, PREDICT_MARKET_CONTRACT],
    }) as Promise<bigint>

  let allowance = 0n
  try {
    allowance = await readAllowance()
  } catch {
    allowance = 0n // unreadable → treat as zero and try to approve
  }

  if (allowance < seedBudget) {
    const approveAmount = seedBudget > SEED_APPROVE_BUFFER ? seedBudget : SEED_APPROVE_BUFFER
    try {
      const approveHash = await walletClient.writeContract({
        address: USDC, abi: erc20Abi, functionName: 'approve', args: [PREDICT_MARKET_CONTRACT, approveAmount],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
    } catch (approveErr) {
      // The tx often lands after the receipt wait times out on the flaky RPC — re-read the allowance
      // before giving up, so a slow-but-successful approve doesn't needlessly abort the run.
      console.error('curator: seed approve wait failed; re-checking allowance:', approveErr)
      let after = 0n
      try { after = await readAllowance() } catch { /* leave 0 */ }
      if (after < seedBudget) {
        return { created: 0, results: [{ slot: 'seed', outcome: 'approve-failed' }] }
      }
    }
  }

  // The Arc testnet RPC frequently errors on the receipt endpoint even when a tx has already mined.
  // Waiting a single time used to throw and abort the run, ORPHANING the market it had just created
  // (live on-chain, never seeded or mirrored, invisible on the board). Retry the receipt fetch through
  // a transient hiccup; the tx is already sent, so this only waits the RPC out.
  const waitReceipt = async (hash: `0x${string}`) => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000 })
      } catch (e) {
        lastErr = e
        await new Promise((r) => setTimeout(r, 2_000))
      }
    }
    throw lastErr
  }
  const readNextId = () =>
    publicClient.readContract({ address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'nextId' }) as Promise<bigint>

  for (const c of candidates) {
    try {
      const resolveAtTs = BigInt(Math.floor(asUTC(c.params.resolveAt).getTime() / 1000))
      // createMarket runs `id = ++nextId`; it is onlyOwner and runs are serialised, so the new id is
      // deterministically (nextId before the call) + 1. Capture it up front so the market can be
      // recovered even when its receipt never arrives, instead of being orphaned.
      const idBefore = await readNextId()
      const hash = await walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'createMarket',
        args: [c.definitionHash, resolveAtTs, c.outcomes.length],
      })

      let marketIdBn: bigint
      try {
        const receipt = await waitReceipt(hash)
        if (receipt.status !== 'success') {
          results.push({ slot: c.slotKey, outcome: 'create-reverted' })
          break
        }
        const [log] = parseEventLogs({ abi: predictMarketAbi, eventName: 'MarketCreated', logs: receipt.logs })
        marketIdBn = log ? log.args.id : idBefore + 1n
      } catch {
        // No receipt after retries. The tx has very likely mined — confirm nextId advanced AND that
        // the market at the derived id is actually ours (its definitionHash matches). That second
        // check makes the id derivation safe even if some other create ever landed concurrently:
        // a mismatch just skips this market rather than seeding/mirroring the wrong one.
        const idAfter = await readNextId()
        if (idAfter <= idBefore) {
          results.push({ slot: c.slotKey, outcome: 'create-unconfirmed' })
          break
        }
        marketIdBn = idBefore + 1n
        const m = (await publicClient.readContract({
          address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'getMarket', args: [marketIdBn],
        })) as { definitionHash?: string }
        // Any unexpected/empty shape (or a hash that isn't ours) → skip rather than seed the wrong market.
        if (m?.definitionHash?.toLowerCase() !== c.definitionHash.toLowerCase()) {
          results.push({ slot: c.slotKey, outcome: 'create-unconfirmed' })
          break
        }
      }
      const marketId = marketIdBn.toString()  // the DB mirrors on_chain_id as text

      // Seed EVERY outcome BEFORE mirroring, so a market can never reach the board unseeded.
      // This ordering is the fix. The old code created and mirrored all the markets first and
      // seeded them in a second pass, so a run that exhausted its 60s budget left the last market
      // visible on the board with a 0/0 pool. An empty pool has no odds: it read 0% on the board
      // and, worse, priced a parlay leg at the cap. A seed failure now aborts this market and the
      // run, leaving it unmirrored and therefore unbettable rather than broken and live.
      for (let o = 0; o < c.outcomes.length; o++) {
        const seedHash = await walletClient.writeContract({
          address: PREDICT_MARKET_CONTRACT,
          abi: predictMarketAbi,
          functionName: 'deposit',
          args: [marketIdBn, o, SEED_PER_OUTCOME],
        })
        const seedReceipt = await waitReceipt(seedHash)
        // A reverted seed would leave the pool empty; refuse to mirror it (throws to the outer catch,
        // which stops the run and leaves this market unmirrored rather than broken-and-visible).
        if (seedReceipt.status !== 'success') throw new Error(`seed outcome ${o} reverted for market ${marketId}`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insErr } = await (db.from('markets') as any).insert({
        on_chain_id: marketId,
        contract_address: CONTRACT_ADDRESS,
        category: c.category,
        template_key: c.templateKey,
        params: c.params,
        outcomes: c.outcomes,
        definition_text: c.definitionText,
        definition_hash: c.definitionHash,
        resolve_at: asUTC(c.params.resolveAt).toISOString(),
        status: 'Pending',
      })
      if (insErr) {
        // Live and seeded on-chain, but the mirror failed. Stop rather than create more we cannot
        // mirror (bounds orphans during a DB write outage).
        console.error(`curator: DB mirror failed for market ${marketId} (${c.slotKey}):`, insErr.message)
        results.push({ slot: c.slotKey, outcome: 'created-mirror-failed', id: marketId })
        break
      }

      // Counts only markets that are live, SEEDED and mirrored.
      created++
      results.push({ slot: c.slotKey, outcome: 'created', id: marketId })
    } catch (err) {
      // Usually gas exhaustion or the 60s function budget running out. Stop rather than hammer.
      // If it fired between createMarket and the last seed deposit, that market exists on-chain but
      // was never mirrored, so it stays off the board and can be neither bet on nor parlayed.
      console.error(`curator: create/seed failed for ${c.slotKey}:`, err)
      results.push({ slot: c.slotKey, outcome: 'tx-failed' })
      break
    }
  }

  // Surface an under-filled board in the cron response rather than silently shipping a thin one.
  // If this keeps firing, either the run is cap-bound (raise the cron frequency, since
  // MAX_CREATES_PER_RUN is pinned by the 60s function timeout) or creation is failing, in which
  // case the tx-failed / seed entries above say why.
  const boardAfter = curated.length + created
  if (boardAfter < BOARD_MIN) {
    results.push({ slot: '-', outcome: `below-floor-${boardAfter}/${BOARD_MIN}` })
  }

  return { created, results }
}
