import { NextRequest, NextResponse } from 'next/server'
import { runMarketResolver } from '@/lib/markets/resolver'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Separate from /api/cron/resolve (the PvP resolver). Its own cron-job.org trigger,
// so a bug in market resolution can never affect live PvP bet settlement.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = requireEnv('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMarketResolver()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Resolver failed' }, { status: 500 })
  }
}
