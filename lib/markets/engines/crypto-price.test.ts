import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolve, fetchSpotPrice } from './crypto-price'

function mockFetch(body: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('crypto-price resolve', () => {
  it('resolves ABOVE to Yes (index 0) when the price clears the target', async () => {
    mockFetch({ bitcoin: { usd: 120_000 } })
    const r = await resolve({ templateKey: 'crypto_price_above', params: { coin: 'bitcoin', target: '100000' }, outcomeCount: 2 })
    expect(r.pending).toBe(false)
    if (!r.pending && !r.voided) {
      expect(r.outcomeIndex).toBe(0)
      expect(r.rawValue).toBe('120000')
    }
  })

  it('resolves ABOVE to No (index 1) when the price is under the target', async () => {
    mockFetch({ bitcoin: { usd: 90_000 } })
    const r = await resolve({ templateKey: 'crypto_price_above', params: { coin: 'bitcoin', target: '100000' }, outcomeCount: 2 })
    expect(r.pending).toBe(false)
    if (!r.pending && !r.voided) expect(r.outcomeIndex).toBe(1)
  })

  it('resolves BELOW to Yes (index 0) when the price is under the target', async () => {
    mockFetch({ ethereum: { usd: 2_500 } })
    const r = await resolve({ templateKey: 'crypto_price_below', params: { coin: 'ethereum', target: '3000' }, outcomeCount: 2 })
    expect(r.pending).toBe(false)
    if (!r.pending && !r.voided) expect(r.outcomeIndex).toBe(0)
  })

  it('is pending when required params are missing', async () => {
    const r = await resolve({ templateKey: 'crypto_price_above', params: {}, outcomeCount: 2 })
    expect(r.pending).toBe(true)
  })

  it('is pending when the upstream response is not ok', async () => {
    mockFetch({}, false)
    const r = await resolve({ templateKey: 'crypto_price_above', params: { coin: 'bitcoin', target: '100000' }, outcomeCount: 2 })
    expect(r.pending).toBe(true)
  })
})

describe('fetchSpotPrice', () => {
  it('returns the usd price for a coin', async () => {
    mockFetch({ solana: { usd: 200 } })
    expect(await fetchSpotPrice('solana')).toBe(200)
  })

  it('returns null when the response is not ok', async () => {
    mockFetch({}, false)
    expect(await fetchSpotPrice('solana')).toBeNull()
  })

  it('returns null when the coin is absent from the response', async () => {
    mockFetch({ bitcoin: { usd: 1 } })
    expect(await fetchSpotPrice('solana')).toBeNull()
  })
})
