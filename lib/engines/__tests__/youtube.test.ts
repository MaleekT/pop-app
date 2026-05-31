import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from '../youtube'
import type { ResolveParams } from '../types'

const CREATOR = '0x1111111111111111111111111111111111111111' as const
const OPPONENT = '0x2222222222222222222222222222222222222222' as const

beforeEach(() => {
  vi.unstubAllGlobals()
  process.env.YOUTUBE_API_KEY = 'test-key'
})

function mockFetch(body: unknown, ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    }),
  )
}

describe('youtube_views', () => {
  const base: ResolveParams = {
    templateKey: 'youtube_views',
    params: { videoId: 'abc123', target: '1000000' },
    creator: CREATOR,
    opponent: OPPONENT,
  }

  it('creator wins when views >= target', async () => {
    mockFetch({ items: [{ statistics: { viewCount: '1500000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) {
      expect(result.winner).toBe(CREATOR)
      expect(result.rawValue).toBe('1500000')
    }
  })

  it('creator wins at exact boundary (views === target)', async () => {
    mockFetch({ items: [{ statistics: { viewCount: '1000000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })

  it('opponent wins when views < target', async () => {
    mockFetch({ items: [{ statistics: { viewCount: '500000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('returns pending when API returns no items', async () => {
    mockFetch({ items: [] })
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when API is down', async () => {
    mockFetch({}, false)
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when videoId is missing', async () => {
    const result = await resolve({ ...base, params: { target: '1000000' } })
    expect(result.pending).toBe(true)
  })

  it('sourceUrl does not contain API key', async () => {
    mockFetch({ items: [{ statistics: { viewCount: '2000000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.sourceUrl).not.toContain('test-key')
  })
})

describe('youtube_subs', () => {
  const base: ResolveParams = {
    templateKey: 'youtube_subs',
    params: { channelId: 'UCxxx', target: '100000' },
    creator: CREATOR,
    opponent: OPPONENT,
  }

  it('creator wins when subs >= target', async () => {
    mockFetch({ items: [{ statistics: { subscriberCount: '200000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) {
      expect(result.winner).toBe(CREATOR)
      expect(result.rawValue).toBe('200000')
    }
  })

  it('creator wins at exact boundary', async () => {
    mockFetch({ items: [{ statistics: { subscriberCount: '100000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })

  it('opponent wins when subs < target', async () => {
    mockFetch({ items: [{ statistics: { subscriberCount: '50000' } }] })
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('returns pending when channelId is missing', async () => {
    const result = await resolve({ ...base, params: { target: '100000' } })
    expect(result.pending).toBe(true)
  })

  it('returns pending for unknown templateKey', async () => {
    mockFetch({ items: [{ statistics: { subscriberCount: '200000' } }] })
    const result = await resolve({ ...base, templateKey: 'unknown' })
    expect(result.pending).toBe(true)
  })

  it('returns pending when target is negative', async () => {
    const result = await resolve({ ...base, params: { channelId: 'UCxxx', target: '-1' } })
    expect(result.pending).toBe(true)
  })
})
