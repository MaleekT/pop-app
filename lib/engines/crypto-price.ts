import type { ResolveParams, ResolveResult } from './types'

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'

interface CoinGeckoPrice {
  [coin: string]: { usd: number }
}

export async function resolve(input: ResolveParams): Promise<ResolveResult> {
  const { templateKey, params, creator, opponent } = input
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

  const fetchedAt = new Date().toISOString()

  let creatorWins: boolean
  if (templateKey === 'crypto_price_above') {
    // creator bet it will be ABOVE target; creator picked this side
    creatorWins = price > targetPrice
  } else if (templateKey === 'crypto_price_below') {
    // creator bet it will be BELOW target
    creatorWins = price < targetPrice
  } else {
    return { pending: true }
  }

  return {
    pending: false,
    voided: false as const,
    winner: creatorWins ? creator : opponent,
    rawValue: String(price),
    sourceUrl: url,
    fetchedAt,
  }
}
