import { describe, it, expect, vi, beforeEach } from 'vitest'
import { resolve } from '../sports'
import type { ResolveParams } from '../types'

const CREATOR = '0x1111111111111111111111111111111111111111' as const
const OPPONENT = '0x2222222222222222222222222222222222222222' as const

beforeEach(() => {
  vi.unstubAllGlobals()
})

function mockEvent(
  strStatus: string,
  strHomeTeam: string,
  strAwayTeam: string,
  intHomeScore: string | null,
  intAwayScore: string | null,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          events: [{ strStatus, strHomeTeam, strAwayTeam, intHomeScore, intAwayScore }],
        }),
    }),
  )
}

describe('sports_winner', () => {
  const base: ResolveParams = {
    templateKey: 'sports_winner',
    params: { fixtureId: '12345', pickedTeam: 'Manchester City' },
    creator: CREATOR,
    opponent: OPPONENT,
  }

  it('creator wins when picked team won', async () => {
    mockEvent('Match Finished', 'Manchester City', 'Arsenal', '2', '1')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })

  it('opponent wins when picked team lost', async () => {
    mockEvent('Match Finished', 'Manchester City', 'Arsenal', '1', '2')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('opponent wins when picked team drew', async () => {
    mockEvent('Match Finished', 'Manchester City', 'Arsenal', '1', '1')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('returns pending when match not finished yet', async () => {
    mockEvent('In Progress', 'Manchester City', 'Arsenal', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns voided when match is Postponed', async () => {
    mockEvent('Postponed', 'Manchester City', 'Arsenal', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending) {
      expect(result.voided).toBe(true)
      if (result.voided) expect(result.evidence.rawStatus).toBe('Postponed')
    }
  })

  it('returns voided when match is Cancelled', async () => {
    mockEvent('Cancelled', 'Manchester City', 'Arsenal', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending) expect(result.voided).toBe(true)
  })

  it('returns voided when match is Abandoned', async () => {
    mockEvent('Abandoned', 'Manchester City', 'Arsenal', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending) expect(result.voided).toBe(true)
  })

  it('returns voided when match has Walkover', async () => {
    mockEvent('Walkover', 'Manchester City', 'Arsenal', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending) expect(result.voided).toBe(true)
  })

  it('returns pending when API returns 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
    )
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when events array is null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: null }),
      }),
    )
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when picked team name does not match either team', async () => {
    mockEvent('Match Finished', 'Chelsea', 'Arsenal', '2', '0')
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('team name matching is case-insensitive', async () => {
    mockEvent('Match Finished', 'manchester city', 'Arsenal', '3', '0')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })
})

describe('sports_score', () => {
  const base: ResolveParams = {
    templateKey: 'sports_score',
    params: { fixtureId: '12345', target: '2.5', direction: 'OVER' },
    creator: CREATOR,
    opponent: OPPONENT,
  }

  it('creator wins when total goals > target (OVER)', async () => {
    mockEvent('Match Finished', 'Team A', 'Team B', '2', '1')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) {
      expect(result.winner).toBe(CREATOR)
      expect(result.rawValue).toBe('3')
    }
  })

  it('opponent wins when total goals < target (OVER)', async () => {
    mockEvent('Match Finished', 'Team A', 'Team B', '1', '1')
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(OPPONENT)
  })

  it('creator wins when total goals < target (UNDER)', async () => {
    const underBase = { ...base, params: { ...base.params, direction: 'UNDER' } }
    mockEvent('Match Finished', 'Team A', 'Team B', '1', '1')
    const result = await resolve(underBase)
    expect(result.pending).toBe(false)
    if (!result.pending && !result.voided) expect(result.winner).toBe(CREATOR)
  })

  it('returns voided when match is Postponed', async () => {
    mockEvent('Postponed', 'Team A', 'Team B', null, null)
    const result = await resolve(base)
    expect(result.pending).toBe(false)
    if (!result.pending) expect(result.voided).toBe(true)
  })

  it('returns pending for invalid direction', async () => {
    const bad = { ...base, params: { ...base.params, direction: 'SIDEWAYS' } }
    mockEvent('Match Finished', 'Team A', 'Team B', '2', '1')
    const result = await resolve(bad)
    expect(result.pending).toBe(true)
  })

  it('returns pending when fixtureId is missing', async () => {
    const result = await resolve({ ...base, params: { target: '2.5', direction: 'OVER' } })
    expect(result.pending).toBe(true)
  })

  it('returns pending when API is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }),
    )
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })

  it('returns pending when API returns empty events', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: null }),
      }),
    )
    const result = await resolve(base)
    expect(result.pending).toBe(true)
  })
})
