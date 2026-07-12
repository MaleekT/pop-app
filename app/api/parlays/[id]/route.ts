import { NextRequest, NextResponse } from 'next/server'
import { createMarketsClient } from '@/lib/markets/supabase'
import { PARLAY_STATUS } from '@/lib/predict/contracts'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PARLAY_CONTRACT!

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createMarketsClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('parlays') as any)
    .select('*')
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)
    .single()

  if (error || !data) return NextResponse.json(null, { status: 404 })
  return NextResponse.json(data)
}

// Client mirrors an on-chain settle (Won/Lost/Refunded). The cron settler also updates this.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid parlay id' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !(PARLAY_STATUS as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('parlays') as any)
    .update({ status: body.status })
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
