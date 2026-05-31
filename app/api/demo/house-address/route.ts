import { NextResponse } from 'next/server'
import { privateKeyToAccount } from 'viem/accounts'

export async function GET() {
  const key = process.env.HOUSE_PRIVATE_KEY as `0x${string}` | undefined
  if (!key) return NextResponse.json({ error: 'House not configured' }, { status: 503 })
  const { address } = privateKeyToAccount(key)
  return NextResponse.json({ address })
}
