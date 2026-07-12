import { outcomeColor, impliedPct } from '@/components/predict/ui'

interface OddsBarProps {
  outcomes: string[]
  pools: bigint[]
  total: bigint
  resolvedOutcome?: number | null
}

// Parimutuel odds: each outcome's share of the pot is its implied probability.
export function OddsBar({ outcomes, pools, total, resolvedOutcome }: OddsBarProps) {
  const hasVolume = total > 0n
  const pcts = outcomes.map((_, i) => impliedPct(pools[i] ?? 0n, total))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div
        style={{
          display: 'flex',
          height: 12,
          borderRadius: 'var(--radius-pill)',
          overflow: 'hidden',
          background: 'var(--color-pop-surface-2)',
        }}
      >
        {hasVolume
          ? outcomes.map((_, i) => {
              const pct = pcts[i]
              return pct > 0 ? <div key={i} style={{ width: `${pct}%`, background: outcomeColor(i) }} /> : null
            })
          : null}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {outcomes.map((label, i) => {
          const pct = pcts[i]
          const isWinner = resolvedOutcome === i
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: outcomeColor(i), flexShrink: 0 }} />
                <span
                  style={{
                    color: 'var(--color-pop-text)',
                    fontWeight: isWinner ? 700 : 600,
                    fontSize: '0.9rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                  {isWinner ? ' ✓' : ''}
                </span>
              </span>
              <span style={{ color: 'var(--color-pop-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', flexShrink: 0 }}>
                {hasVolume ? `${pct.toFixed(1)}%` : '—'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
