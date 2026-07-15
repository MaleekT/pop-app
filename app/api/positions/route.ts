import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createMarketsClient } from '@/lib/markets/supabase'
import type { MarketRow } from '@/lib/markets/db.types'

// on_chain_id is unique only PER contract, so every redeploy restarts ids at 1 and the shared
// `markets` table holds rows from past deployments sharing ids with live ones. A position must be
// scoped to the LIVE contract: otherwise a stale position links by bare id to a DIFFERENT current
// market, and it never resolves (the resolver only touches the live contract) so it shows "Resolving"
// forever. The `!inner` join makes the contract filter drop non-live positions instead of nulling them.
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!

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
    .select('outcome_index, markets!inner(*)')
    .eq('bettor', checksummed)
    .eq('markets.contract_address', CONTRACT_ADDRESS)

  // Attach the wallet's backed outcome to each market so the UI can tell won from lost.
  const rows = (data ?? []) as { outcome_index: number; markets: MarketRow | null }[]
  const unique = new Map<string, MarketRow & { outcomeIndex: number }>()
  for (const row of rows) {
    const m = row.markets
    if (m) unique.set(`${m.contract_address}-${m.on_chain_id}`, { ...m, outcomeIndex: row.outcome_index })
  }

  return NextResponse.json([...unique.values()])
}
