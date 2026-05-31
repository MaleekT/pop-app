// GET /api/crypto/price?coin=bitcoin
// Server-side proxy to CoinGecko /simple/price
// Same endpoint used by lib/engines/crypto-price.ts for resolution
import { NextRequest, NextResponse } from 'next/server'

const COINGECKO = 'https://api.coingecko.com/api/v3'

export async function GET(req: NextRequest) {
  const coin = req.nextUrl.searchParams.get('coin') ?? ''

  if (!coin || !/^[a-z0-9-]+$/.test(coin)) {
    return NextResponse.json({ error: 'Invalid coin id' }, { status: 400 })
  }

  try {
    const res = await fetch(
      `${COINGECKO}/simple/price?ids=${encodeURIComponent(coin)}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10_000), next: { revalidate: 30 } },
    )

    if (!res.ok) {
      return NextResponse.json({ error: 'CoinGecko unavailable' }, { status: 502 })
    }

    const data = await res.json() as Record<string, { usd?: number }>
    const price = data[coin]?.usd

    if (price == null) {
      return NextResponse.json({ error: 'Coin not found' }, { status: 404 })
    }

    return NextResponse.json({ coin, price, fetchedAt: new Date().toISOString() })
  } catch {
    return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
  }
}
