import { describe, it, expect } from 'vitest'
import { isCompetitive, rankFixtures, type UpcomingFixture } from './sports-fixtures'

const BASE = Date.UTC(2026, 6, 14, 12, 0, 0) // 2026-07-14T12:00:00Z

function fixture(id: string, hoursOut: number, league: string): UpcomingFixture {
  return {
    id,
    homeTeam: 'Home',
    awayTeam: 'Away',
    sport: 'football',
    date: new Date(BASE + hoursOut * 3_600_000).toISOString(),
    league,
    competitive: isCompetitive(league),
  }
}

describe('isCompetitive', () => {
  it('accepts the real competitions', () => {
    expect(isCompetitive('FIFA World Cup')).toBe(true)
    expect(isCompetitive('English Premier League')).toBe(true)
    expect(isCompetitive('Spanish La Liga')).toBe(true)
    expect(isCompetitive('German Bundesliga')).toBe(true)
    expect(isCompetitive('French Ligue 1')).toBe(true)
    expect(isCompetitive('Italian Serie A')).toBe(true)
    expect(isCompetitive('UEFA Champions League')).toBe(true)
    expect(isCompetitive('NBA')).toBe(true)
  })

  // This is the entire reason the allowlist is exact-match instead of a substring regex.
  // TheSportsDB really does return both of these strings, and a match on "NBA" or
  // "Premier League" would promote the two summer competitions this exists to rank DOWN.
  it('rejects the summer competitions that read like real ones', () => {
    expect(isCompetitive('NBA Summer League')).toBe(false)
    expect(isCompetitive('English Premier League Summer Series')).toBe(false)
  })

  it('rejects preseason friendlies and unknown or empty leagues', () => {
    expect(isCompetitive('Club Friendlies')).toBe(false)
    expect(isCompetitive('Some Invitational Cup')).toBe(false)
    expect(isCompetitive('')).toBe(false)
  })

  it('tolerates surrounding whitespace', () => {
    expect(isCompetitive('  NBA  ')).toBe(true)
  })
})

describe('rankFixtures', () => {
  it('puts a real competition ahead of a friendly even when the friendly is much sooner', () => {
    const out = rankFixtures([
      fixture('friendly-tomorrow', 24, 'Club Friendlies'),
      fixture('worldcup-next-week', 24 * 7, 'FIFA World Cup'),
    ])
    expect(out.map((f) => f.id)).toEqual(['worldcup-next-week', 'friendly-tomorrow'])
  })

  it('sorts soonest-first within each tier', () => {
    const out = rankFixtures([
      fixture('league-late', 72, 'English Premier League'),
      fixture('friendly-early', 6, 'Club Friendlies'),
      fixture('league-early', 12, 'English Premier League'),
      fixture('friendly-late', 96, 'Club Friendlies'),
    ])
    expect(out.map((f) => f.id)).toEqual(['league-early', 'league-late', 'friendly-early', 'friendly-late'])
  })

  it('ranks NBA Summer League below real NBA, not above it on date', () => {
    const out = rankFixtures([
      fixture('summer-league-today', 2, 'NBA Summer League'),
      fixture('real-nba-in-october', 24 * 90, 'NBA'),
    ])
    expect(out.map((f) => f.id)).toEqual(['real-nba-in-october', 'summer-league-today'])
  })

  it('does not mutate its input', () => {
    const input = [fixture('b', 48, 'Club Friendlies'), fixture('a', 24, 'NBA')]
    const before = input.map((f) => f.id)
    rankFixtures(input)
    expect(input.map((f) => f.id)).toEqual(before)
  })
})
