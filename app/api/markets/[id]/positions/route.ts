import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createMarketsClient } from '@/lib/markets/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!

async function marketDbId(db: ReturnType<typeof createMarketsClient>, onChainId: string): Promise<number | null> {
  const { data } = await db
    .from('markets')
    .select('id')
    .eq('on_chain_id', onChainId)
    .eq('contract_address', CONTRACT_ADDRESS)
    .single()
  return (data as { id: number } | null)?.id ?? null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createMarketsClient()

  const marketId = await marketDbId(db, id)
  if (marketId == null) return NextResponse.json([], { status: 200 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db.from('market_positions') as any)
    .select('*')
    .eq('market_id', marketId)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

interface PositionBody {
  bettor: string
  outcome_index: number
  amount: string
  tx_hash?: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let body: PositionBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (body.outcome_index == null || !body.amount || !body.bettor) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let bettor: string
  try {
    bettor = getAddress(body.bettor)
  } catch {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const db = createMarketsClient()
  const marketId = await marketDbId(db, id)
  if (marketId == null) return NextResponse.json({ error: 'Market not found' }, { status: 404 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('market_positions') as any).insert({
    market_id: marketId,
    bettor,
    outcome_index: body.outcome_index,
    amount: body.amount,
    tx_hash: body.tx_hash ?? null,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
