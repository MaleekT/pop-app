// Sports fixture search.
// Football clubs: TheSportsDB (www.thesportsdb.com) via static team ID map -> eventsnext.php
// Football national teams + unlisted clubs: API-Football v3 (v3.football.api-sports.io) fallback
// Basketball: TheSportsDB NBA team map -> eventsnext.php
//
// TheSportsDB fixture IDs are prefixed "tsdb:" so the resolver knows which API to call.
// API-Football fixture IDs are stored as plain numbers (backward compatible).
import { NextRequest, NextResponse } from 'next/server'

const TSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3'
const FOOTBALL_BASE = 'https://v3.football.api-sports.io'
const REVALIDATE_SECONDS = 600
const MAX_AF_TEAM_TRIES = 6

// ─── Output type ──────────────────────────────────────────────────────────────

export interface SportFixture {
  id: string
  homeTeam: string
  awayTeam: string
  league: string
  date: string
}

// ─── TheSportsDB event shape ─────────────────────────────────────────────────

interface TsdbNextEvent {
  idEvent: string
  strHomeTeam: string | null
  strAwayTeam: string | null
  strLeague: string | null
  dateEvent: string | null
  strTime: string | null
}

// ─── API-Football shapes (fallback) ───────────────────────────────────────────

interface AfTeam {
  team: { id: number; name: string; national: boolean }
}

interface AfFixture {
  fixture: { id: number; date: string; status: { short: string } }
  league: { name: string }
  teams: { home: { name: string }; away: { name: string } }
}

// ─── Query aliases (short form / nickname -> full name) ──────────────────────

const FOOTBALL_ALIASES: Record<string, string> = {
  // English clubs
  'man utd': 'Manchester United',
  'man united': 'Manchester United',
  'man u': 'Manchester United',
  'mufc': 'Manchester United',
  'man city': 'Manchester City',
  'city': 'Manchester City',
  'mcfc': 'Manchester City',
  'spurs': 'Tottenham Hotspur',
  'tottenham': 'Tottenham Hotspur',
  'thfc': 'Tottenham Hotspur',
  'wolves': 'Wolverhampton',
  'west ham': 'West Ham United',
  'hammers': 'West Ham United',
  'villa': 'Aston Villa',
  'nottm forest': 'Nottingham Forest',
  'forest': 'Nottingham Forest',
  'nffc': 'Nottingham Forest',
  'newcastle': 'Newcastle United',
  'nufc': 'Newcastle United',
  'leicester': 'Leicester City',
  'leeds': 'Leeds United',
  'lufc': 'Leeds United',
  'boro': 'Middlesbrough',
  'palace': 'Crystal Palace',
  'sunderland afc': 'Sunderland',
  // Spanish clubs
  'barca': 'Barcelona',
  'real': 'Real Madrid',
  'atletico': 'Atletico Madrid',
  'atm': 'Atletico Madrid',
  'betis': 'Real Betis',
  'valencia cf': 'Valencia',
  // French clubs
  'psg': 'Paris SG',
  'paris sg': 'Paris SG',
  'paris saint-germain': 'Paris SG',
  'paris': 'Paris SG',
  'om': 'Olympique Marseille',
  'marseille': 'Olympique Marseille',
  'ol': 'Olympique Lyonnais',
  'lyon': 'Olympique Lyonnais',
  'monaco': 'AS Monaco',
  // German clubs
  'dortmund': 'Borussia Dortmund',
  'bvb': 'Borussia Dortmund',
  'gladbach': 'Borussia Monchengladbach',
  'bmg': 'Borussia Monchengladbach',
  'leverkusen': 'Bayer Leverkusen',
  'stuttgart': 'VfB Stuttgart',
  'frankfurt': 'Eintracht Frankfurt',
  'rb leipzig': 'RB Leipzig',
  'leipzig': 'RB Leipzig',
  'bayern': 'FC Bayern Munchen',
  'fc bayern': 'FC Bayern Munchen',
  'bay munich': 'FC Bayern Munchen',
  'bayer munich': 'FC Bayern Munchen',
  'munchen': 'FC Bayern Munchen',
  // Italian clubs
  'juve': 'Juventus',
  'inter milan': 'Inter Milan',
  'inter': 'Inter Milan',
  'nerazzurri': 'Inter Milan',
  'ac milan': 'AC Milan',
  'milan': 'AC Milan',
  'roma': 'AS Roma',
  'napoli': 'Napoli',
  'atalanta': 'Atalanta',
  // Portuguese clubs
  'porto': 'FC Porto',
  'benfica': 'Benfica',
  'sporting': 'Sporting CP',
  // Dutch clubs
  'ajax': 'Ajax',
  'psv': 'PSV Eindhoven',
  // National teams
  'brazil': 'Brazil',
  'brasil': 'Brazil',
  'argentina': 'Argentina',
  'colombia': 'Colombia',
  'chile': 'Chile',
  'peru': 'Peru',
  'ecuador': 'Ecuador',
  'uruguay': 'Uruguay',
  'venezuela': 'Venezuela',
  'paraguay': 'Paraguay',
  'bolivia': 'Bolivia',
  'usa': 'USA',
  'usmnt': 'USA',
  'united states': 'USA',
  'mexico': 'Mexico',
  'canada': 'Canada',
  'costa rica': 'Costa Rica',
  'panama': 'Panama',
  'jamaica': 'Jamaica',
  'england': 'England',
  'france': 'France',
  'germany': 'Germany',
  'spain': 'Spain',
  'italy': 'Italy',
  'portugal': 'Portugal',
  'netherlands': 'Netherlands',
  'holland': 'Netherlands',
  'belgium': 'Belgium',
  'croatia': 'Croatia',
  'switzerland': 'Switzerland',
  'denmark': 'Denmark',
  'austria': 'Austria',
  'poland': 'Poland',
  'ukraine': 'Ukraine',
  'czech republic': 'Czech Republic',
  'czechia': 'Czech Republic',
  'turkey': 'Turkey',
  'turkiye': 'Turkey',
  'hungary': 'Hungary',
  'serbia': 'Serbia',
  'romania': 'Romania',
  'scotland': 'Scotland',
  'nigeria': 'Nigeria',
  'super eagles': 'Nigeria',
  'ghana': 'Ghana',
  'black stars': 'Ghana',
  'egypt': 'Egypt',
  'morocco': 'Morocco',
  'algeria': 'Algeria',
  'ivory coast': 'Ivory Coast',
  'cote d\'ivoire': 'Ivory Coast',
  'senegal': 'Senegal',
  'cameroon': 'Cameroon',
  'indomitable lions': 'Cameroon',
  'south africa': 'South Africa',
  'bafana': 'South Africa',
  'dr congo': 'DR Congo',
  'mali': 'Mali',
  'tunisia': 'Tunisia',
  'burkina faso': 'Burkina Faso',
  'cape verde': 'Cape Verde',
  'angola': 'Angola',
}

const BASKETBALL_ALIASES: Record<string, string> = {
  'lakers': 'Los Angeles Lakers',
  'la lakers': 'Los Angeles Lakers',
  'celtics': 'Boston Celtics',
  'warriors': 'Golden State Warriors',
  'golden state': 'Golden State Warriors',
  'heat': 'Miami Heat',
  'bulls': 'Chicago Bulls',
  'knicks': 'New York Knicks',
  'nets': 'Brooklyn Nets',
  'bucks': 'Milwaukee Bucks',
  'suns': 'Phoenix Suns',
  'nuggets': 'Denver Nuggets',
  'clippers': 'LA Clippers',
  'la clippers': 'LA Clippers',
  'mavs': 'Dallas Mavericks',
  'mavericks': 'Dallas Mavericks',
  'sixers': 'Philadelphia 76ers',
  '76ers': 'Philadelphia 76ers',
  'hawks': 'Atlanta Hawks',
  'raptors': 'Toronto Raptors',
  'thunder': 'Oklahoma City Thunder',
  'okc': 'Oklahoma City Thunder',
  'cavs': 'Cleveland Cavaliers',
  'cavaliers': 'Cleveland Cavaliers',
  'rockets': 'Houston Rockets',
  'blazers': 'Portland Trail Blazers',
  'grizzlies': 'Memphis Grizzlies',
  'pelicans': 'New Orleans Pelicans',
  'jazz': 'Utah Jazz',
  'kings': 'Sacramento Kings',
  'wolves': 'Minnesota Timberwolves',
  'timberwolves': 'Minnesota Timberwolves',
  'hornets': 'Charlotte Hornets',
  'wizards': 'Washington Wizards',
  'spurs': 'San Antonio Spurs',
  'pacers': 'Indiana Pacers',
  'magic': 'Orlando Magic',
  'pistons': 'Detroit Pistons',
}

// ─── TheSportsDB static team ID maps ────────────────────────────────────────
// Keys: lowercase team name as typed (after alias expansion). Values: TheSportsDB team ID.
// Multiple key variants for the same ID handle spelling differences.

const TSDB_FOOTBALL_MAP: Record<string, string> = {
  // ---- ENGLISH PREMIER LEAGUE ----
  'wolverhampton': '133599', 'wolverhampton wanderers': '133599',
  'fulham': '133600',
  'aston villa': '133601',
  'liverpool': '133602', 'liverpool fc': '133602',
  'sunderland': '133603',
  'arsenal': '133604', 'arsenal fc': '133604',
  'chelsea': '133610', 'chelsea fc': '133610',
  'west brom': '133611', 'west bromwich albion': '133611',
  'manchester united': '133612',
  'manchester city': '133613',
  'everton': '133615', 'everton fc': '133615',
  'tottenham hotspur': '133616',
  'brighton': '133619', 'brighton & hove albion': '133619',
  'burnley': '133623', 'burnley fc': '133623',
  'crystal palace': '133632',
  'leeds united': '133635',
  'west ham united': '133636',
  'nottingham forest': '133720',
  'bournemouth': '134301', 'afc bournemouth': '134301',
  'brentford': '134355', 'brentford fc': '134355',
  'newcastle united': '134777',
  'leicester city': '133626',
  // ---- ENGLISH CHAMPIONSHIP ----
  'middlesbrough': '133628',
  'sheffield united': '133811',
  'sheffield wednesday': '133837',
  'norwich city': '133608', 'norwich': '133608',
  'watford': '133624', 'watford fc': '133624',
  'swansea city': '133614', 'swansea': '133614',
  'ipswich town': '133622', 'ipswich': '133622',
  'oxford united': '134361',
  'wrexham': '134775', 'wrexham afc': '134775',
  'southampton': '134778', 'southampton fc': '134778',
  'blackburn rovers': '133598', 'blackburn': '133598',
  'bristol city': '133621',
  'hull city': '133617', 'hull': '133617',
  'coventry city': '133625', 'coventry': '133625',
  'derby county': '133627', 'derby': '133627',
  'millwall': '133634',
  'portsmouth': '133629',
  'wigan athletic': '133607',
  'stoke city': '133609', 'stoke': '133609',
  'qpr': '133605', 'queens park rangers': '133605',
  // ---- LA LIGA ----
  'real betis': '133722', 'betis': '133722',
  'real sociedad': '133724',
  'valencia': '133725',
  'athletic bilbao': '133727', 'athletic club': '133727',
  'atletico madrid': '133729',
  'osasuna': '133730', 'ca osasuna': '133730',
  'getafe': '133731',
  'rayo vallecano': '133728',
  'mallorca': '133733', 'rcd mallorca': '133733',
  'espanyol': '133734', 'rcd espanyol': '133734',
  'sevilla': '133735', 'sevilla fc': '133735',
  'real madrid': '133738',
  'barcelona': '133739', 'fc barcelona': '133739',
  'villarreal': '133740',
  'celta vigo': '133937', 'celta': '133937',
  'girona': '134700',
  'deportivo alaves': '134221', 'alaves': '134221',
  // ---- BUNDESLIGA ----
  'borussia dortmund': '133650',
  'fc augsburg': '133652', 'augsburg': '133652',
  'sc freiburg': '133653', 'freiburg': '133653',
  'vfl wolfsburg': '133655', 'wolfsburg': '133655',
  'tsg hoffenheim': '133657', 'hoffenheim': '133657',
  'vfb stuttgart': '133660',
  'werder bremen': '133662', 'bremen': '133662',
  'fc bayern munchen': '133664', 'fc bayern münchen': '133664', 'bayern munich': '133664',
  'fsv mainz 05': '133665', 'mainz': '133665', 'mainz 05': '133665',
  'bayer leverkusen': '133666',
  'fc st. pauli': '133813', 'st pauli': '133813',
  'eintracht frankfurt': '133814',
  '1. fc union berlin': '134690', 'union berlin': '134690',
  'rb leipzig': '134695', 'red bull leipzig': '134695',
  'fc heidenheim': '134696', 'heidenheim': '134696',
  'borussia monchengladbach': '134779', 'monchengladbach': '134779',
  'hamburger sv': '133651', 'hamburg': '133651', 'hsv': '133651',
  'fc koln': '133654', 'cologne': '133654', 'koln': '133654',
  'schalke': '133656', 'schalke 04': '133656',
  // ---- SERIE A ----
  'ac milan': '133667',
  'lazio': '133668', 'ss lazio': '133668',
  'napoli': '133670', 'ssc napoli': '133670',
  'fiorentina': '133674',
  'genoa': '133675',
  'juventus': '133676', 'juventus fc': '133676',
  'lecce': '133678', 'us lecce': '133678',
  'udinese': '133679',
  'inter milan': '133681', 'fc internazionale milano': '133681', 'internazionale': '133681',
  'as roma': '133682',
  'torino': '133687', 'torino fc': '133687',
  'atalanta': '134782', 'atalanta bc': '134782',
  'cagliari': '134783',
  'hellas verona': '134784', 'verona': '134784',
  'bologna': '134781', 'bologna fc': '134781',
  'como': '134243',
  'parma': '135728',
  'pisa': '133859',
  'cremonese': '134224',
  // ---- LIGUE 1 ----
  'toulouse': '133703', 'toulouse fc': '133703',
  'stade brestois': '133704', 'brest': '133704',
  'olympique marseille': '133707',
  'losc lille': '133711', 'lille': '133711',
  'ogc nice': '133712',
  'olympique lyonnais': '133713',
  'paris sg': '133714',
  'lorient': '133715',
  'stade rennais': '133719', 'rennes': '133719',
  'rc lens': '133822', 'lens': '133822',
  'as monaco': '133823',
  'fc nantes': '133861', 'nantes': '133861',
  'le havre': '133862', 'le havre ac': '133862',
  'rc strasbourg': '133882', 'strasbourg': '133882',
  'metz': '133883', 'fc metz': '133883',
  'angers': '134709', 'angers sco': '134709',
  'auxerre': '134788',
  'paris fc': '135465',
  // ---- EREDIVISIE ----
  'feyenoord': '133758',
  'heerenveen': '133759',
  'nec nijmegen': '133760', 'nec': '133760',
  'fc groningen': '133762', 'groningen': '133762',
  'fc utrecht': '133764', 'utrecht': '133764',
  'rkc waalwijk': '133765', 'waalwijk': '133765',
  'heracles': '133766', 'heracles almelo': '133766',
  'az alkmaar': '133767', 'az': '133767',
  'psv eindhoven': '133768',
  'ajax': '133772', 'afc ajax': '133772',
  'nac breda': '133773', 'nac': '133773',
  'fc twente': '133774', 'twente': '133774',
  'willem ii': '133827',
  'sparta rotterdam': '133866', 'sparta': '133866',
  'pec zwolle': '133936', 'zwolle': '133936',
  'fortuna sittard': '134264',
  'go ahead eagles': '134304',
  // ---- SCOTTISH PREMIER LEAGUE ----
  'celtic': '133647', 'celtic fc': '133647',
  'rangers': '133642', 'rangers fc': '133642',
  'hearts': '133643', 'heart of midlothian': '133643',
  'hibernian': '133646', 'hibs': '133646',
  'aberdeen': '133638', 'aberdeen fc': '133638',
  'kilmarnock': '133645',
  'motherwell': '133640',
  'dundee': '133942', 'dundee fc': '133942',
  'dundee united': '133644',
  'st johnstone': '133639',
  'st mirren': '133649',
  'ross county': '133940',
  // ---- PORTUGUESE LIGA ----
  'sl benfica': '134108', 'benfica': '134108',
  'sc braga': '134098', 'braga': '134098',
  'fc porto': '134114', 'porto': '134114',
  // ---- NATIONAL TEAMS: CONMEBOL + CONCACAF ----
  'brazil': '134496',
  'argentina': '134509',
  'colombia': '134501',
  'chile': '134499',
  'peru': '136162',
  'ecuador': '134507',
  'uruguay': '134504',
  'venezuela': '136473',
  'paraguay': '136471',
  'bolivia': '136470',
  'usa': '134514',
  'mexico': '134497',
  'canada': '140073',
  'costa rica': '134505',
  'panama': '136141',
  'jamaica': '140037',
  // ---- NATIONAL TEAMS: UEFA ----
  'england': '133914',
  'france': '133913',
  'germany': '133907',
  'spain': '133909',
  'italy': '133910',
  'portugal': '133908',
  'netherlands': '133905',
  'belgium': '134515',
  'croatia': '133912',
  'switzerland': '134506',
  'denmark': '133906',
  'austria': '135986',
  'poland': '133901',
  'ukraine': '133915',
  'czech republic': '133904',
  'turkey': '135985',
  'hungary': '135987',
  'serbia': '136140',
  'romania': '135980',
  'scotland': '136450',
  'albania': '135981',
  'georgia': '135930',
  'slovakia': '135983',
  'slovenia': '136456',
  // ---- NATIONAL TEAMS: CAF ----
  'nigeria': '134512',
  'ghana': '134513',
  'egypt': '136138',
  'morocco': '136139',
  'algeria': '134516',
  'ivory coast': '134502', 'cote d\'ivoire': '134502',
  'senegal': '136143',
  'cameroon': '134498',
  'south africa': '136482',
  'dr congo': '136475', 'congo': '136475',
  'mali': '134580',
  'tunisia': '136142',
  'burkina faso': '136474',
  'cape verde': '136477',
  'angola': '136485',
  'mozambique': '136487',
  'namibia': '136503',
  'zambia': '136476',
}

const TSDB_BASKETBALL_MAP: Record<string, string> = {
  'boston celtics': '134860',
  'brooklyn nets': '134861',
  'new york knicks': '134862',
  'philadelphia 76ers': '134863',
  'toronto raptors': '134864',
  'golden state warriors': '134865',
  'los angeles clippers': '134866', 'la clippers': '134866',
  'los angeles lakers': '134867',
  'phoenix suns': '134868',
  'chicago bulls': '134870',
  'cleveland cavaliers': '134871',
  'detroit pistons': '134872',
  'indiana pacers': '134873',
  'milwaukee bucks': '134874',
  'dallas mavericks': '134875',
  'houston rockets': '134876',
  'memphis grizzlies': '134877',
  'new orleans pelicans': '134878',
  'san antonio spurs': '134879',
  'atlanta hawks': '134880',
  'charlotte hornets': '134881',
  'miami heat': '134882',
  'orlando magic': '134883',
  'washington wizards': '134884',
  'denver nuggets': '134885',
  'minnesota timberwolves': '134886',
  'oklahoma city thunder': '134887',
  'utah jazz': '134889',
  'sacramento kings': '134869',
  'portland trail blazers': '134888',
}

// ─── Query normalisation ─────────────────────────────────────────────────────

function normaliseQuery(query: string, aliases: Record<string, string>): string {
  const q = query.toLowerCase().trim()
  return aliases[q] ?? query
}

// ─── Fuzzy lookup in TSDB maps ──────────────────────────────────────────────
// Falls back to prefix/substring match when exact key is missing.

function tsdbLookup(resolved: string, map: Record<string, string>): string | null {
  const q = resolved.toLowerCase().trim()
  // Exact match
  if (map[q]) return map[q]
  // Map key starts with the query (e.g. "chelsea" matches "chelsea fc").
  // Intentionally NOT matching q.startsWith(key) to avoid false positives like
  // "Manchester United Women" mapping to "Manchester United".
  for (const [key, id] of Object.entries(map)) {
    if (key.startsWith(q) && key.length - q.length <= 10) return id
  }
  // Map key contains the query as a whole-word prefix (e.g. "juventus" in "juventus fc")
  for (const [key, id] of Object.entries(map)) {
    if (key.includes(q) && key.length - q.length <= 8) return id
  }
  return null
}

// ─── API-Football helpers ────────────────────────────────────────────────────

const SKIP_PATTERNS = [
  /\bU1[3-9]\b/i,
  /\bU2[0-3]\b/i,
  /\bUnder[-\s]?\d+/i,
  /\bAcademy\b/i,
  /\bYouth\b/i,
  /\bReserv/i,
  /\bWomen\b/i,
  /\bLadies\b/i,
  /\bFutsal\b/i,
  /\bBeach\b/i,
  /\bJunior/i,
  /\b(II|III|IV)\s*$/,
  /\bB\s+Team\b/i,
]

function filterSeniorTeams<T extends { team: { name: string } }>(teams: T[]): T[] {
  const senior = teams.filter(t => !SKIP_PATTERNS.some(p => p.test(t.team.name)))
  return senior.length > 0 ? senior : teams
}

function rankByRelevance<T extends { team: { name: string } }>(teams: T[], query: string): T[] {
  const q = query.toLowerCase().trim()
  return [...teams].sort((a, b) => {
    const aName = a.team.name.toLowerCase()
    const bName = b.team.name.toLowerCase()
    const score = (name: string) => {
      if (name === q) return 3
      if (name.startsWith(q)) return 2
      if (name.includes(q)) return 1
      return 0
    }
    const diff = score(bName) - score(aName)
    if (diff !== 0) return diff
    return aName.length - bName.length
  }).slice(0, MAX_AF_TEAM_TRIES)
}

function apiKey(): string | null {
  const key = process.env.API_FOOTBALL_KEY
  return key && key.trim().length > 0 ? key.trim() : null
}

async function apiGet<T>(
  base: string,
  path: string,
  key: string,
): Promise<{ response: T[]; errors: unknown } | null> {
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { 'x-apisports-key': key },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: REVALIDATE_SECONDS },
    })
    if (!res.ok) return null
    return (await res.json()) as { response: T[]; errors: unknown }
  } catch {
    return null
  }
}

// ─── TheSportsDB fixture fetch ──────────────────────────────────────────────

async function fetchTsdbFixtures(
  tsdbTeamId: string,
  originalQuery: string,
): Promise<{ fixtures: SportFixture[]; error?: string }> {
  try {
    const res = await fetch(
      `${TSDB_BASE}/eventsnext.php?id=${encodeURIComponent(tsdbTeamId)}`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    )
    if (!res.ok) return { fixtures: [], error: 'Sports data temporarily unavailable. Try again shortly.' }

    const data = (await res.json()) as { events: TsdbNextEvent[] | null }
    const events = data.events ?? []
    const now = Date.now()

    const fixtures: SportFixture[] = events
      .flatMap((e): SportFixture[] => {
        if (!e?.idEvent || !e.strHomeTeam || !e.strAwayTeam || !e.dateEvent) return []
        const timeStr = e.strTime ?? '00:00:00'
        const rawDateStr = `${e.dateEvent}T${timeStr}`
        // TheSportsDB stores UTC times without a timezone suffix — add Z so Date.parse
        // treats them as UTC everywhere, not as local time on the user's device.
        const dateStr = /[Z+]/.test(timeStr) ? rawDateStr : rawDateStr + 'Z'
        const ts = Date.parse(dateStr)
        if (isNaN(ts) || ts <= now) return []
        return [{
          id: `tsdb:${e.idEvent}`,
          homeTeam: e.strHomeTeam,
          awayTeam: e.strAwayTeam,
          league: e.strLeague ?? 'Match',
          date: dateStr,
        }]
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .slice(0, 10)

    if (fixtures.length > 0) return { fixtures }

    return {
      fixtures: [],
      error: `No upcoming fixtures scheduled for "${originalQuery}" right now. Pre-season fixtures are typically published in June/July.`,
    }
  } catch {
    return { fixtures: [], error: 'Sports data temporarily unavailable. Try again shortly.' }
  }
}

// ─── API-Football fallback (national teams + unlisted clubs) ────────────────

async function searchViaApiFootball(
  resolved: string,
  originalQuery: string,
): Promise<{ fixtures: SportFixture[]; error?: string }> {
  const key = apiKey()
  if (!key) return { fixtures: [], error: 'Sports search is not configured on the server.' }

  const teamData = await apiGet<AfTeam>(
    FOOTBALL_BASE,
    `/teams?search=${encodeURIComponent(resolved)}`,
    key,
  )
  if (!teamData) return { fixtures: [], error: 'Sports search temporarily unavailable. Try again shortly.' }

  const raw = teamData.response ?? []
  if (raw.length === 0) {
    return {
      fixtures: [],
      error: `"${originalQuery}" not found. Try the full official name, e.g. "Manchester United", "Brazil", "Japan".`,
    }
  }

  const candidates = rankByRelevance(filterSeniorTeams(raw), resolved)
  const fromDate = new Date().toISOString().split('T')[0]
  const toDate = new Date(Date.now() + 270 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  for (const entry of candidates) {
    const { id } = entry.team
    const fixtureData = await apiGet<AfFixture>(
      FOOTBALL_BASE,
      `/fixtures?team=${id}&from=${fromDate}&to=${toDate}`,
      key,
    )
    if (!fixtureData) continue

    const now = Date.now()
    const fixtures: SportFixture[] = (fixtureData.response ?? [])
      .flatMap((f): SportFixture[] => {
        const fid = f?.fixture?.id
        const date = f?.fixture?.date
        const home = f?.teams?.home?.name
        const away = f?.teams?.away?.name
        const ts = date ? Date.parse(date) : NaN
        if (fid == null || !home || !away || isNaN(ts) || ts <= now) return []
        return [{ id: String(fid), homeTeam: home, awayTeam: away, league: f.league?.name ?? 'Match', date }]
      })
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date))
      .slice(0, 10)

    if (fixtures.length > 0) return { fixtures }
  }

  return {
    fixtures: [],
    error: `No upcoming fixtures found for "${originalQuery}". Pre-season fixtures are typically published in June/July.`,
  }
}

// ─── Football search ─────────────────────────────────────────────────────────

async function searchFootball(query: string): Promise<{ fixtures: SportFixture[]; error?: string }> {
  const resolved = normaliseQuery(query, FOOTBALL_ALIASES)
  const tsdbId = tsdbLookup(resolved, TSDB_FOOTBALL_MAP)

  if (tsdbId) {
    const tsdbResult = await fetchTsdbFixtures(tsdbId, query)
    if (tsdbResult.fixtures.length > 0) return tsdbResult
    // TSDB found the team but has no scheduled fixtures (off-season gap).
    // Try API-Football which may cover a different calendar window.
    const afResult = await searchViaApiFootball(resolved, query)
    if (afResult.fixtures.length > 0) return afResult
    return tsdbResult
  }

  // Fallback: API-Football handles teams not in the static map.
  return searchViaApiFootball(resolved, query)
}

// ─── Basketball search ───────────────────────────────────────────────────────

async function searchBasketball(query: string): Promise<{ fixtures: SportFixture[]; error?: string }> {
  const resolved = normaliseQuery(query, BASKETBALL_ALIASES)
  const tsdbId = tsdbLookup(resolved, TSDB_BASKETBALL_MAP)

  if (tsdbId) {
    const result = await fetchTsdbFixtures(tsdbId, query)
    if (result.fixtures.length === 0 && result.error) {
      return {
        fixtures: [],
        error: `No upcoming games for "${query}" right now. The team may be eliminated from the playoffs, or the NBA season has ended. Check back in October when the new season starts.`,
      }
    }
    return result
  }

  return {
    fixtures: [],
    error: `"${query}" not found. Try the full team name, e.g. "Los Angeles Lakers", "Boston Celtics".`,
  }
}

// ─── Route handler ───────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const query = (req.nextUrl.searchParams.get('query') ?? '').trim()
  const sport = (req.nextUrl.searchParams.get('sport') ?? 'football').trim().toLowerCase()

  if (query.length < 3) return NextResponse.json({ fixtures: [] })

  const result = sport === 'basketball'
    ? await searchBasketball(query)
    : await searchFootball(query)

  return NextResponse.json(result)
}
