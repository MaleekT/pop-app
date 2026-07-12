import type { CSSProperties } from 'react'

// Shared Predict-section UI tokens + helpers. Mirrors the inline-style conventions
// used across the PvP pages (app/new, app/bet) so Predict looks native to POP.

export function friendlyTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('timeout') || msg.includes('network')) {
    return 'Network error: could not reach the chain. Check your connection and try again.'
  }
  if (msg.toLowerCase().includes('user rejected') || msg.includes('4001')) return 'Transaction cancelled.'
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) return 'Insufficient USDC balance.'
  if (msg.includes('allowance') || msg.includes('ERC20')) return 'USDC approval failed. Please try again.'
  return msg
}

// Outcome slot colours, index-aligned (0 = Yes/Home/Over).
export const OUTCOME_COLORS = ['#D7FF1E', '#FF3DA1', '#60A5FA'] as const

export function outcomeColor(i: number): string {
  return OUTCOME_COLORS[i % OUTCOME_COLORS.length]
}

// Implied probability as a percentage from a parimutuel pool.
export function impliedPct(pool: bigint, total: bigint): number {
  if (total <= 0n) return 0
  return Number((pool * 10_000n) / total) / 100
}

export function categoryLabel(category: string): string {
  if (category === 'crypto') return 'Crypto'
  if (category === 'sports') return 'Sports'
  if (category === 'youtube') return 'YouTube'
  return category
}

export const inputStyle: CSSProperties = {
  background: 'var(--color-pop-surface)',
  border: '1px solid var(--color-pop-surface-2)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-pop-text)',
  padding: '10px 14px',
  fontSize: '0.9375rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

export const ctaStyle: CSSProperties = {
  background: 'var(--color-pop-accent)',
  color: '#0B0B0F',
  fontWeight: 700,
  fontSize: '1rem',
  padding: '14px 0',
  borderRadius: 'var(--radius-cta)',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
}

export const secondaryCtaStyle: CSSProperties = {
  ...ctaStyle,
  background: 'var(--color-pop-surface)',
  color: 'var(--color-pop-text)',
  border: '1px solid var(--color-pop-surface-2)',
}

export const cardStyle: CSSProperties = {
  background: 'var(--color-pop-surface)',
  border: '1px solid var(--color-pop-surface-2)',
  borderRadius: 'var(--radius-card)',
  padding: 24,
}

export const backBtnStyle: CSSProperties = {
  color: 'var(--color-pop-muted)',
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  marginBottom: 24,
  padding: 0,
  fontSize: '0.9rem',
}

export const chipStyle: CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: 'var(--color-pop-muted)',
  background: 'var(--color-pop-surface-2)',
  borderRadius: 'var(--radius-pill)',
  padding: '2px 10px',
}
