'use client'

import { useLayoutEffect, useState } from 'react'
import Link from 'next/link'
import { OddsBar } from '@/components/predict/OddsBar'
import { categoryPillStyle, categoryLabel, formatMarketTitle } from '@/components/predict/ui'
import { useMarketOdds } from '@/components/home/useMarketOdds'
import type { MarketRow } from '@/lib/markets/db.types'

// Live "closes in" string, re-rendered every second. Display only, never a claim about money.
// "now" is read only inside the effect (never during render) so the component stays pure.
function formatClosesIn(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  const totalSec = Math.floor(Math.max(0, ms) / 1000)
  const d = Math.floor(totalSec / 86400)
  const h = Math.floor((totalSec % 86400) / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m ${s}s`
}

// useLayoutEffect (not useEffect) so the first painted frame already has the value. This card only
// ever mounts client-side after the markets fetch resolves, so there is no SSR pass to warn about.
function useClosesIn(targetMs: number): string {
  const [label, setLabel] = useState(() => (Number.isFinite(targetMs) ? '' : '—'))
  useLayoutEffect(() => {
    const update = () => setLabel(formatClosesIn(targetMs - Date.now()))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [targetMs])
  return label
}

// The hero centrepiece: a real open market with live on-chain odds. See useMarketOdds for why a
// partial read collapses to a dash instead of an invented percentage.
export function HeroMarketCard({ market }: { market: MarketRow }) {
  const { pools, total } = useMarketOdds(market)
  const closesIn = useClosesIn(new Date(market.resolve_at).getTime())

  return (
    <div
      style={{
        background: 'var(--color-pop-surface)',
        border: '1px solid var(--color-pop-surface-2)',
        borderRadius: 20,
        padding: 22,
        boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-pop-muted)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-pop-accent)', flexShrink: 0 }} />
          Live market
        </span>
        <span style={categoryPillStyle(market.category)}>{categoryLabel(market.category)}</span>
      </div>

      {/* Not a heading: this is a card title sitting directly under the page h1, and marking it up
          as one created an h1 -> h3 jump in the document outline. */}
      <p style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.3, color: 'var(--color-pop-text)' }}>
        {formatMarketTitle(market.definition_text)}
      </p>

      <OddsBar outcomes={market.outcomes} pools={pools} total={total} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 14, borderTop: '1px solid var(--color-pop-surface-2)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', color: 'var(--color-pop-muted)' }}>
          Closes in <span style={{ color: 'var(--color-pop-text)' }}>{closesIn}</span>
        </span>
        <Link href={`/predict/${market.on_chain_id}`} style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-pop-accent)', textDecoration: 'none' }}>
          View market →
        </Link>
      </div>
    </div>
  )
}

// Neutral placeholder shown when there is no open market to feature, or before the board loads.
// It never fabricates a market, it just holds the space and points at the board.
export function HeroMarketCardSkeleton({ empty = false }: { empty?: boolean }) {
  return (
    <div
      style={{
        background: 'var(--color-pop-surface)',
        border: '1px dashed var(--color-pop-surface-2)',
        borderRadius: 20,
        padding: 22,
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        textAlign: 'center',
      }}
    >
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-pop-muted)' }}>
        {empty ? 'No open markets right now' : 'Loading markets'}
      </span>
      {empty && (
        <Link href="/predict" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-pop-accent)', textDecoration: 'none' }}>
          Open the board →
        </Link>
      )}
    </div>
  )
}
