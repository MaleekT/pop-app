import { createWalletClient, createPublicClient, http, keccak256, toHex, parseEventLogs } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { arcTestnet } from 'viem/chains'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import { fetchSpotPrice } from '@/lib/markets/engines/crypto-price'
import { marketDefinition, deriveOutcomes, asUTC } from '@/lib/markets/definition'
import { CRYPTO_COINS, PRICE_BANDS, HORIZONS, TARGET_OPEN_PER_COIN, MAX_CREATES_PER_RUN, type CryptoCoin, type PriceBand, type Horizon } from '@/lib/markets/curator-config'
import type { MarketRow } from '@/lib/markets/db.types'

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

// Keeps the target number of open crypto markets alive. Reuses the owner=resolver
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

  const openCryptoCount = open.filter((m) => m.category === 'crypto').length
  if (openCryptoCount >= CRYPTO_COINS.length * TARGET_OPEN_PER_COIN) {
    return { created: 0, results: [{ slot: '-', outcome: 'crypto-at-target' }] }
  }

  // Guards passed and we intend to create — build the signing client once.
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http(rpc) })

  const prices: Record<string, number> = {}
  for (const coin of CRYPTO_COINS) {
    const price = await fetchSpotPrice(coin.id)
    if (price != null) prices[coin.id] = price
  }

  const candidates = generateCryptoCandidates({
    prices,
    existingSlotKeys: openCryptoSlotKeys(open),
    openCountByCoin: openCryptoCountByCoin(open),
    now: Date.now(),
    limit: MAX_CREATES_PER_RUN,
  })

  const results: CuratorLog[] = []
  let created = 0

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
      const marketId = log.args.id.toString()

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
        // The market is live on-chain but the DB mirror failed. Stop the run rather than
        // create more markets we can't mirror (bounds orphans during a DB write outage).
        console.error(`curator: DB mirror failed for market ${marketId} (${c.slotKey}):`, insErr.message)
        results.push({ slot: c.slotKey, outcome: 'created-mirror-failed', id: marketId })
        break
      }
      // Counts only fully live markets (on-chain + mirrored); orphans stay in `results`.
      created++
      results.push({ slot: c.slotKey, outcome: 'created', id: marketId })
    } catch (err) {
      // First failure is almost always gas exhaustion; stop the run rather than hammer.
      console.error(`curator: createMarket failed for ${c.slotKey}:`, err)
      results.push({ slot: c.slotKey, outcome: 'tx-failed' })
      break
    }
  }

  return { created, results }
}
