import type { TemplateKey } from '@/lib/templates'

// Shared market-definition builders for the Predict section. Extracted verbatim from
// the create-market form so the autonomous curator produces byte-identical definition
// text (and therefore the same keccak256 definitionHash) as manually created markets.
// The engines resolve from `params`, not from this text, so phrasing is display-only,
// tamper-proofed by its on-chain hash.

// Interprets a datetime-local string ("YYYY-MM-DDTHH:mm") as UTC.
export function asUTC(datetimeLocal: string): Date {
  return new Date(datetimeLocal + ':00Z')
}

export function categoryFor(key: TemplateKey): string {
  if (key.startsWith('crypto_price')) return 'crypto'
  if (key.startsWith('sports')) return 'sports'
  return 'youtube'
}

// Outcome slot labels, index-aligned with the engines (0 = Yes/Home/Over).
export function deriveOutcomes(key: TemplateKey, p: Record<string, string>): string[] {
  if (key === 'sports_winner') return [p.homeTeam || 'Home', p.awayTeam || 'Away', 'Draw']
  if (key === 'sports_score') return ['Over', 'Under']
  return ['Yes', 'No']
}

// Human-readable market question.
export function marketDefinition(key: TemplateKey, p: Record<string, string>): string {
  const coin = p.coinName || p.coin || 'the coin'
  const home = p.homeTeam || 'Home'
  const away = p.awayTeam || 'Away'
  switch (key) {
    case 'crypto_price_above': return `Will ${coin} be ABOVE $${p.target} at ${p.resolveAt} UTC? (CoinGecko)`
    case 'crypto_price_below': return `Will ${coin} be BELOW $${p.target} at ${p.resolveAt} UTC? (CoinGecko)`
    case 'sports_winner':      return `${home} vs ${away}: who wins? (${p.sport || 'sports'} fixture ${p.fixtureId})`
    case 'sports_score':       return `${home} vs ${away}: total ${p.sport === 'basketball' ? 'points' : 'goals'} over or under ${p.target}?`
    case 'youtube_views':      return `Will YouTube video ${p.videoId} reach ${p.target} views by ${p.resolveAt} UTC?`
    case 'youtube_subs':       return `Will YouTube channel ${p.channelId} reach ${p.target} subscribers by ${p.resolveAt} UTC?`
    default:                   return 'Prediction market'
  }
}
