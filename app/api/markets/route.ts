import { NextRequest, NextResponse } from 'next/server'
import { keccak256, toHex } from 'viem'
import { createMarketsClient } from '@/lib/markets/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_PREDICT_MARKET_CONTRACT!

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status')
  const db = createMarketsClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db.from('markets') as any).select('*').eq('contract_address', CONTRACT_ADDRESS)
  if (status) query = query.eq('status', status)

  const { data } = await query.order('created_at', { ascending: false })
  return NextResponse.json(data ?? [])
}

interface CreateMarketBody {
  on_chain_id: string
  category: string
  template_key: string
  params: Record<string, string>
  outcomes: string[]
  definition_text: string
  definition_hash: string
  resolve_at: string
}

export async function POST(req: NextRequest) {
  let body: CreateMarketBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { on_chain_id, category, template_key, params, outcomes, definition_text, definition_hash, resolve_at } = body

  if (!on_chain_id || !category || !template_key || !outcomes?.length || !definition_text || !definition_hash || !resolve_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (outcomes.length < 2 || outcomes.length > 3) {
    return NextResponse.json({ error: 'outcomes must have 2 or 3 entries' }, { status: 400 })
  }

  // Server-side re-verify: keccak256(definition_text) must match definition_hash
  const computedHash = keccak256(toHex(definition_text))
  if (computedHash.toLowerCase() !== definition_hash.toLowerCase()) {
    return NextResponse.json({ error: 'definition_hash mismatch' }, { status: 400 })
  }

  const db = createMarketsClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('markets') as any).insert({
    on_chain_id,
    contract_address: CONTRACT_ADDRESS,
    category,
    template_key,
    params: params ?? {},
    outcomes,
    definition_text,
    definition_hash,
    resolve_at,
    status: 'Pending',
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Market already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
