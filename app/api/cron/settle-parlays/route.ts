import { NextRequest, NextResponse } from 'next/server'
import { runParlaySettler } from '@/lib/markets/parlay-settler'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Own cron-job.org trigger, separate from market resolution and PvP. Auto-settles
// parlay tickets whose legs have all resolved (settle() is permissionless on-chain).
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = requireEnv('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runParlaySettler()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Settler failed' }, { status: 500 })
  }
}
