import type { BetStatus } from '@/lib/db.types'

const STATUS_STYLES: Record<BetStatus, { label: string; color: string; bg: string }> = {
  Pending:   { label: 'Awaiting',  color: '#FBBF24', bg: 'rgba(251,191,36,0.12)' },
  Locked:    { label: 'Active',    color: '#D7FF1E', bg: 'rgba(215,255,30,0.10)' },
  Proposed:  { label: 'Proposed',  color: '#60A5FA', bg: 'rgba(96,165,250,0.12)' },
  Resolved:  { label: 'Resolved',  color: '#22C55E', bg: 'rgba(34,197,94,0.12)'  },
  Disputed:  { label: 'Disputed',  color: '#F97316', bg: 'rgba(249,115,22,0.12)' },
  Cancelled: { label: 'Cancelled', color: '#71717A', bg: 'rgba(113,113,122,0.12)'},
  Expired:   { label: 'Expired',   color: '#71717A', bg: 'rgba(113,113,122,0.12)'},
  Open:      { label: 'Open',      color: '#A78BFA', bg: 'rgba(167,139,250,0.12)'},
  Voided:    { label: 'Voided',    color: '#71717A', bg: 'rgba(113,113,122,0.12)'},
}

export function StatusBadge({ status }: { status: BetStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.Pending
  return (
    <span
      style={{
        color: s.color,
        backgroundColor: s.bg,
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
