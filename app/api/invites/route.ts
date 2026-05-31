import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerClient } from '@/lib/supabase'
import type { InviteRow } from '@/lib/db.types'

function friendlyDbError(error: unknown): string {
  const msg = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message: string }).message)
    : JSON.stringify(error)

  if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED')) {
    return 'Cannot reach the database. Your Supabase project may be paused — go to supabase.com/dashboard and restore it, then try again.'
  }
  if (msg.includes('does not exist') || msg.includes('42P01')) {
    return 'The bet_invites table does not exist. Run the migration SQL in your Supabase SQL Editor (see supabase/migrations/002_create_invites.sql).'
  }
  return msg
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    creator: string
    template_key: string
    params: Record<string, string>
    definition_text: string
    definition_hash: string
    resolve_at: string
    join_deadline: string
    stake: string
  }

  const {
    creator, template_key, params, definition_text,
    definition_hash, resolve_at, join_deadline, stake,
  } = body

  if (!creator || !template_key || !params || !definition_text || !definition_hash || !resolve_at || !join_deadline || !stake) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  let checksummedCreator: string
  try {
    checksummedCreator = getAddress(creator)
  } catch {
    return NextResponse.json({ error: 'Invalid creator address' }, { status: 400 })
  }

  const db = createServerClient()
  const { data, error } = await (db.from('bet_invites') as unknown as {
    insert: (row: object) => { select: (cols: string) => { single: () => Promise<{ data: InviteRow | null; error: unknown }> } }
  }).insert({
    creator: checksummedCreator,
    template_key,
    params,
    definition_text,
    definition_hash,
    resolve_at,
    join_deadline,
    stake,
  }).select('id').single()

  if (error) {
    const detail = friendlyDbError(error)
    console.error('[invites POST] DB error:', detail)
    return NextResponse.json({ error: 'Failed to create invite', detail }, { status: 500 })
  }

  return NextResponse.json({ id: (data as { id: string }).id })
}
