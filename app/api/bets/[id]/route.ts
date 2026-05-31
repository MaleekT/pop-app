import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerClient } from '@/lib/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POP_CONTRACT!

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServerClient()

  const { data, error } = await db.from('bets').select('*')
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)
    .single()

  if (error || !data) {
    return NextResponse.json(null, { status: 404 })
  }

  return NextResponse.json(data)
}

const VALID_STATUSES = ['Pending', 'Locked', 'Proposed', 'Resolved', 'Disputed', 'Cancelled', 'Expired', 'Open', 'Voided'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { status?: string; opponent?: string }

  if (!body.status || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, string> = { status: body.status }
  if (body.opponent) {
    try { update.opponent = getAddress(body.opponent) } catch {
      return NextResponse.json({ error: 'Invalid opponent address' }, { status: 400 })
    }
  }

  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('bets') as any)
    .update(update)
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
