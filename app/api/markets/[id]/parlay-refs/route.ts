import { NextRequest, NextResponse } from 'next/server'
import { createMarketsClient } from '@/lib/markets/supabase'

const PARLAY_ADDRESS = process.env.NEXT_PUBLIC_PARLAY_CONTRACT

// How many OPEN parlays reference this market as a leg. Used to stop the owner removing a
// market that a live parlay depends on (voiding it would cancel those tickets).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!PARLAY_ADDRESS) return NextResponse.json({ count: 0 })

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (db.from('parlays') as any)
    .select('id', { count: 'exact', head: true })
    .eq('contract_address', PARLAY_ADDRESS)
    .eq('status', 'Open')
    .contains('legs', [{ marketOnChainId: id }])

  // Fail closed: if the check errors, report a non-zero count so the owner UI blocks
  // removal rather than risk voiding a market a live parlay depends on.
  if (error) return NextResponse.json({ count: 1 }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
