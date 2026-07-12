import type { MarketStatus } from '@/lib/markets/db.types'

// Plain-language status for Predict markets. With instant resolution there is no lingering
// "Proposed" limbo, so a closed-but-unsettled market reads simply as "Resolving".
interface Tone { label: string; color: string }

const TONES: Record<string, Tone> = {
  open:      { label: 'Open',         color: '#D7FF1E' },
  resolving: { label: 'Resolving',    color: '#60A5FA' },
  review:    { label: 'Under review', color: '#F97316' },
  settled:   { label: 'Settled',      color: '#22C55E' },
  cancelled: { label: 'Cancelled',    color: '#71717A' },
}

function toneFor(status: MarketStatus, resolveAt?: string): Tone {
  if (status === 'Resolved') return TONES.settled
  if (status === 'Voided') return TONES.cancelled
  if (status === 'Challenged') return TONES.review
  if (status === 'Proposed') return TONES.resolving
  // Pending: "Open" while betting is live, otherwise it is closed and settling.
  const closesAt = resolveAt ? new Date(resolveAt).getTime() : NaN
  if (!Number.isNaN(closesAt) && closesAt <= Date.now()) return TONES.resolving
  return TONES.open
}

export function MarketStatusBadge({ status, resolveAt }: { status: MarketStatus; resolveAt?: string }) {
  const s = toneFor(status, resolveAt)
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
