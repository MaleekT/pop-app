// Upcoming-fixture discovery for the autonomous curator. Uses TheSportsDB's free
// eventsnext.php for a small set of configured teams, and prefixes fixture ids with
// "tsdb:" so the existing sports resolver settles them via the same TheSportsDB path
// (no API key needed). Deliberately self-contained — it does NOT touch the shared
// /api/sports/search route the PvP bet form uses.

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'

// TheSportsDB tags World Cup finals matches with a league name containing "World Cup".
const WORLD_CUP = /world cup/i

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

    return (data.events ?? [])
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
        return [{ id: `tsdb:${e.idEvent}`, homeTeam: e.strHomeTeam, awayTeam: e.strAwayTeam, date: iso, sport: team.sport }]
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .slice(0, perTeam)
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
  // Soonest first, so the most imminent (and most viral) fixtures are created before later ones.
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
}
