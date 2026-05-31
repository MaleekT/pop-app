// Sports bet resolver.
// Fixture IDs prefixed "tsdb:" are resolved via TheSportsDB lookupevent.php.
// Plain numeric IDs (legacy + API-Football national team fallback) use API-Football.
import type { Address } from 'viem'
import type { ResolveParams, ResolveResult } from './types'

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'
const BASKETBALL_BASE = 'https://v1.basketball.api-sports.io'

// ─── TheSportsDB event shape ─────────────────────────────────────────────────

interface TsdbEvent {
  idEvent: string
  strHomeTeam: string | null
  strAwayTeam: string | null
  strStatus: string | null
  intHomeScore: string | null
  intAwayScore: string | null
  strLeague: string | null
  dateEvent: string | null
}

interface TsdbEventResult {
  events: TsdbEvent[] | null
}

// ─── API-Football shapes ─────────────────────────────────────────────────────

interface AfFootballResult {
  fixture: { id: number; status: { short: string } }
  teams: { home: { name: string }; away: { name: string } }
  goals: { home: number | null; away: number | null }
}

interface AfBasketballResult {
  id: number
  status: { clock: string | null; halftime: boolean; short: string; long: string }
  teams: {
    home: { id: number; name: string }
    away: { id: number; name: string }
  }
  scores: {
    home: { total: number | null }
    away: { total: number | null }
  }
}

// ─── Status sets ─────────────────────────────────────────────────────────────

const TSDB_FINISHED = new Set(['Match Finished', 'FT', 'AOT', 'AET', 'PEN'])
const TSDB_VOID = new Set(['Postponed', 'Cancelled', 'Abandoned', 'Deleted', 'PST', 'CANC', 'ABD'])

const FOOTBALL_FINISHED = new Set(['FT', 'AET', 'PEN'])
const FOOTBALL_VOID = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'INT', 'AWD', 'WO'])

const BASKETBALL_FINISHED = new Set(['FT', 'AOT'])
const BASKETBALL_VOID = new Set(['POST', 'CANC', 'SUSP', 'AWD', 'ABD'])

// ─── Credential ──────────────────────────────────────────────────────────────

function apiKey(): string | null {
  const key = process.env.API_FOOTBALL_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

// ─── TheSportsDB resolver ────────────────────────────────────────────────────

async function fetchTsdbEvent(
  eventId: string,
): Promise<TsdbEvent | null> {
  try {
    const res = await fetch(
      `${TSDB_BASE}/lookupevent.php?id=${encodeURIComponent(eventId)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(10_000) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as TsdbEventResult
    return data.events?.[0] ?? null
  } catch {
    return null
  }
}

async function resolveTsdb(
  templateKey: string,
  params: Record<string, string>,
  creator: Address,
  opponent: Address,
): Promise<ResolveResult> {
  const numericId = params.fixtureId.replace(/^tsdb:/, '')
  const event = await fetchTsdbEvent(numericId)
  if (!event) return { pending: true }

  const status = event.strStatus ?? ''
  const sourceUrl = `${TSDB_BASE}/lookupevent.php?id=${numericId}`
  const fetchedAt = new Date().toISOString()

  if (TSDB_VOID.has(status)) {
    return {
      pending: false as const,
      voided: true as const,
      evidence: { sourceUrl, rawStatus: status, fetchedAt },
    }
  }
  if (!TSDB_FINISHED.has(status)) return { pending: true }

  const homeScore = event.intHomeScore != null && event.intHomeScore !== ''
    ? parseInt(event.intHomeScore, 10)
    : null
  const awayScore = event.intAwayScore != null && event.intAwayScore !== ''
    ? parseInt(event.intAwayScore, 10)
    : null
  if (homeScore == null || awayScore == null || isNaN(homeScore) || isNaN(awayScore)) {
    return { pending: true }
  }

  const homeName = event.strHomeTeam
  const awayName = event.strAwayTeam
  if (!homeName || !awayName) return { pending: true }
  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`

  if (templateKey === 'sports_winner') {
    const { pickedTeam } = params
    if (!pickedTeam) return { pending: true }

    const picked = pickedTeam.trim().toLowerCase()
    const isHome = homeName.trim().toLowerCase() === picked
    const isAway = awayName.trim().toLowerCase() === picked
    if (!isHome && !isAway) return { pending: true }

    const homeWon = homeScore > awayScore
    const awayWon = awayScore > homeScore
    const won = (isHome && homeWon) || (isAway && awayWon)
    return {
      pending: false,
      voided: false as const,
      winner: won ? creator : opponent,
      rawValue: rawScore,
      sourceUrl,
      fetchedAt,
    }
  }

  if (templateKey === 'sports_score') {
    const target = parseFloat(params.target)
    if (isNaN(target) || target < 0) return { pending: true }
    const dir = (params.direction ?? '').trim().toUpperCase()
    if (dir !== 'OVER' && dir !== 'UNDER') return { pending: true }

    const total = homeScore + awayScore
    const win = dir === 'OVER' ? total > target : total < target
    return {
      pending: false,
      voided: false as const,
      winner: win ? creator : opponent,
      rawValue: String(total),
      sourceUrl,
      fetchedAt,
    }
  }

  return { pending: true }
}

// ─── API-Football fetchers ────────────────────────────────────────────────────

async function fetchFootballFixture(fixtureId: string): Promise<AfFootballResult | null> {
  const key = apiKey()
  if (!key) return null
  try {
    const res = await fetch(`${FOOTBALL_BASE}/fixtures?id=${encodeURIComponent(fixtureId)}`, {
      headers: { 'x-apisports-key': key },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { response: AfFootballResult[] | null }
    return data.response?.[0] ?? null
  } catch {
    return null
  }
}

async function fetchBasketballGame(gameId: string): Promise<AfBasketballResult | null> {
  const key = apiKey()
  if (!key) return null
  try {
    const res = await fetch(`${BASKETBALL_BASE}/games?id=${encodeURIComponent(gameId)}`, {
      headers: { 'x-apisports-key': key },
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as { response: AfBasketballResult[] | null }
    return data.response?.[0] ?? null
  } catch {
    return null
  }
}

// ─── API-Football resolvers (legacy + national team fallback) ─────────────────

async function resolveFootball(
  templateKey: string,
  params: Record<string, string>,
  creator: Address,
  opponent: Address,
): Promise<ResolveResult> {
  const { fixtureId } = params
  const event = await fetchFootballFixture(fixtureId)
  if (!event) return { pending: true }

  const status = event.fixture.status?.short ?? ''
  const sourceUrl = `${FOOTBALL_BASE}/fixtures?id=${encodeURIComponent(fixtureId)}`
  const fetchedAt = new Date().toISOString()

  if (FOOTBALL_VOID.has(status)) {
    return {
      pending: false as const,
      voided: true as const,
      evidence: { sourceUrl, rawStatus: status, fetchedAt },
    }
  }
  if (!FOOTBALL_FINISHED.has(status)) return { pending: true }

  const homeScore = event.goals?.home
  const awayScore = event.goals?.away
  if (homeScore == null || awayScore == null) return { pending: true }

  const homeName = event.teams?.home?.name
  const awayName = event.teams?.away?.name
  if (!homeName || !awayName) return { pending: true }
  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`

  if (templateKey === 'sports_winner') {
    const { pickedTeam } = params
    if (!pickedTeam) return { pending: true }

    const picked = pickedTeam.trim().toLowerCase()
    const isHome = homeName.trim().toLowerCase() === picked
    const isAway = awayName.trim().toLowerCase() === picked
    if (!isHome && !isAway) return { pending: true }

    const homeWon = homeScore > awayScore
    const awayWon = awayScore > homeScore
    const won = (isHome && homeWon) || (isAway && awayWon)
    return { pending: false, voided: false as const, winner: won ? creator : opponent, rawValue: rawScore, sourceUrl, fetchedAt }
  }

  if (templateKey === 'sports_score') {
    const target = parseFloat(params.target)
    if (isNaN(target) || target < 0) return { pending: true }
    const dir = (params.direction ?? '').trim().toUpperCase()
    if (dir !== 'OVER' && dir !== 'UNDER') return { pending: true }

    const total = homeScore + awayScore
    const win = dir === 'OVER' ? total > target : total < target
    return { pending: false, voided: false as const, winner: win ? creator : opponent, rawValue: String(total), sourceUrl, fetchedAt }
  }

  return { pending: true }
}

async function resolveBasketball(
  templateKey: string,
  params: Record<string, string>,
  creator: Address,
  opponent: Address,
): Promise<ResolveResult> {
  const { fixtureId } = params
  const game = await fetchBasketballGame(fixtureId)
  if (!game) return { pending: true }

  const status = game.status?.short ?? ''
  const sourceUrl = `${BASKETBALL_BASE}/games?id=${encodeURIComponent(fixtureId)}`
  const fetchedAt = new Date().toISOString()

  if (BASKETBALL_VOID.has(status)) {
    return {
      pending: false as const,
      voided: true as const,
      evidence: { sourceUrl, rawStatus: status, fetchedAt },
    }
  }
  if (!BASKETBALL_FINISHED.has(status)) return { pending: true }

  const homeScore = game.scores?.home?.total
  const awayScore = game.scores?.away?.total
  if (homeScore == null || awayScore == null) return { pending: true }

  const homeName = game.teams?.home?.name
  const awayName = game.teams?.away?.name
  if (!homeName || !awayName) return { pending: true }
  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`

  if (templateKey === 'sports_winner') {
    const { pickedTeam } = params
    if (!pickedTeam) return { pending: true }

    const picked = pickedTeam.trim().toLowerCase()
    const isHome = homeName.trim().toLowerCase() === picked
    const isAway = awayName.trim().toLowerCase() === picked
    if (!isHome && !isAway) return { pending: true }

    const homeWon = homeScore > awayScore
    const awayWon = awayScore > homeScore
    const won = (isHome && homeWon) || (isAway && awayWon)
    return { pending: false, voided: false as const, winner: won ? creator : opponent, rawValue: rawScore, sourceUrl, fetchedAt }
  }

  if (templateKey === 'sports_score') {
    const target = parseFloat(params.target)
    if (isNaN(target) || target < 0) return { pending: true }
    const dir = (params.direction ?? '').trim().toUpperCase()
    if (dir !== 'OVER' && dir !== 'UNDER') return { pending: true }

    const total = homeScore + awayScore
    const win = dir === 'OVER' ? total > target : total < target
    return { pending: false, voided: false as const, winner: win ? creator : opponent, rawValue: String(total), sourceUrl, fetchedAt }
  }

  return { pending: true }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

export async function resolve(input: ResolveParams): Promise<ResolveResult> {
  const { templateKey, params, creator, opponent } = input
  if (!params.fixtureId) return { pending: true }

  // TheSportsDB-sourced fixtures (clubs + national teams with confirmed IDs)
  if (params.fixtureId.startsWith('tsdb:')) {
    return resolveTsdb(templateKey, params, creator, opponent)
  }

  // API-Football (legacy bets + national team fallback for unrecognised teams)
  if (params.sport === 'basketball') {
    return resolveBasketball(templateKey, params, creator, opponent)
  }
  return resolveFootball(templateKey, params, creator, opponent)
}
