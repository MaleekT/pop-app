import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from '../crypto-price'
import type { ResolveParams } from '../types'

const CREATOR = '0x1111111111111111111111111111111111111111' as const
const OPPONENT = '0x2222222222222222222222222222222222222222' as const

const base: ResolveParams = {
  templateKey: 'crypto_price_above',
  params: { coin: 'bitcoin', target: '100000' },
  creator: CREATOR,
  opponent: OPPONENT,
}

function mockFetch(price: number | null, ok = true) {
  const body = price !== null ? JSON.stringify({ bitcoin: { usd: price } }) : JSON.stringify({})
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(JSON.parse(body)),
    }),
  )
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('crypto_price_above', () => {
  it('creator wins when price is above target', async () => {
    mockFetch(105000)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) {
      expect(result.winner).toBe(CREATOR)
      expect(result.rawValue).toBe('105000')
    }
  })

  it('opponent wins when price is below target', async () => {
    mockFetch(95000)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('opponent wins at exact boundary (price === target is NOT above)', async () => {
    mockFetch(100000)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('returns pending when API is down', async () => {
    mockFetch(null, false)
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when coin missing from response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }),
    )
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })
})

describe('crypto_price_below', () => {
  const belowBase: ResolveParams = { ...base, templateKey: 'crypto_price_below' }

  it('creator wins when price is below target', async () => {
    mockFetch(80000)
    const result = await resolve(belowBase)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })

  it('opponent wins when price is above target', async () => {
    mockFetch(120000)
    const result = await resolve(belowBase)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('opponent wins at exact boundary (price === target is NOT below)', async () => {
    mockFetch(100000)
    const result = await resolve(belowBase)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })
})

describe('edge cases', () => {
  it('returns pending when target is missing', async () => {
    const result = await resolve({ ...base, params: { coin: 'bitcoin' } })
    expect(result.pending).toBe(true)
  })

  it('returns pending when coin is missing', async () => {
    const result = await resolve({ ...base, params: { target: '100000' } })
    expect(result.pending).toBe(true)
  })

  it('returns pending for unknown templateKey', async () => {
    mockFetch(100000)
    const result = await resolve({ ...base, templateKey: 'unknown_key' })
    expect(result.pending).toBe(true)
  })
})
