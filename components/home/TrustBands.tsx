'use client'

import Link from 'next/link'
import { formatMarketTitle, categoryColor } from '@/components/predict/ui'
import { useMarkets, openSorted } from '@/components/home/useMarkets'
import { formatCloseTime } from '@/components/home/format'

// Honest brand tokens. Every one is true across all three products. No "no house" (parlays pay from
// a house pool) and no "~3s payout" (settlement is agent + on-chain, not instant).
const BRAND_TOKENS = ['Stake USDC', 'Agent-settled', 'Public data', 'Non-custodial', 'On-chain', 'Open resolver', 'Arc testnet'] as const

interface TickerItem { id: string; href: string; title: string; closes: string; color: string }

// The marquee is static brand copy; the ticker scrolls real open markets from the shared board fetch.
// No invented users or winnings, only markets that are genuinely open right now.
export function TrustBands() {
  const { markets } = useMarkets()

  const items: TickerItem[] = openSorted(markets).map((m) => ({
    id: `${m.contract_address}-${m.on_chain_id}`,
    href: `/predict/${m.on_chain_id}`,
    title: formatMarketTitle(m.definition_text),
    closes: formatCloseTime(m.resolve_at),
    color: categoryColor(m.category),
  }))

  return (
    <section aria-label="Live status" style={{ borderBottom: '1px solid var(--color-pop-surface-2)' }}>
      <div style={{ background: 'var(--color-pop-accent)', color: '#0b0b0f', overflow: 'hidden', padding: '11px 0' }}>
        <div className="pop-marquee-track">
          <BrandRow />
          <BrandRow ariaHidden />
        </div>
      </div>

      {items.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-pop-surface-2)', background: 'var(--color-pop-bg)', overflow: 'hidden', padding: '10px 0' }}>
          <div className="pop-ticker-track">
            <TickerRow items={items} />
            <TickerRow items={items} ariaHidden />
          </div>
        </div>
      )}
    </section>
  )
}

function BrandRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 34, paddingRight: 34, flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}
    >
      {BRAND_TOKENS.map((t) => (
        <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 34 }}>
          {t}<span aria-hidden="true" style={{ opacity: 0.5 }}>✦</span>
        </span>
      ))}
    </div>
  )
}

function TickerRow({ items, ariaHidden = false }: { items: TickerItem[]; ariaHidden?: boolean }) {
  return (
    <div
      aria-hidden={ariaHidden || undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 28, paddingRight: 28, flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}
    >
      {items.map((it) => (
        <Link
          key={it.id}
          href={it.href}
          tabIndex={ariaHidden ? -1 : undefined}
          aria-hidden={ariaHidden || undefined}
          className="pop-ticker-link"
        >
          <span style={{ width: 7, height: 7, borderRadius: 2, background: it.color, flexShrink: 0 }} />
          <span style={{ color: 'var(--color-pop-text)' }}>{it.title}</span>
          <span style={{ color: 'var(--color-pop-muted)' }}>· closes {it.closes}</span>
        </Link>
      ))}
    </div>
  )
}
