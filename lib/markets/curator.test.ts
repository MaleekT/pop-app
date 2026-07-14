import { describe, it, expect } from 'vitest'
import { keccak256, toHex } from 'viem'
import { cryptoSlotKey, generateCryptoCandidates, generateSportsCandidates } from './curator'
import { BOARD_TARGET, TARGET_OPEN_PER_COIN } from './curator-config'

// Fixed clock so resolveAt strings are deterministic.
const NOW = Date.UTC(2026, 6, 10, 12, 0, 0) // 2026-07-10T12:00:00Z
const ALL_PRICES = { bitcoin: 100_000, ethereum: 4_000, solana: 200 }

describe('cryptoSlotKey', () => {
  it('joins identity parts with pipes', () => {
    expect(cryptoSlotKey('bitcoin', 'crypto_price_above', 'up5', '24h')).toBe('bitcoin|crypto_price_above|up5|24h')
  })
})

describe('generateCryptoCandidates', () => {
  it('spreads across coins and directions instead of filling one coin', () => {
    const candidates = generateCryptoCandidates({
      prices: ALL_PRICES,
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: 3,
    })

    expect(candidates).toHaveLength(3)
    // One market per coin — the whole point of the diversity fix (was all-Bitcoin before).
    expect(new Set(candidates.map((c) => c.params.coin))).toEqual(new Set(['bitcoin', 'ethereum', 'solana']))
    // And not all "above".
    expect(new Set(candidates.map((c) => c.templateKey)).size).toBeGreaterThan(1)
  })

  // Read the cap from config rather than hardcoding it: crypto is the board's guaranteed filler,
  // so this number gets retuned whenever the board target moves, and the test should follow it.
  it('respects the per-coin cap across a large limit', () => {
    const candidates = generateCryptoCandidates({
      prices: ALL_PRICES,
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: 99,
    })

    expect(candidates).toHaveLength(3 * TARGET_OPEN_PER_COIN)
    for (const coin of ['bitcoin', 'ethereum', 'solana']) {
      expect(candidates.filter((c) => c.params.coin === coin)).toHaveLength(TARGET_OPEN_PER_COIN)
    }
  })

  it('creates nothing for a coin already at its per-coin cap', () => {
    const candidates = generateCryptoCandidates({
      prices: ALL_PRICES,
      existingSlotKeys: new Set(),
      openCountByCoin: { bitcoin: TARGET_OPEN_PER_COIN },
      now: NOW,
      limit: 99,
    })

    expect(candidates.some((c) => c.params.coin === 'bitcoin')).toBe(false)
    expect(candidates).toHaveLength(2 * TARGET_OPEN_PER_COIN) // ethereum + solana only
  })

  // The per-coin cap must be able to carry the whole board on its own, or a fixture drought
  // drops the board under BOARD_MIN and the 12-market floor the user asked for is a lie.
  it('can fill the entire board target from crypto alone', () => {
    const candidates = generateCryptoCandidates({
      prices: ALL_PRICES,
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: BOARD_TARGET,
    })
    expect(candidates).toHaveLength(BOARD_TARGET)
  })

  it('computes the ABOVE target, outcomes, resolveAt, and a matching hash', () => {
    const [c] = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: 1,
    })

    expect(c.params.coin).toBe('bitcoin')
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

  it('skips a slot that already exists and moves to the coin’s next one', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(['bitcoin|crypto_price_above|up5|24h']),
      openCountByCoin: {},
      now: NOW,
      limit: 1,
    })

    expect(candidates).toHaveLength(1)
    expect(candidates[0].slotKey).toBe('bitcoin|crypto_price_below|down5|24h') // next slot for bitcoin
  })

  it('emits BELOW markets with a discounted target', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 100_000 },
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: 2,
    })

    const below = candidates.find((c) => c.templateKey === 'crypto_price_below')
    expect(below).toBeDefined()
    expect(below?.params.target).toBe('95000') // round(100000 * 0.95)
  })

  it('skips coins with no or non-positive price', () => {
    const candidates = generateCryptoCandidates({
      prices: { bitcoin: 0, ethereum: 4_000 },
      existingSlotKeys: new Set(),
      openCountByCoin: {},
      now: NOW,
      limit: 3,
    })

    expect(candidates.length).toBeGreaterThan(0)
    expect(candidates.every((c) => c.params.coin === 'ethereum')).toBe(true)
  })

  it('returns nothing when the limit is zero or negative', () => {
    const args = { prices: { bitcoin: 100_000 }, existingSlotKeys: new Set<string>(), openCountByCoin: {}, now: NOW }
    expect(generateCryptoCandidates({ ...args, limit: 0 })).toEqual([])
    expect(generateCryptoCandidates({ ...args, limit: -5 })).toEqual([])
  })
})

describe('generateSportsCandidates', () => {
  const fixture = (id: string, home: string, away: string, hoursOut: number, sport: 'football' | 'basketball' = 'football') => ({
    id,
    homeTeam: home,
    awayTeam: away,
    sport,
    date: new Date(NOW + hoursOut * 3_600_000).toISOString(),
    // Ranking (competitive before preseason) happens upstream in rankFixtures; this generator
    // just preserves the order it is handed. See sports-fixtures.test.ts for that.
    league: 'Club Friendlies',
    competitive: false,
  })

  it('builds a 3-way sports_winner market resolving 3h after kick-off', () => {
    const [c] = generateSportsCandidates({
      fixtures: [fixture('tsdb:1', 'Real Madrid', 'Barcelona', 24)],
      existingFixtureIds: new Set(),
      now: NOW,
      limit: 5,
    })

    expect(c.category).toBe('sports')
    expect(c.templateKey).toBe('sports_winner')
    expect(c.params.fixtureId).toBe('tsdb:1')
    expect(c.outcomes).toEqual(['Real Madrid', 'Barcelona']) // 2-way "draw no bet"
    expect(c.definitionText).toBe('Real Madrid vs Barcelona: who wins? (football fixture tsdb:1)')
    expect(c.definitionHash).toBe(keccak256(toHex(c.definitionText)))
    expect(c.params.resolveAt).toBe(new Date(NOW + 27 * 3_600_000).toISOString().slice(0, 16)) // kickoff + 3h
  })

  it('skips fixtures already listed and respects the limit', () => {
    const out = generateSportsCandidates({
      fixtures: [fixture('tsdb:1', 'A', 'B', 24), fixture('tsdb:2', 'C', 'D', 24), fixture('tsdb:3', 'E', 'F', 24)],
      existingFixtureIds: new Set(['tsdb:1']),
      now: NOW,
      limit: 1,
    })
    expect(out).toHaveLength(1)
    expect(out[0].params.fixtureId).toBe('tsdb:2')
  })

  it('skips fixtures whose kick-off + 3h is already past', () => {
    const out = generateSportsCandidates({
      fixtures: [fixture('tsdb:1', 'A', 'B', -6)],
      existingFixtureIds: new Set(),
      now: NOW,
      limit: 5,
    })
    expect(out).toHaveLength(0)
  })
})
