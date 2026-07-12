import type { MarketResolveInput, MarketResolveResult } from './types'

// Reuses the same CoinGecko source as the PvP crypto engine, but resolves to an
// outcome index instead of a winner address. Outcomes: 0 = Yes (condition met), 1 = No.
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

interface CoinGeckoPrice {
  [coin: string]: { usd: number }
}

export async function resolve(input: MarketResolveInput): Promise<MarketResolveResult> {
  const { templateKey, params } = input
  const { coin, target } = params

  if (!coin || !target) return { pending: true }

  const targetPrice = parseFloat(target)
  if (isNaN(targetPrice)) return { pending: true }

  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd`

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return { pending: true }

  const data: CoinGeckoPrice = await res.json()
  const price = data[coin]?.usd
  if (price === undefined || price === null) return { pending: true }

  let met: boolean
  if (templateKey === 'crypto_price_above') met = price > targetPrice
  else if (templateKey === 'crypto_price_below') met = price < targetPrice
  else return { pending: true }

  return {
    pending: false,
    voided: false as const,
    outcomeIndex: met ? 0 : 1,
    rawValue: String(price),
    sourceUrl: url,
    fetchedAt: new Date().toISOString(),
  }
}

// Current USD spot price for a CoinGecko coin id, or null if unavailable. Shared with
// the autonomous curator so both price reads use the same source and response shape.
export async function fetchSpotPrice(coin: string): Promise<number | null> {
  const url = `${COINGECKO_BASE}/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd`
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data: CoinGeckoPrice = await res.json()
    const price = data[coin]?.usd
    return price == null ? null : price
  } catch {
    return null
  }
}
