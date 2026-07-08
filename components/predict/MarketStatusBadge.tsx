import type { MarketStatus } from '@/lib/markets/db.types'

// Predict markets have their own status set (adds Challenged, drops the 1v1-only
// Locked/Disputed), so this is a sibling to the PvP StatusBadge rather than a reuse.
const STYLES: Record<MarketStatus, { label: string; color: string }> = {
  Pending:    { label: 'Open',       color: '#D7FF1E' },
  Proposed:   { label: 'Proposed',   color: '#60A5FA' },
  Challenged: { label: 'Challenged', color: '#F97316' },
  Resolved:   { label: 'Resolved',   color: '#22C55E' },
  Voided:     { label: 'Voided',     color: '#71717A' },
}

export function MarketStatusBadge({ status }: { status: MarketStatus }) {
  const s = STYLES[status] ?? STYLES.Pending
  return (
    <span
      style={{
        color: s.color,
        backgroundColor: `${s.color}1f`,
        border: `1px solid ${s.color}33`,
        borderRadius: 'var(--radius-pill)',
        padding: '2px 10px',
        fontSize: '0.75rem',
        fontWeight: 600,
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
      }}
    >
      {s.label}
    </span>
  )
}
