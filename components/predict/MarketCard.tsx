'use client'

import Link from 'next/link'
import { MarketStatusBadge } from '@/components/predict/MarketStatusBadge'
import { categoryLabel, chipStyle, outcomeColor } from '@/components/predict/ui'
import { formatBetTitle } from '@/lib/display-name'
import type { MarketRow } from '@/lib/markets/db.types'

export function MarketCard({ market }: { market: MarketRow }) {
  const resolveMs = new Date(market.resolve_at).getTime()
  const bettingOpen = market.status === 'Pending' && resolveMs > Date.now()

  return (
    <Link href={`/predict/${market.on_chain_id}`} style={{ textDecoration: 'none' }}>
      <div
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'rgba(215,255,30,0.35)'
          e.currentTarget.style.transform = 'translateY(-3px)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-pop-surface-2)'
          e.currentTarget.style.transform = 'translateY(0)'
        }}
        style={{
          background: 'var(--color-pop-surface)',
          border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)',
          padding: 20,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          transition: 'border-color 0.2s ease, transform 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={chipStyle}>{categoryLabel(market.category)}</span>
          <MarketStatusBadge status={market.status} />
        </div>

        <p style={{ margin: 0, color: 'var(--color-pop-text)', fontWeight: 600, fontSize: '1rem', lineHeight: 1.4, flex: 1 }}>
          {formatBetTitle(market.definition_text)}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {market.outcomes.map((label, i) => (
            <span
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: '0.8rem',
                color: 'var(--color-pop-muted)',
                border: '1px solid var(--color-pop-surface-2)',
                borderRadius: 'var(--radius-pill)',
                padding: '3px 10px',
              }}
            >
              <span style={{ width: 8, height: 8, borderRadius: 2, background: outcomeColor(i) }} />
              {label}
            </span>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 'auto' }}>
          {bettingOpen ? (
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.78rem' }}>
              Closes in{' '}
              <span style={{ color: 'var(--color-pop-text)', fontFamily: 'var(--font-mono)' }}>
                {formatShort(resolveMs - Date.now())}
              </span>
            </span>
          ) : (
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.78rem' }}>Betting closed</span>
          )}
          <span style={{ color: 'var(--color-pop-accent)', fontWeight: 600, fontSize: '0.85rem' }}>View →</span>
        </div>
      </div>
    </Link>
  )
}

function formatShort(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000))
  const d = Math.floor(totalMin / 1440)
  const h = Math.floor((totalMin % 1440) / 60)
  const m = totalMin % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
