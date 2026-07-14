import { createWalletClient, createPublicClient, http, keccak256, toHex, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, USDC } from '@/lib/predict/contracts'
import { fetchSpotPrice } from '@/lib/markets/engines/crypto-price'
import { marketDefinition, deriveOutcomes, asUTC } from '@/lib/markets/definition'
import { CRYPTO_COINS, PRICE_BANDS, HORIZONS, TARGET_OPEN_PER_COIN, MAX_CREATES_PER_RUN, SPORTS_FOLLOW, TARGET_OPEN_SPORTS, FIXTURES_PER_TEAM, FOOTBALL_MAX_DAYS, BOARD_TARGET, BOARD_MIN, type CryptoCoin, type PriceBand, type Horizon } from '@/lib/markets/curator-config'
import type { MarketRow } from '@/lib/markets/db.types'
import { erc20Abi } from '@/lib/contracts'
import { SEED_PER_OUTCOME } from '@/lib/markets/bankroll-config'
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

    const target = slot.band.direction === 'above'
      ? Math.round(price * (1 + slot.band.pct))
      : Math.round(price * (1 - slot.band.pct))
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

const SPORTS_RESOLVE_BUFFER_MS = 3 * MS_PER_HOUR // resolve 3h after kick-off (match + buffer)

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
    const resolveMs = kickoff + SPORTS_RESOLVE_BUFFER_MS
    if (resolveMs <= now) continue

    const params: Record<string, string> = {
      sport: f.sport,
      fixtureId: f.id,
      homeTeam: f.homeTeam,
      awayTeam: f.awayTeam,
      resolveAt: new Date(resolveMs).toISOString().slice(0, 16),
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
  const rpc = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC ?? 'https://rpc.testnet.arc.network'
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_PREDICT_MARKET_CONTRACT not configured')

  const account = privateKeyToAccount(key)
  const publicClient = createPublicClient({ chain: arcTestnet, transport: http(rpc) })

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
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })

  const results: CuratorLog[] = []
  let created = 0

  // One approve up front for the run's whole seed budget, so each market can be seeded the instant
  // it exists. Approving more than we end up spending is harmless: it is the owner's own allowance
  // to PredictMarket, which only ever pulls inside deposit().
  const seedBudget = SEED_PER_OUTCOME * BigInt(candidates.reduce((n, c) => n + c.outcomes.length, 0))
  try {
    const approveHash = await walletClient.writeContract({
      address: USDC, abi: erc20Abi, functionName: 'approve', args: [PREDICT_MARKET_CONTRACT, seedBudget],
    })
    await publicClient.waitForTransactionReceipt({ hash: approveHash })
  } catch (approveErr) {
    // With no allowance nothing can be seeded, and an unseeded market is a broken market. Create
    // nothing rather than create markets we already know we cannot seed.
    console.error('curator: seed approve failed; creating nothing this run:', approveErr)
    return { created: 0, results: [{ slot: 'seed', outcome: 'approve-failed' }] }
  }

  for (const c of candidates) {
    try {
      const resolveAtTs = BigInt(Math.floor(asUTC(c.params.resolveAt).getTime() / 1000))
      const hash = await walletClient.writeContract({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'createMarket',
        args: [c.definitionHash, resolveAtTs, c.outcomes.length],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const [log] = parseEventLogs({ abi: predictMarketAbi, eventName: 'MarketCreated', logs: receipt.logs })
      if (!log) {
        results.push({ slot: c.slotKey, outcome: 'no-event' })
        continue
      }
      const marketIdBn = log.args.id          // already a bigint from parseEventLogs
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
        await publicClient.waitForTransactionReceipt({ hash: seedHash })
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
