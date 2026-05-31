import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerClient } from '@/lib/supabase'
import type { InviteRow } from '@/lib/db.types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = createServerClient()

  const { data, error } = await (db.from('bet_invites') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: InviteRow | null; error: unknown }>
      }
    }
  }).select('*').eq('id', code).single()

  if (error || !data) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const body = await req.json() as { opponent: string }

  if (!body.opponent) {
    return NextResponse.json({ error: 'Missing opponent address' }, { status: 400 })
  }

  let opponent: string
  try {
    opponent = getAddress(body.opponent)
  } catch {
    return NextResponse.json({ error: 'Invalid opponent address' }, { status: 400 })
  }

  const db = createServerClient()

  const { data: existing } = await (db.from('bet_invites') as unknown as {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        single: () => Promise<{ data: InviteRow | null; error: unknown }>
      }
    }
  }).select('status, creator').eq('id', code).single()

  if (!existing) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }
  if (existing.status !== 'open') {
    return NextResponse.json({ error: 'Invite is no longer open' }, { status: 409 })
  }
  if (existing.creator.toLowerCase() === opponent.toLowerCase()) {
    return NextResponse.json({ error: 'Cannot bet against yourself' }, { status: 400 })
  }

  await (db.from('bet_invites') as unknown as {
    update: (vals: object) => { eq: (col: string, val: string) => Promise<unknown> }
  }).update({ pending_opponent: opponent }).eq('id', code)

  return NextResponse.json({ ok: true })
}
