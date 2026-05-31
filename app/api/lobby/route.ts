import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_POP_CONTRACT!

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const template = searchParams.get('template')
  const minStake = searchParams.get('minStake')
  const maxStake = searchParams.get('maxStake')

  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (db.from('bets') as any)
    .select('*')
    .eq('contract_address', CONTRACT_ADDRESS)
    .eq('status', 'Open')
    .gt('claim_deadline', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (template) query = query.eq('template_key', template)
  if (minStake) query = query.gte('stake', minStake)
  if (maxStake) query = query.lte('stake', maxStake)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}
