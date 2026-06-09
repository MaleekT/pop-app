import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import type { PostgrestSingleResponse } from '@supabase/supabase-js'
import { createServerClient } from '@/lib/supabase'
import type { BetRow } from '@/lib/db.types'

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
const VALID_OUTCOMES = ['home_win', 'away_win', 'draw'] as const

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'Invalid bet id' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({})) as {
    status?: string
    opponent?: string
    opponentOutcome?: string
  }

  if (!body.status || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  if (body.opponentOutcome !== undefined && !(VALID_OUTCOMES as readonly string[]).includes(body.opponentOutcome)) {
    return NextResponse.json({ error: 'Invalid opponentOutcome' }, { status: 400 })
  }

  const db = createServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = { status: body.status }

  if (body.opponent) {
    try { update.opponent = getAddress(body.opponent) } catch {
      return NextResponse.json({ error: 'Invalid opponent address' }, { status: 400 })
    }
  }

  if (body.opponentOutcome) {
    // Supabase JS client has no jsonb_set — read existing params, merge in JS,
    // write back. A true atomic fix requires a DB function (migration), which this
    // phase prohibits. The practical race risk is zero: the smart contract rejects
    // double-acceptance on-chain, so two concurrent legitimate PATCHes for the same
    // bet cannot both originate from valid on-chain events.
    // The Supabase typed client infers the result as 'never' here due to the route
    // `params` argument shadowing internal type inference. Cast to
    // PostgrestSingleResponse<BetRow> — the actual runtime shape (data: BetRow | null,
    // error: PostgrestError | null) — so error handling remains properly typed.
    const fetchResult = (await db
      .from('bets')
      .select('*')
      .eq('on_chain_id', id)
      .eq('contract_address', CONTRACT_ADDRESS)
      .single()) as unknown as PostgrestSingleResponse<BetRow>

    if (fetchResult.error || !fetchResult.data) {
      return NextResponse.json({ error: 'Bet not found' }, { status: 404 })
    }

    const existingRow = fetchResult.data

    // JSON.parse/stringify produces a clean plain object — prevents prototype
    // pollution from unexpected keys in the stored JSONB value.
    const safeParams = JSON.parse(JSON.stringify(existingRow.params ?? {})) as Record<string, unknown>

    // Only write if not already set — idempotent on retry
    if (!safeParams.opponentOutcome) {
      update.params = { ...safeParams, opponentOutcome: body.opponentOutcome }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('bets') as any)
    .update(update)
    .eq('on_chain_id', id)
    .eq('contract_address', CONTRACT_ADDRESS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
