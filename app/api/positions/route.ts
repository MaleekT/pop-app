import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createMarketsClient } from '@/lib/markets/supabase'
import type { MarketRow } from '@/lib/markets/db.types'

// Returns the distinct markets a wallet holds a position in, for the "my positions" view.
export async function GET(req: NextRequest) {
  const bettor = req.nextUrl.searchParams.get('bettor')
  if (!bettor) return NextResponse.json([], { status: 200 })

  let checksummed: string
  try {
    checksummed = getAddress(bettor)
  } catch {
    return NextResponse.json([], { status: 200 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db.from('market_positions') as any)
    .select('markets(*)')
    .eq('bettor', checksummed)

  const rows = (data ?? []) as { markets: MarketRow | null }[]
  const unique = new Map<string, MarketRow>()
  for (const row of rows) {
    const m = row.markets
    if (m) unique.set(`${m.contract_address}-${m.on_chain_id}`, m)
  }

  return NextResponse.json([...unique.values()])
}
