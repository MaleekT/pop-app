// Upcoming-fixture discovery for the autonomous curator. Uses TheSportsDB's free
// eventsnext.php for a small set of configured teams, and prefixes fixture ids with
// "tsdb:" so the existing sports resolver settles them via the same TheSportsDB path
// (no API key needed). Deliberately self-contained — it does NOT touch the shared
// /api/sports/search route the PvP bet form uses.

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'

// TheSportsDB tags World Cup finals matches with a league name containing "World Cup".
const WORLD_CUP = /world cup/i

// Real competitions, matched EXACTLY. Everything else is preseason and ranks below them:
// "Club Friendlies", "NBA Summer League", "English Premier League Summer Series".
// The exactness is the whole point. A substring match on "NBA" or "Premier League" would promote
// the two summer competitions, which are precisely what this is meant to rank down.
const COMPETITIVE_LEAGUES = new Set([
  'English Premier League',
  'Spanish La Liga',
  'German Bundesliga',
  'French Ligue 1',
  'Italian Serie A',
  'UEFA Champions League',
  'UEFA Europa League',
  'NBA',
])

export function isCompetitive(league: string): boolean {
  const name = league.trim()
  return WORLD_CUP.test(name) || COMPETITIVE_LEAGUES.has(name)
}

export type Sport = 'football' | 'basketball'

export interface FollowedTeam {
  name: string
  tsdbId: string // TheSportsDB team id
  sport: Sport
  kind?: 'national' | 'club' // football only: national teams list World Cup matches only
}

export interface UpcomingFixture {
  id: string // "tsdb:<idEvent>"
  homeTeam: string
  awayTeam: string
  date: string // ISO, UTC
  sport: Sport
  league: string       // raw strLeague, e.g. "FIFA World Cup" or "Club Friendlies"
  competitive: boolean // a real competition rather than preseason/summer filler
}

interface TsdbNextEvent {
  idEvent: string
  strHomeTeam: string | null
  strAwayTeam: string | null
  dateEvent: string | null
  strTime: string | null
  strLeague: string | null
}

async function fetchTeamFixtures(team: FollowedTeam, perTeam: number, maxFootballMs: number): Promise<UpcomingFixture[]> {
  try {
    const res = await fetch(`${TSDB_BASE}/eventsnext.php?id=${encodeURIComponent(team.tsdbId)}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { events: TsdbNextEvent[] | null }
    const now = Date.now()

    const mapped = (data.events ?? [])
      .flatMap((e): UpcomingFixture[] => {
        if (!e?.idEvent || !e.strHomeTeam || !e.strAwayTeam || !e.dateEvent) return []
        const time = e.strTime ?? '00:00:00'
        const raw = `${e.dateEvent}T${time}`
        // TheSportsDB stores UTC without a suffix — add Z so it parses as UTC everywhere.
        const iso = /[Z+]/.test(time) ? raw : `${raw}Z`
        const ts = Date.parse(iso)
        if (isNaN(ts) || ts <= now) return []
        // Keep the board timely: skip football fixtures too far out.
        if (team.sport === 'football' && ts > now + maxFootballMs) return []
        // National teams list World Cup matches only (drop friendlies, qualifiers, Nations League).
        if (team.sport === 'football' && team.kind === 'national' && !WORLD_CUP.test(e.strLeague ?? '')) return []
        const league = e.strLeague ?? ''
        return [{
          id: `tsdb:${e.idEvent}`,
          homeTeam: e.strHomeTeam,
          awayTeam: e.strAwayTeam,
          date: iso,
          sport: team.sport,
          league,
          competitive: isCompetitive(league),
        }]
      })

    // Rank WITHIN the team before truncating, not just globally. Slicing to perTeam by date alone
    // would keep two sooner friendlies and drop a real league fixture behind them, and the global
    // rank would then never get to see it. Harmless today (the free feed returns one fixture per
    // team) but it bites the moment the season starts and a club has both queued.
    return rankFixtures(mapped).slice(0, perTeam)
  } catch {
    return []
  }
}

// Upcoming fixtures across all followed teams, deduped by fixture id (a match between two
// followed teams would otherwise appear twice).
export async function fetchUpcomingFixtures(followed: FollowedTeam[], perTeam: number, maxFootballMs: number): Promise<UpcomingFixture[]> {
  const lists = await Promise.all(followed.map((t) => fetchTeamFixtures(t, perTeam, maxFootballMs)))
  const seen = new Set<string>()
  const out: UpcomingFixture[] = []
  for (const list of lists) {
    for (const f of list) {
      if (seen.has(f.id)) continue
      seen.add(f.id)
      out.push(f)
    }
  }
  return rankFixtures(out)
}

// Real competitions outrank preseason; within a tier, the soonest kick-off comes first. So a World
// Cup tie or a league match always claims a board slot ahead of a July friendly, and friendlies only
// fill what is left over. Pure and copy-on-write, so it is unit testable and never mutates its input.
export function rankFixtures(fixtures: UpcomingFixture[]): UpcomingFixture[] {
  return [...fixtures].sort((a, b) => {
    if (a.competitive !== b.competitive) return a.competitive ? -1 : 1
    return Date.parse(a.date) - Date.parse(b.date)
  })
}
