import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createMarketsClient } from '@/lib/markets/supabase'
import type { ParlayLeg } from '@/lib/markets/db.types'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PARLAY_CONTRACT!

export async function GET(req: NextRequest) {
  const bettor = req.nextUrl.searchParams.get('bettor')
  if (!bettor) return NextResponse.json([], { status: 200 })

  let checksummed: string
  try {
    checksummed = getAddress(bettor)
  } catch {
    return NextResponse.json([], { status: 200 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db.from('parlays') as any)
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('bettor', checksummed)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

interface CreateParlayBody {
  on_chain_id: string
  bettor: string
  stake: string
  locked_multiplier: string
  legs: ParlayLeg[]
}

export async function POST(req: NextRequest) {
  let body: CreateParlayBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { on_chain_id, bettor, stake, locked_multiplier, legs } = body
  if (!on_chain_id || !bettor || !stake || !locked_multiplier || !Array.isArray(legs) || legs.length < 2) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let checksummed: string
  try {
    checksummed = getAddress(bettor)
  } catch {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('parlays') as any).insert({
    on_chain_id,
    contract_address: CONTRACT_ADDRESS,
    bettor: checksummed,
    stake,
    locked_multiplier,
    legs,
    status: 'Open',
  })

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: 'Parlay already exists' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
