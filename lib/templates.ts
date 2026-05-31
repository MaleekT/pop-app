export type TemplateKey =
  | 'crypto_price_above'
  | 'crypto_price_below'
  | 'sports_winner'
  | 'sports_score'
  | 'youtube_views'
  | 'youtube_subs'

export interface TemplateField {
  name: string
  label: string
  type: 'text' | 'number' | 'date'
  placeholder?: string
}

export interface Template {
  key: TemplateKey
  title: string
  description: string
  fields: TemplateField[]
  boundSource: string
  /** Returns the canonical human-readable bet definition string from field values */
  definition(params: Record<string, string>): string
  /** Which engine resolves this template */
  engine: 'crypto-price' | 'youtube' | 'sports'
}

export const TEMPLATES: Record<TemplateKey, Template> = {
  crypto_price_above: {
    key: 'crypto_price_above',
    title: 'Crypto price above',
    description: 'Will a coin be trading above a price at a given time?',
    fields: [
      { name: 'coin', label: 'Coin ID', type: 'text', placeholder: 'bitcoin' },
      { name: 'target', label: 'Target price (USD)', type: 'number', placeholder: '100000' },
      { name: 'resolveAt', label: 'Resolve date/time', type: 'date' },
    ],
    boundSource: 'CoinGecko public API — /simple/price',
    definition: (p) =>
      `${p.coinName ?? p.coin} price will be ABOVE $${p.target} USD at ${p.resolveAt} (UTC) per CoinGecko`,
    engine: 'crypto-price',
  },

  crypto_price_below: {
    key: 'crypto_price_below',
    title: 'Crypto price below',
    description: 'Will a coin be trading below a price at a given time?',
    fields: [
      { name: 'coin', label: 'Coin ID', type: 'text', placeholder: 'bitcoin' },
      { name: 'target', label: 'Target price (USD)', type: 'number', placeholder: '80000' },
      { name: 'resolveAt', label: 'Resolve date/time', type: 'date' },
    ],
    boundSource: 'CoinGecko public API — /simple/price',
    definition: (p) =>
      `${p.coinName ?? p.coin} price will be BELOW $${p.target} USD at ${p.resolveAt} (UTC) per CoinGecko`,
    engine: 'crypto-price',
  },

  sports_winner: {
    key: 'sports_winner',
    title: 'Sports match winner',
    description: 'Who will win a specific sports match?',
    fields: [
      { name: 'sport', label: 'Sport', type: 'text', placeholder: 'football' },
      { name: 'fixtureId', label: 'Match', type: 'text', placeholder: '' },
      { name: 'homeTeam', label: 'Home team', type: 'text', placeholder: '' },
      { name: 'awayTeam', label: 'Away team', type: 'text', placeholder: '' },
      { name: 'pickedTeam', label: 'Winner', type: 'text', placeholder: '' },
    ],
    boundSource: 'TheSportsDB / API-Football',
    definition: (p) =>
      `${p.pickedTeam || 'TBD'} will WIN ${p.homeTeam || 'home'} vs ${p.awayTeam || 'away'} (${p.sport || 'sports'} fixture #${p.fixtureId}) per TheSportsDB`,
    engine: 'sports',
  },

  sports_score: {
    key: 'sports_score',
    title: 'Sports score over/under',
    description: 'Will total goals/points in a match be over a threshold?',
    fields: [
      { name: 'sport', label: 'Sport', type: 'text', placeholder: 'football' },
      { name: 'fixtureId', label: 'Match', type: 'text', placeholder: '' },
      { name: 'homeTeam', label: 'Home team', type: 'text', placeholder: '' },
      { name: 'awayTeam', label: 'Away team', type: 'text', placeholder: '' },
      { name: 'target', label: 'Score threshold', type: 'number', placeholder: '2.5' },
      { name: 'direction', label: 'Over or Under', type: 'text', placeholder: 'OVER' },
    ],
    boundSource: 'TheSportsDB / API-Football',
    definition: (p) =>
      `Total ${p.sport === 'basketball' ? 'points' : 'goals'} in ${p.homeTeam || 'home'} vs ${p.awayTeam || 'away'} (${p.sport || 'sports'} fixture #${p.fixtureId}) will be ${(p.direction || 'OVER').toUpperCase()} ${p.target} per TheSportsDB`,
    engine: 'sports',
  },

  youtube_views: {
    key: 'youtube_views',
    title: 'YouTube video views',
    description: 'Will a YouTube video reach a view count milestone?',
    fields: [
      { name: 'videoId', label: 'YouTube Video ID', type: 'text', placeholder: 'dQw4w9WgXcQ' },
      { name: 'target', label: 'Target view count', type: 'number', placeholder: '1000000' },
      { name: 'resolveAt', label: 'Resolve date/time', type: 'date' },
    ],
    boundSource: 'YouTube Data API v3 — videos.list',
    definition: (p) =>
      `YouTube video ${p.videoId} will have AT LEAST ${p.target} views by ${p.resolveAt} (UTC) per YouTube Data API v3`,
    engine: 'youtube',
  },

  youtube_subs: {
    key: 'youtube_subs',
    title: 'YouTube channel subscribers',
    description: 'Will a YouTube channel reach a subscriber milestone?',
    fields: [
      { name: 'channelId', label: 'YouTube Channel ID', type: 'text', placeholder: 'UCxxxxxx' },
      { name: 'target', label: 'Target subscriber count', type: 'number', placeholder: '100000' },
      { name: 'resolveAt', label: 'Resolve date/time', type: 'date' },
    ],
    boundSource: 'YouTube Data API v3 — channels.list',
    definition: (p) =>
      `YouTube channel ${p.channelId} will have AT LEAST ${p.target} subscribers by ${p.resolveAt} (UTC) per YouTube Data API v3`,
    engine: 'youtube',
  },
}

export function getTemplate(key: string): Template {
  const t = TEMPLATES[key as TemplateKey]
  if (!t) throw new Error(`Unknown template key: ${key}`)
  return t
}
