import { NextRequest, NextResponse } from 'next/server'
import { runMarketResolver } from '@/lib/markets/resolver'
import { runSeedReclaim } from '@/lib/markets/reclaim'

// Sequential on-chain txs (resolve + seed reclaim) can take a while; give it room.
export const maxDuration = 60

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Separate from /api/cron/resolve (the PvP resolver). Its own cron-job.org trigger, so a
// bug in market resolution can never affect live PvP bet settlement. After resolving, it
// reclaims the owner's seed from any markets that have gone terminal.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = requireEnv('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const resolve = await runMarketResolver()
    // Reclaim is best-effort — a failure here must not mask a successful resolve.
    let reclaim: unknown
    try {
      reclaim = await runSeedReclaim()
    } catch (e) {
      reclaim = { error: e instanceof Error ? e.message : 'Reclaim failed' }
    }
    return NextResponse.json({ resolve, reclaim })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Resolver failed' }, { status: 500 })
  }
}
