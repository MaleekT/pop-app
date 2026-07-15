// Tunable knobs for the autonomous market curator (Option B). Plain constants — edit
// and redeploy to retune. No secrets here. See docs/predict-auto-curator-spec.md.

import type { FollowedTeam } from '@/lib/markets/engines/sports-fixtures'

export interface CryptoCoin {
  id: string   // CoinGecko id, also stored as params.coin and read by the resolver engine
  name: string // display name, stored as params.coinName
}

export interface PriceBand {
  label: string                    // stable dedup token, stored as params.band
  direction: 'above' | 'below'
  pct: number                      // fraction, e.g. 0.05 = 5%
}

export interface Horizon {
  label: string  // stable dedup token, stored as params.horizon
  hours: number
}

// `id` MUST be the exact CoinGecko id (the key returned by /simple/price) — the resolver looks the
// price up by it, so a wrong id makes the market unresolvable. `name` is display only. All ids below
// verified live against CoinGecko. Low-priced coins (XRP, SUI, NEAR) rely on curator.ts roundTarget
// keeping sub-dollar precision so their price bands stay distinct.
export const CRYPTO_COINS: CryptoCoin[] = [
  { id: 'bitcoin', name: 'Bitcoin' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'solana', name: 'Solana' },
  { id: 'binancecoin', name: 'BNB' },
  { id: 'hyperliquid', name: 'HYPE' },
  { id: 'ripple', name: 'XRP' },
  { id: 'sui', name: 'SUI' },
  { id: 'near', name: 'NEAR' },
]

// Ordered so directions alternate — the curator walks this list, so alternating
// entries yield opposite-direction markets instead of a run of "above" bets.
export const PRICE_BANDS: PriceBand[] = [
  { label: 'up5', direction: 'above', pct: 0.05 },
  { label: 'down5', direction: 'below', pct: 0.05 },
  { label: 'up10', direction: 'above', pct: 0.10 },
  { label: 'down10', direction: 'below', pct: 0.10 },
]

export const HORIZONS: Horizon[] = [
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
]

// ── Board size ───────────────────────────────────────────────────────────────
// The curator tops the board up to BOARD_TARGET and must never leave it below BOARD_MIN.
// Only markets the CURATOR made count toward this: markets the owner creates by hand sit on
// top, so the board can legitimately exceed BOARD_TARGET.
//
// Sized so all 8 coins can hold their 2 markets each (16 crypto) alongside ~8 sports. Crypto is the
// guaranteed supply and holds the floor; sports is real-world bound (TheSportsDB returns roughly one
// upcoming fixture per followed team, football capped to FOOTBALL_MAX_DAYS) and can dry up. Crypto
// has CRYPTO_COINS x PRICE_BANDS x HORIZONS = 8 x 4 x 3 = 96 possible slots, capped in practice by
// TARGET_OPEN_PER_COIN to 8 x 2 = 16.
export const BOARD_TARGET = 24
export const BOARD_MIN = 12

// How many OPEN markets to keep alive PER COIN. Capped at 2 so no single coin can dominate the board
// or a parlay slip, and the two are picked from different horizons so their close dates spread out.
// With 8 coins that is up to 16 crypto markets, which comfortably holds BOARD_MIN on its own. To add
// variety, add ids to CRYPTO_COINS (each verified against CoinGecko) rather than raising this cap —
// raising it is what let Bitcoin take over the board before.
export const TARGET_OPEN_PER_COIN = 2

// Hard per-run creation cap. A bad config or price glitch can never spam more than this in one run.
// It is ALSO a timeout guard, and that is not theoretical: at 5 it really did blow the budget. Each
// market costs 3 sequential txs (createMarket plus one seed deposit per outcome) on top of one
// approve for the run, so 5 markets was ~16 txs against a maxDuration of 60s. The run ran out of
// time part-way and left a market created but UNSEEDED, which is what let a parlay leg price at the
// cap. 4 markets is ~13 txs and leaves real headroom.
// To fill the board faster, run the cron more often. Do NOT raise this.
export const MAX_CREATES_PER_RUN = 4

// ── Sports ───────────────────────────────────────────────────────────────────
// Teams to auto-list upcoming matches for. tsdbId is the TheSportsDB team id (same source
// the resolver uses); add or remove freely. A mix of national sides (active during summer
// tournaments like the 2026 World Cup), clubs (domestic season) and NBA (Oct–Jun), so some
// always have fixtures whatever the season.
// Every tsdbId below was verified against the team's EXACT league before being added. This is not
// paranoia: TheSportsDB's fuzzy search returns "Tottenham Women" for "Tottenham", and a French
// fifth-tier club called Torcy for "Paris SG". Either would have quietly listed matches for the
// wrong team. If you add a club, look its id up and check strLeague before trusting it.
export const SPORTS_FOLLOW: FollowedTeam[] = [
  // National teams: only their World Cup matches are listed (no friendlies/qualifiers).
  { name: 'Spain', tsdbId: '133909', sport: 'football', kind: 'national' },
  { name: 'Brazil', tsdbId: '134496', sport: 'football', kind: 'national' },
  { name: 'Argentina', tsdbId: '134509', sport: 'football', kind: 'national' },
  { name: 'France', tsdbId: '133913', sport: 'football', kind: 'national' },
  { name: 'England', tsdbId: '133914', sport: 'football', kind: 'national' },
  { name: 'Portugal', tsdbId: '133908', sport: 'football', kind: 'national' },
  // Clubs: every competition they play. Right now that is preseason (Club Friendlies); their
  // league fixtures start flowing in on their own once the season begins, no config change.
  // Premier League
  { name: 'Manchester United', tsdbId: '133612', sport: 'football', kind: 'club' },
  { name: 'Manchester City', tsdbId: '133613', sport: 'football', kind: 'club' },
  { name: 'Arsenal', tsdbId: '133604', sport: 'football', kind: 'club' },
  { name: 'Liverpool', tsdbId: '133602', sport: 'football', kind: 'club' },
  { name: 'Tottenham Hotspur', tsdbId: '133616', sport: 'football', kind: 'club' },
  { name: 'Chelsea', tsdbId: '133610', sport: 'football', kind: 'club' },
  // La Liga
  { name: 'Real Madrid', tsdbId: '133738', sport: 'football', kind: 'club' },
  { name: 'Barcelona', tsdbId: '133739', sport: 'football', kind: 'club' },
  // Bundesliga
  { name: 'Bayern Munich', tsdbId: '133664', sport: 'football', kind: 'club' },
  // Ligue 1
  { name: 'Paris Saint-Germain', tsdbId: '133714', sport: 'football', kind: 'club' },
  // NBA
  { name: 'Los Angeles Lakers', tsdbId: '134867', sport: 'basketball' },
  { name: 'Boston Celtics', tsdbId: '134860', sport: 'basketball' },
]

// Ceiling on open sports markets, not a quota: real fixture supply is usually the binding limit.
// Set to 8 so that within a 24-market board, crypto is left the 16 slots its 8 coins need (sports
// fills first). Real fixture supply is typically around here anyway.
export const TARGET_OPEN_SPORTS = 8
export const FIXTURES_PER_TEAM = 2  // inspect each followed team's next N fixtures
export const FOOTBALL_MAX_DAYS = 14 // skip football fixtures further out than this (keep the board timely)
