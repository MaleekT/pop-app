import { NextRequest, NextResponse } from 'next/server'
import { runCurator } from '@/lib/markets/curator'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`${key} not configured`)
  return val
}

// Separate cron from /api/cron/resolve-markets and the PvP resolver. Its own
// cron-job.org trigger (e.g. every 6h), so a bug in curation can never affect market
// resolution or live PvP settlement.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = requireEnv('CRON_SECRET')
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCurator()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Curator failed' }, { status: 500 })
  }
}
