import { describe, it, expect } from 'vitest'
import { keccak256, toHex } from 'viem'
import { asUTC, categoryFor, deriveOutcomes, marketDefinition } from './definition'

describe('categoryFor', () => {
  it('maps each template key to its category', () => {
    expect(categoryFor('crypto_price_above')).toBe('crypto')
    expect(categoryFor('crypto_price_below')).toBe('crypto')
    expect(categoryFor('sports_winner')).toBe('sports')
    expect(categoryFor('sports_score')).toBe('sports')
    expect(categoryFor('youtube_views')).toBe('youtube')
    expect(categoryFor('youtube_subs')).toBe('youtube')
  })
})

describe('deriveOutcomes', () => {
  it('returns Yes/No for crypto templates', () => {
    expect(deriveOutcomes('crypto_price_above', {})).toEqual(['Yes', 'No'])
    expect(deriveOutcomes('crypto_price_below', {})).toEqual(['Yes', 'No'])
  })

  it('returns home/away/Draw for sports_winner', () => {
    expect(deriveOutcomes('sports_winner', { homeTeam: 'Arsenal', awayTeam: 'Chelsea' })).toEqual(['Arsenal', 'Chelsea', 'Draw'])
  })

  it('falls back to Home/Away when teams are missing', () => {
    expect(deriveOutcomes('sports_winner', {})).toEqual(['Home', 'Away', 'Draw'])
  })

  it('returns Over/Under for sports_score', () => {
    expect(deriveOutcomes('sports_score', {})).toEqual(['Over', 'Under'])
  })
})

describe('marketDefinition', () => {
  it('builds the crypto ABOVE question using coinName', () => {
    const text = marketDefinition('crypto_price_above', { coin: 'bitcoin', coinName: 'Bitcoin', target: '105000', resolveAt: '2026-07-10T15:00' })
    expect(text).toBe('Will Bitcoin be ABOVE $105000 at 2026-07-10T15:00 UTC? (CoinGecko)')
  })

  it('builds the crypto BELOW question', () => {
    const text = marketDefinition('crypto_price_below', { coin: 'ethereum', coinName: 'Ethereum', target: '3000', resolveAt: '2026-07-11T00:00' })
    expect(text).toBe('Will Ethereum be BELOW $3000 at 2026-07-11T00:00 UTC? (CoinGecko)')
  })

  it('produces a definition whose keccak256 hash is reproducible', () => {
    const p = { coin: 'solana', coinName: 'Solana', target: '200', resolveAt: '2026-07-12T12:00' }
    const text = marketDefinition('crypto_price_above', p)
    expect(keccak256(toHex(text))).toBe(keccak256(toHex('Will Solana be ABOVE $200 at 2026-07-12T12:00 UTC? (CoinGecko)')))
  })
})

describe('asUTC', () => {
  it('interprets a minute-precision datetime-local string as UTC', () => {
    expect(asUTC('2026-07-10T15:00').toISOString()).toBe('2026-07-10T15:00:00.000Z')
  })
})
