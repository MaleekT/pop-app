'use client'

import Link from 'next/link'
import { MarketStatusBadge } from '@/components/predict/MarketStatusBadge'
import { categoryLabel, categoryPillStyle, outcomeColor, formatMarketTitle } from '@/components/predict/ui'
import type { MarketRow } from '@/lib/markets/db.types'

// The wallet's own outcome vs the market result, for the Activity view. A settled market states
// which outcome won, but a user needs to know whether THEY won — otherwise "Settled" alone is
// vague and they have to remember which side they took.
function personalResult(market: MarketRow, backed: number): { label: string; color: string } | null {
  if (market.status === 'Voided') return { label: 'Refunded', color: '#60A5FA' }
  if (market.status !== 'Resolved' || market.resolved_outcome == null) return null
  return market.resolved_outcome === backed
    ? { label: 'You won', color: 'var(--color-pop-win)' }
    : { label: 'You lost', color: 'var(--color-pop-danger)' }
}

interface MarketCardProps {
  market: MarketRow
  // Where this card leads. REQUIRED on purpose. It used to hardcode `/predict/${on_chain_id}`, which
  // meant the Activity list had no way to keep its own users inside Activity: one component, one
  // baked-in destination, two sections needing different ones. A default would silently put that bug
  // back the moment a third call site forgets to think about it, so the compiler asks instead.
  href: string
  // For the Activity tab, where a user tracks their own positions and still needs to see
  // Settled/Cancelled. The board never passes it: every card there is open by definition, so the
  // colour-coded type pill carries the whole header.
  showStatus?: boolean
  // The side this wallet took (Activity-only), which drives the "You backed X / You won" line.
  backedOutcome?: number
}

export function MarketCard({ market, href, showStatus = false, backedOutcome }: MarketCardProps) {
  const resolveMs = new Date(market.resolve_at).getTime()
  const bettingOpen = market.status === 'Pending' && resolveMs > Date.now()
  const backedLabel = backedOutcome != null ? market.outcomes[backedOutcome] : undefined
  const result = backedOutcome != null ? personalResult(market, backedOutcome) : null

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
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
          <span style={categoryPillStyle(market.category)}>{categoryLabel(market.category)}</span>
          {showStatus && <MarketStatusBadge status={market.status} resolveAt={market.resolve_at} />}
        </div>

        <p style={{ margin: 0, color: 'var(--color-pop-text)', fontWeight: 600, fontSize: '1rem', lineHeight: 1.4, flex: 1 }}>
          {formatMarketTitle(market.definition_text)}
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

        {backedLabel && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 10, borderTop: '1px solid var(--color-pop-surface-2)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--color-pop-muted)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: outcomeColor(backedOutcome!) }} />
              You backed&nbsp;<span style={{ color: 'var(--color-pop-text)', fontWeight: 600 }}>{backedLabel}</span>
            </span>
            {result && (
              <span style={{ color: result.color, fontWeight: 700, fontSize: '0.78rem', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {result.label}
              </span>
            )}
          </div>
        )}

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
