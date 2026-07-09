import { describe, it, expect } from 'vitest'
import { keccak256, toHex } from 'viem'
import { cryptoSlotKey, generateCryptoCandidates } from './curator'

// Fixed clock so resolveAt strings are deterministic.
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0) // 2026-07-10T12:00:00Z

describe('cryptoSlotKey', () => {
  it('joins identity parts with pipes', () => {
    expect(cryptoSlotKey('bitcoin', 'crypto_price_above', 'up5', '24h')).toBe('bitcoin|crypto_price_above|up5|24h')
  })
})

describe('generateCryptoCandidates', () => {
  it('fills the first slots for the first coin and respects the limit', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 100_000, ethereum: 4_000, solana: 200 },
      existingSlotKeys: new Set(),
      now: NOW,
      limit: 3,
    })

    expect(candidates).toHaveLength(3)
    expect(candidates.every((c) => c.params.coin === 'bitcoin')).toBe(true)
    expect(candidates.map((c) => c.slotKey)).toEqual([
      'bitcoin|crypto_price_above|up5|24h',
      'bitcoin|crypto_price_above|up5|3d',
      'bitcoin|crypto_price_above|up5|7d',
    ])
  })

  it('computes the ABOVE target, outcomes, resolveAt, and a matching hash', () => {
    const [c] = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(),
      now: NOW,
      limit: 1,
    })

    expect(c.templateKey).toBe('crypto_price_above')
    expect(c.params.target).toBe('105000') // round(100000 * 1.05)
    expect(c.params.coinName).toBe('Bitcoin')
    expect(c.params.band).toBe('up5')
    expect(c.params.horizon).toBe('24h')
    expect(c.params.resolveAt).toBe('2026-07-11T12:00') // NOW + 24h, minute precision
    expect(c.outcomes).toEqual(['Yes', 'No'])
    expect(c.definitionText).toBe('Will Bitcoin be ABOVE $105000 at 2026-07-11T12:00 UTC? (CoinGecko)')
    expect(c.definitionHash).toBe(keccak256(toHex(c.definitionText)))
  })

  it('skips slots that already exist', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(['bitcoin|crypto_price_above|up5|24h']),
      now: NOW,
      limit: 3,
    })

    expect(candidates.map((c) => c.slotKey)).not.toContain('bitcoin|crypto_price_above|up5|24h')
    expect(candidates).toHaveLength(3)
  })

  it('emits BELOW markets with a discounted target', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(),
      now: NOW,
      limit: 9,
    })

    const below = candidates.find((c) => c.slotKey === 'bitcoin|crypto_price_below|down5|24h')
    expect(below).toBeDefined()
    expect(below?.templateKey).toBe('crypto_price_below')
    expect(below?.params.target).toBe('95000') // round(100000 * 0.95)
  })

  it('skips coins with no or non-positive price', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 0, ethereum: 4_000 },
      existingSlotKeys: new Set(),
      now: NOW,
      limit: 3,
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.params.coin === 'ethereum')).toBe(true)
  })

  it('returns nothing when the limit is zero or negative', () => {
    const args = { prices: { bitcoin: 100_000 }, existingSlotKeys: new Set<string>(), now: NOW }
    expect(generateCryptoCandidates({ ...args, limit: 0 })).toEqual([])
    expect(generateCryptoCandidates({ ...args, limit: -5 })).toEqual([])
  })
})
