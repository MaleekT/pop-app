import type { ReactNode } from 'react'

// Shared stat chip + row, used by the 1v1 bets list and the Activity Predictions/Parlays tabs.

type StatVariant = 'accent' | 'danger' | 'muted' | 'default'

interface StatChipProps { label: string; value: number; variant?: StatVariant }

export function StatChip({ label, value, variant = 'default' }: StatChipProps) {
  const valueColor = variant === 'accent'
    ? 'var(--color-pop-accent)'
    : variant === 'danger'
      ? 'var(--color-pop-danger)'
      : variant === 'muted'
        ? 'var(--color-pop-muted)'
        : 'var(--color-pop-text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: valueColor, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--color-pop-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

export function StatRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 32,
        marginBottom: 28,
        padding: '16px 20px',
        background: 'var(--color-pop-surface)',
        border: '1px solid var(--color-pop-surface-2)',
        borderRadius: 'var(--radius-card)',
        flexWrap: 'wrap',
      }}
    >
      {children}
    </div>
  )
}
