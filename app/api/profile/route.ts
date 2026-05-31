import { NextRequest, NextResponse } from 'next/server'
import { getAddress } from 'viem'
import { createServerClient } from '@/lib/supabase'

const HANDLE_RE = /^[a-z0-9_]{3,20}$/

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // Batched lookup: ?addresses=addr1,addr2,...  → returns Record<address, profile>
  const addressesParam = searchParams.get('addresses')
  if (addressesParam) {
    const raw = addressesParam.split(',').filter(Boolean)
    const checksummed: string[] = []
    for (const a of raw) {
      try { checksummed.push(getAddress(a.trim())) } catch { /* skip invalid */ }
    }
    if (checksummed.length === 0) return NextResponse.json({})

    const db = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (db.from('profiles') as any)
      .select('address, handle, avatar_url')
      .in('address', checksummed)

    const map: Record<string, { address: string; handle: string | null; avatar_url: string | null }> = {}
    for (const row of (data ?? [])) map[row.address] = row
    return NextResponse.json(map)
  }

  // Single lookup: ?address=addr  → returns profile | null
  const address = searchParams.get('address')
  if (!address) return NextResponse.json(null, { status: 200 })

  let checksummed: string
  try { checksummed = getAddress(address) } catch {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (db.from('profiles') as any)
    .select('address, handle, avatar_url')
    .eq('address', checksummed)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  let body: { address?: string; handle?: string | null; avatar_url?: string | null }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { address, handle, avatar_url } = body
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 })

  let checksummed: string
  try { checksummed = getAddress(address) } catch {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 })
  }

  if (handle !== null && handle !== undefined) {
    const normalized = handle.toLowerCase()
    if (!HANDLE_RE.test(normalized)) {
      return NextResponse.json({ error: 'Handle must be 3-20 lowercase letters, numbers, or underscores.' }, { status: 400 })
    }

    const db = createServerClient()
    // Check case-insensitive uniqueness (excluding current address)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (db.from('profiles') as any)
      .select('address')
      .ilike('handle', normalized)
      .neq('address', checksummed)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ error: `@${normalized} is already taken.` }, { status: 409 })
    }

    const db2 = createServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (db2.from('profiles') as any).upsert({
      address: checksummed,
      handle: normalized,
      ...(avatar_url !== undefined ? { avatar_url } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'address' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // handle === null means clear it
  const db = createServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('profiles') as any).upsert({
    address: checksummed,
    handle: null,
    ...(avatar_url !== undefined ? { avatar_url } : {}),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'address' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
