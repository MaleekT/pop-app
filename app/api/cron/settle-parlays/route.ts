import { NextRequest, NextResponse } from 'next/server'
import { runParlaySettler } from '@/lib/markets/parlay-settler'
import { topUpHouseIfLow } from '@/lib/markets/house'

// Sequential on-chain txs (settle + house top-up) can take a while; give it room.
export const maxDuration = 60

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Own cron-job.org trigger, separate from market resolution and PvP. Auto-settles parlay
// tickets whose legs have all resolved, then tops up the parlay house pool if it is low.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = requireEnv('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const settle = await runParlaySettler()
    // House top-up is best-effort — a failure here must not mask a successful settle.
    let house: unknown
    try {
      house = await topUpHouseIfLow()
    } catch (e) {
      house = { error: e instanceof Error ? e.message : 'House top-up failed' }
    }
    return NextResponse.json({ settle, house })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Settler failed' }, { status: 500 })
  }
}
