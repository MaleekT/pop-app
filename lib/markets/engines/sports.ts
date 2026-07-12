// Sports market resolver. Faithful copy of the PvP sports fetch + status logic
// (lib/engines/sports.ts), but resolves to an outcome INDEX instead of a winner.
// Outcome convention: sports_winner -> 0 Home, 1 Away, 2 Draw; sports_score -> 0 Over, 1 Under.
import type { MarketResolveInput, MarketResolveResult } from './types'

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'
const BASKETBALL_BASE = 'https://v1.basketball.api-sports.io'

interface TsdbEvent {
  idEvent: string
  strHomeTeam: string | null
  strAwayTeam: string | null
  strStatus: string | null
  intHomeScore: string | null
  intAwayScore: string | null
}

interface AfFootballResult {
  fixture: { id: number; status: { short: string } }
  teams: { home: { name: string }; away: { name: string } }
  goals: { home: number | null; away: number | null }
}

interface AfBasketballResult {
  id: number
  status: { short: string }
  teams: { home: { name: string }; away: { name: string } }
  scores: { home: { total: number | null }; away: { total: number | null } }
}

const TSDB_FINISHED = new Set(['Match Finished', 'FT', 'AOT', 'AET', 'PEN'])
const TSDB_VOID = new Set(['Postponed', 'Cancelled', 'Abandoned', 'Deleted', 'PST', 'CANC', 'ABD'])
const FOOTBALL_FINISHED = new Set(['FT', 'AET', 'PEN'])
const FOOTBALL_VOID = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'INT', 'AWD', 'WO'])
const BASKETBALL_FINISHED = new Set(['FT', 'AOT'])
const BASKETBALL_VOID = new Set(['POST', 'CANC', 'SUSP', 'AWD', 'ABD'])

type Outcome = 'home_win' | 'away_win' | 'draw'

function apiKey(): string | null {
  const key = process.env.API_FOOTBALL_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

function computeActualOutcome(homeScore: number, awayScore: number): Outcome {
  if (homeScore > awayScore) return 'home_win'
  if (awayScore > homeScore) return 'away_win'
  return 'draw'
}

function resolved(outcomeIndex: number, rawValue: string, sourceUrl: string, fetchedAt: string): MarketResolveResult {
  return { pending: false, voided: false as const, outcomeIndex, rawValue, sourceUrl, fetchedAt }
}

function voided(sourceUrl: string, rawStatus: string, fetchedAt: string): MarketResolveResult {
  return { pending: false, voided: true as const, evidence: { sourceUrl, rawStatus, fetchedAt } }
}

// Maps a finished fixture to an outcome index for the market's template.
function mapResult(
  templateKey: string,
  params: Record<string, string>,
  outcomeCount: number,
  homeScore: number,
  awayScore: number,
  rawScore: string,
  sourceUrl: string,
  fetchedAt: string,
): MarketResolveResult {
  if (templateKey === 'sports_winner') {
    const outcome = computeActualOutcome(homeScore, awayScore)
    if (outcome === 'home_win') return resolved(0, rawScore, sourceUrl, fetchedAt)
    if (outcome === 'away_win') return resolved(1, rawScore, sourceUrl, fetchedAt)
    if (outcomeCount >= 3) return resolved(2, rawScore, sourceUrl, fetchedAt)
    return voided(sourceUrl, `Draw not representable in a ${outcomeCount}-outcome market`, fetchedAt)
  }

  if (templateKey === 'sports_score') {
    const target = parseFloat(params.target)
    if (isNaN(target) || target < 0) return { pending: true }
    const total = homeScore + awayScore
    if (total > target) return resolved(0, String(total), sourceUrl, fetchedAt)
    if (total < target) return resolved(1, String(total), sourceUrl, fetchedAt)
    return voided(sourceUrl, `Push: total ${total} equals target ${target}`, fetchedAt)
  }

  return { pending: true }
}

// ── TheSportsDB ──────────────────────────────────────────────────────────────

async function fetchTsdbEvent(eventId: string): Promise<TsdbEvent | null> {
  try {
    const res = await fetch(`${TSDB_BASE}/lookupevent.php?id=${encodeURIComponent(eventId)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { events: TsdbEvent[] | null }
    return data.events?.[0] ?? null
  } catch {
    return null
  }
}

async function resolveTsdb(templateKey: string, params: Record<string, string>, outcomeCount: number): Promise<MarketResolveResult> {
  const numericId = params.fixtureId.replace(/^tsdb:/, '')
  const event = await fetchTsdbEvent(numericId)
  if (!event) return { pending: true }

  const status = event.strStatus ?? ''
  const sourceUrl = `${TSDB_BASE}/lookupevent.php?id=${numericId}`
  const fetchedAt = new Date().toISOString()

  if (TSDB_VOID.has(status)) return voided(sourceUrl, status, fetchedAt)
  if (!TSDB_FINISHED.has(status)) return { pending: true }

  const homeScore = event.intHomeScore != null && event.intHomeScore !== '' ? parseInt(event.intHomeScore, 10) : null
  const awayScore = event.intAwayScore != null && event.intAwayScore !== '' ? parseInt(event.intAwayScore, 10) : null
  if (homeScore == null || awayScore == null || isNaN(homeScore) || isNaN(awayScore)) return { pending: true }

  const homeName = event.strHomeTeam
  const awayName = event.strAwayTeam
  if (!homeName || !awayName) return { pending: true }

  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`
  return mapResult(templateKey, params, outcomeCount, homeScore, awayScore, rawScore, sourceUrl, fetchedAt)
}

// ── API-Football (legacy + national team fallback) ─────────────────────────────

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

async function resolveFootball(templateKey: string, params: Record<string, string>, outcomeCount: number): Promise<MarketResolveResult> {
  const event = await fetchFootballFixture(params.fixtureId)
  if (!event) return { pending: true }

  const status = event.fixture.status?.short ?? ''
  const sourceUrl = `${FOOTBALL_BASE}/fixtures?id=${encodeURIComponent(params.fixtureId)}`
  const fetchedAt = new Date().toISOString()

  if (FOOTBALL_VOID.has(status)) return voided(sourceUrl, status, fetchedAt)
  if (!FOOTBALL_FINISHED.has(status)) return { pending: true }

  const homeScore = event.goals?.home
  const awayScore = event.goals?.away
  if (homeScore == null || awayScore == null) return { pending: true }

  const homeName = event.teams?.home?.name
  const awayName = event.teams?.away?.name
  if (!homeName || !awayName) return { pending: true }

  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`
  return mapResult(templateKey, params, outcomeCount, homeScore, awayScore, rawScore, sourceUrl, fetchedAt)
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

async function resolveBasketball(templateKey: string, params: Record<string, string>, outcomeCount: number): Promise<MarketResolveResult> {
  const game = await fetchBasketballGame(params.fixtureId)
  if (!game) return { pending: true }

  const status = game.status?.short ?? ''
  const sourceUrl = `${BASKETBALL_BASE}/games?id=${encodeURIComponent(params.fixtureId)}`
  const fetchedAt = new Date().toISOString()

  if (BASKETBALL_VOID.has(status)) return voided(sourceUrl, status, fetchedAt)
  if (!BASKETBALL_FINISHED.has(status)) return { pending: true }

  const homeScore = game.scores?.home?.total
  const awayScore = game.scores?.away?.total
  if (homeScore == null || awayScore == null) return { pending: true }

  const homeName = game.teams?.home?.name
  const awayName = game.teams?.away?.name
  if (!homeName || !awayName) return { pending: true }

  const rawScore = `${homeName} ${homeScore} - ${awayScore} ${awayName}`
  return mapResult(templateKey, params, outcomeCount, homeScore, awayScore, rawScore, sourceUrl, fetchedAt)
}

// ── Entry point ────────────────────────────────────────────────────────────────

export async function resolve(input: MarketResolveInput): Promise<MarketResolveResult> {
  const { templateKey, params, outcomeCount } = input
  if (!params.fixtureId) return { pending: true }

  if (params.fixtureId.startsWith('tsdb:')) return resolveTsdb(templateKey, params, outcomeCount)
  if (params.sport === 'basketball') return resolveBasketball(templateKey, params, outcomeCount)
  return resolveFootball(templateKey, params, outcomeCount)
}
