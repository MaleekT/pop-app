import { NextRequest, NextResponse } from 'next/server'
import { createMarketsClient } from '@/lib/markets/supabase'
import { MARKET_STATUS } from '@/lib/predict/contracts'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createMarketsClient()

  const { data, error } = await db
    .from('markets')
    .select('*')
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)
    .single()

  if (error || !data) {
    return NextResponse.json(null, { status: 404 })
  }

  return NextResponse.json(data)
}

// Client mirrors an on-chain status change (e.g. 'Challenged' after a user challenges).
// Resolver-driven transitions (Proposed/Resolved/Voided) are written by the resolver.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid market id' }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { status?: string }
  if (!body.status || !(MARKET_STATUS as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('markets') as any)
    .update({ status: body.status })
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
