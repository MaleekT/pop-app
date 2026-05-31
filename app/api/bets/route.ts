import { NextRequest, NextResponse } from 'next/server'
import { keccak256, toHex, getAddress } from 'viem'
import { createServerClient } from '@/lib/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POP_CONTRACT!

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address')
  if (!address) return NextResponse.json([], { status: 200 })

  let checksummed: string
  try { checksummed = getAddress(address) } catch { return NextResponse.json([], { status: 200 }) }

  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db.from('bets') as any)
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .or(`creator.eq.${checksummed},opponent.eq.${checksummed}`)
    .order('created_at', { ascending: false })

  return NextResponse.json(data ?? [])
}

interface CreateBetBody {
  on_chain_id: string
  creator: string
  opponent: string
  stake: string
  definition_text: string
  definition_hash: string
  template_key: string
  params: Record<string, string>
  resolve_at: string
  claim_deadline?: string
}

export async function POST(req: NextRequest) {
  let body: CreateBetBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { on_chain_id, creator, opponent, stake, definition_text, definition_hash, template_key, params, resolve_at, claim_deadline } = body

  if (!on_chain_id || !creator || !stake || !definition_text || !definition_hash || !template_key || !resolve_at) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // Server-side re-verify: keccak256(definition_text) must match definition_hash
  const computedHash = keccak256(toHex(definition_text))
  if (computedHash.toLowerCase() !== definition_hash.toLowerCase()) {
    return NextResponse.json({ error: 'definition_hash mismatch' }, { status: 400 })
  }

  // Checksum addresses before storing
  let checksummedCreator: string
  let checksummedOpponent: string
  try {
    checksummedCreator = getAddress(creator)
    checksummedOpponent = opponent ? getAddress(opponent) : ''
  } catch {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const isOpen = !opponent
  if (isOpen && !claim_deadline) {
    return NextResponse.json({ error: 'claim_deadline required for open bets' }, { status: 400 })
  }

  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('bets') as any).insert({
    on_chain_id,
    contract_address: CONTRACT_ADDRESS,
    creator: checksummedCreator,
    opponent: checksummedOpponent,
    stake,
    definition_text,
    definition_hash,
    template_key,
    params: params ?? {},
    resolve_at,
    claim_deadline: claim_deadline ?? null,
    status: isOpen ? 'Open' : 'Pending',
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Bet already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true }, { status: 201 })
}
