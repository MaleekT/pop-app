'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { OddsBar } from '@/components/predict/OddsBar'
import { categoryColor, categoryLabel, formatMarketTitle, outcomeColor } from '@/components/predict/ui'
import { useMarkets, openSorted } from '@/components/home/useMarkets'
import { useMarketOdds } from '@/components/home/useMarketOdds'
import { formatCloseTime } from '@/components/home/format'
import { CryptoIcon, SportsIcon, SocialIcon, GlobeIcon } from '@/components/home/icons'
import { Reveal } from '@/components/home/Reveal'
import type { MarketRow } from '@/lib/markets/db.types'

// Replaces the four static category tiles that all pointed at /new, the 1v1 builder. Every cell here
// is a real open market from the board and links to that market. Nothing is invented: no fabricated
// prices, no "128 OPEN" badge, no sparkline of made-up history.

const mono = 'var(--font-mono)'

function CategoryIcon({ category, size = 20 }: { category: string; size?: number }) {
  if (category === 'crypto') return <CryptoIcon size={size} />
  if (category === 'sports') return <SportsIcon size={size} />
  if (category === 'youtube') return <SocialIcon size={size} />
  return <GlobeIcon size={size} />
}

function IconBadge({ category, large = false }: { category: string; large?: boolean }) {
  const tint = categoryColor(category)
  const box = large ? 44 : 38
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: box,
        height: box,
        borderRadius: large ? 12 : 11,
        color: tint,
        background: `color-mix(in srgb, ${tint} 14%, transparent)`,
        flexShrink: 0,
      }}
    >
      <CategoryIcon category={category} size={large ? 23 : 19} />
    </span>
  )
}

function CellShell({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  return (
    <Link href={href} className={className ? `bento-card ${className}` : 'bento-card'}>
      {children}
    </Link>
  )
}

// The flagship reads live pool sizes off-chain-of-the-mirror, straight from the contract.
function FlagshipCell({ market }: { market: MarketRow }) {
  const { pools, total } = useMarketOdds(market)

  return (
    <CellShell href={`/predict/${market.on_chain_id}`} className="bento-flagship">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <IconBadge category={market.category} large />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', letterSpacing: '0.02em' }}>
              {categoryLabel(market.category)}
            </div>
            <div style={{ fontFamily: mono, fontSize: '0.62rem', letterSpacing: '0.1em', color: 'var(--color-pop-muted)' }}>
              OPEN MARKET
            </div>
          </div>
        </div>
        <span style={{ fontFamily: mono, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--color-pop-accent)', border: '1px solid rgba(215,255,30,0.3)', padding: '4px 9px', borderRadius: 20, whiteSpace: 'nowrap' }}>
          LIVE ODDS
        </span>
      </div>

      <p style={{ margin: '20px 0 16px', fontSize: '1.05rem', fontWeight: 600, lineHeight: 1.4, color: 'var(--color-pop-text)' }}>
        {formatMarketTitle(market.definition_text)}
      </p>

      <div style={{ marginTop: 'auto' }}>
        <OddsBar outcomes={market.outcomes} pools={pools} total={total} />
        <div style={{ marginTop: 14, fontFamily: mono, fontSize: '0.68rem', color: 'var(--color-pop-muted)' }}>
          Closes {formatCloseTime(market.resolve_at)}
        </div>
      </div>
    </CellShell>
  )
}

function WideCell({ market }: { market: MarketRow }) {
  return (
    <CellShell href={`/predict/${market.on_chain_id}`} className="bento-wide">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <IconBadge category={market.category} />
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', letterSpacing: '0.02em' }}>
            {categoryLabel(market.category)}
          </div>
        </div>
        <span aria-hidden="true" style={{ color: 'var(--color-pop-muted)', fontSize: '1rem' }}>→</span>
      </div>

      <p className="bento-title" style={{ margin: '14px 0 0', fontSize: '0.92rem', fontWeight: 600, lineHeight: 1.45, color: 'var(--color-pop-text)' }}>
        {formatMarketTitle(market.definition_text)}
      </p>

      <div style={{ marginTop: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, paddingTop: 12 }}>
        {market.outcomes.map((label, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: mono, fontSize: '0.7rem', color: 'var(--color-pop-muted)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-pill)', padding: '3px 10px' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: outcomeColor(i) }} />
            {label}
          </span>
        ))}
      </div>
    </CellShell>
  )
}

function SmallCell({ market }: { market: MarketRow }) {
  return (
    <CellShell href={`/predict/${market.on_chain_id}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <IconBadge category={market.category} />
        <span aria-hidden="true" style={{ color: 'var(--color-pop-muted)', fontSize: '1rem' }}>→</span>
      </div>
      <p className="bento-title" style={{ margin: '14px 0 0', fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.45, color: 'var(--color-pop-text)' }}>
        {formatMarketTitle(market.definition_text)}
      </p>
      <div style={{ marginTop: 'auto', fontFamily: mono, fontSize: '0.62rem', color: 'var(--color-pop-muted)', paddingTop: 10 }}>
        {categoryLabel(market.category).toUpperCase()}
      </div>
    </CellShell>
  )
}

export function MarketsBento() {
  const { markets } = useMarkets()

  // The hero already features the soonest-closing market, so start from the next one and never show
  // the same market twice on one page.
  const featured = openSorted(markets).slice(1, 5)
  const [flagship, wide, ...rest] = featured

  return (
    <section style={{ borderTop: '1px solid var(--color-pop-surface-2)', background: '#0E0E13' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
        <Reveal style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 44 }}>
          <div>
            <div style={{ fontFamily: mono, color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>OPEN MARKETS</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3.25rem)', margin: 0, letterSpacing: '0.02em', lineHeight: 0.98 }}>
              WHAT DO YOU WANT TO CALL?
            </h2>
          </div>
          <Link href="/predict" className="bento-browse">BROWSE ALL MARKETS →</Link>
        </Reveal>

        {!flagship ? (
          <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>No open markets right now</p>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: 0 }}>Fresh markets land regularly. Check the board for the latest.</p>
          </div>
        ) : (
          <div className="bento-grid">
            <FlagshipCell market={flagship} />
            {wide && <WideCell market={wide} />}
            {rest.map((m) => (
              <SmallCell key={`${m.contract_address}-${m.on_chain_id}`} market={m} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
