'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { HeroCanvas } from '@/components/home/HeroCanvas'
import { HeroMarketCard, HeroMarketCardSkeleton } from '@/components/home/HeroMarketCard'
import { StatsBar } from '@/components/home/StatsBar'
import { useMarkets, openSorted } from '@/components/home/useMarkets'

export function Hero() {
  const [canvasOn, setCanvasOn] = useState(false)
  const { markets } = useMarkets()

  // Feature a real open market: soonest to close, so the countdown always reads "live".
  // The bento deliberately starts from the next one so the same market is not shown twice.
  const open = openSorted(markets)
  const market = markets === null ? undefined : (open[0] ?? null)

  // Canvas is a desktop-only affordance; never mount it on phones.
  useEffect(() => {
    const mq = matchMedia('(min-width: 768px)')
    const apply = () => setCanvasOn(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  return (
    <header style={{ position: 'relative', overflow: 'hidden', borderBottom: '1px solid var(--color-pop-surface-2)' }}>
      {canvasOn && <HeroCanvas />}
      {/* Fade the field into the page so the copy stays readable */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 15% 0%, transparent 40%, var(--color-pop-bg) 100%)', pointerEvents: 'none' }} />

      <div className="hero-grid" style={{ position: 'relative', zIndex: 2, maxWidth: 1200, margin: '0 auto', padding: '80px 32px 96px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 26 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(3.25rem, 5.6vw, 5.5rem)', lineHeight: 0.95, letterSpacing: '0.02em', margin: 0 }}>
            <span style={{ color: 'var(--color-pop-text)', display: 'block' }}>PREDICT ANYTHING.</span>
            <span style={{ color: 'var(--color-pop-accent)', display: 'block' }}>SETTLE WITHOUT DOUBT.</span>
          </h1>

          <p style={{ color: 'var(--color-pop-muted)', fontSize: 'clamp(1rem, 1.5vw, 1.125rem)', lineHeight: 1.7, maxWidth: 480, margin: 0 }}>
            Back live prediction markets, settled automatically by an agent reading public data. Go head-to-head with a friend 1v1, or stack picks into a parlay. Stake USDC on Arc, collect on-chain.
          </p>

          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link href="/predict" className="hero-cta hero-cta-primary">Explore markets ↗</Link>
            <Link href="/new" className="hero-cta hero-cta-secondary">Challenge a friend ↗</Link>
          </div>

          <StatsBar />
        </div>

        {/* alignSelf: stretch gives this column the full row height (set by the copy beside it), which
            is what the card's percentage height resolves against. alignItems: center then keeps the
            card optically centred against the text exactly as before. */}
        <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'stretch' }}>
          {market === undefined
            ? <HeroMarketCardSkeleton />
            : market === null
              ? <HeroMarketCardSkeleton empty />
              : <HeroMarketCard market={market} />}
        </div>
      </div>
    </header>
  )
}
