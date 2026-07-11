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

export const CRYPTO_COINS: CryptoCoin[] = [
  { id: 'bitcoin', name: 'Bitcoin' },
  { id: 'ethereum', name: 'Ethereum' },
  { id: 'solana', name: 'Solana' },
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

// How many OPEN markets to keep alive PER COIN (so the board stays balanced across coins
// instead of filling up with one), and the hard per-run creation cap (a bad config or
// price glitch can never spam more than this many markets in a single run).
export const TARGET_OPEN_PER_COIN = 2
export const MAX_CREATES_PER_RUN = 5

// ── Sports ───────────────────────────────────────────────────────────────────
// Teams to auto-list upcoming matches for. tsdbId is the TheSportsDB team id (same source
// the resolver uses); add or remove freely. A mix of national sides (active during summer
// tournaments like the 2026 World Cup), clubs (domestic season) and NBA (Oct–Jun), so some
// always have fixtures whatever the season.
export const SPORTS_FOLLOW: FollowedTeam[] = [
  { name: 'Spain', tsdbId: '133909', sport: 'football' },
  { name: 'Brazil', tsdbId: '134496', sport: 'football' },
  { name: 'Argentina', tsdbId: '134509', sport: 'football' },
  { name: 'France', tsdbId: '133913', sport: 'football' },
  { name: 'England', tsdbId: '133914', sport: 'football' },
  { name: 'Portugal', tsdbId: '133908', sport: 'football' },
  { name: 'Real Madrid', tsdbId: '133738', sport: 'football' },
  { name: 'Manchester City', tsdbId: '133613', sport: 'football' },
  { name: 'Los Angeles Lakers', tsdbId: '134867', sport: 'basketball' },
  { name: 'Boston Celtics', tsdbId: '134860', sport: 'basketball' },
]

export const TARGET_OPEN_SPORTS = 6 // how many open sports markets to keep alive
export const FIXTURES_PER_TEAM = 2  // inspect each followed team's next N fixtures
