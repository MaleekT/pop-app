// Tunable knobs for the autonomous market curator (Option B). Plain constants — edit
// and redeploy to retune. No secrets here. See docs/predict-auto-curator-spec.md.

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

export const PRICE_BANDS: PriceBand[] = [
  { label: 'up5', direction: 'above', pct: 0.05 },
  { label: 'up10', direction: 'above', pct: 0.10 },
  { label: 'down5', direction: 'below', pct: 0.05 },
]

export const HORIZONS: Horizon[] = [
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
]

// How many OPEN markets to keep alive per category, and the hard per-run creation cap
// (a bad config or price glitch can never spam more than this many per run).
export const TARGET_OPEN: Record<string, number> = { crypto: 6 }
export const MAX_CREATES_PER_RUN = 3
