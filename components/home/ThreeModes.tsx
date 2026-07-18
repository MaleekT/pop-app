import Link from 'next/link'
import type { ReactNode } from 'react'
import { MarketsIcon, DuelIcon, ParlayIcon } from '@/components/home/icons'

// The section that finally explains what POP is now: three distinct games under one protocol.
// Each mode states what it is, who it is for, and the honest catch. The tradeoff is the point,
// it is what keeps this from reading like generic marketing.

interface Mode {
  key: string
  icon: ReactNode
  tint: string
  name: string
  tagline: string
  who: string
  catch: string
  cta: string
  href: string
  featured?: boolean
}

const MODES: Mode[] = [
  {
    key: 'markets',
    icon: <MarketsIcon size={26} />,
    tint: 'var(--color-pop-accent)',
    name: 'Markets',
    tagline: 'Back an outcome in a shared pool. When it settles, the winning side splits the entire pot.',
    who: 'Anyone. No opponent needed, you bet against the pool rather than a person.',
    catch: 'Parimutuel: the odds move as money comes in, so your payout is provisional until betting closes.',
    cta: 'Explore markets',
    href: '/predict',
    featured: true,
  },
  {
    key: 'duel',
    icon: <DuelIcon size={24} />,
    tint: '#FF3DA1',
    name: '1v1',
    tagline: 'Challenge a specific friend. Both stake USDC, the agent calls it, the winner takes the pot.',
    who: 'You and someone who will take the other side.',
    catch: 'Needs a counterparty. The bet only goes live once your friend accepts and matches the stake.',
    cta: 'Challenge a friend',
    href: '/new',
  },
  {
    key: 'parlay',
    icon: <ParlayIcon size={24} />,
    tint: '#60A5FA',
    name: 'Parlay',
    tagline: 'Stack 2 to 5 open markets into one ticket. Every leg must hit; the multiplier locks when you buy.',
    who: 'Bigger swings and longer odds, up to 15x across five legs.',
    catch: 'All-or-nothing, and it pays from a house pool that keeps a 10% edge.',
    cta: 'Build a parlay',
    href: '/parlay',
  },
]

function IconBadge({ icon, tint }: { icon: ReactNode; tint: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 48,
        height: 48,
        borderRadius: 12,
        color: tint,
        background: `color-mix(in srgb, ${tint} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${tint} 30%, transparent)`,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  )
}

function DetailRows({ who, mode }: { who: string; mode: Mode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-pop-muted)', marginBottom: 4 }}>For</div>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--color-pop-text)' }}>{who}</p>
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: mode.tint, marginBottom: 4 }}>The catch</div>
        <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--color-pop-muted)' }}>{mode.catch}</p>
      </div>
    </div>
  )
}

function ModeCard({ mode }: { mode: Mode }) {
  const cta = (
    <Link href={mode.href} className={`hero-cta ${mode.featured ? 'hero-cta-primary' : 'hero-cta-secondary'}`} style={{ alignSelf: 'flex-start' }}>
      {mode.cta} →
    </Link>
  )

  if (mode.featured) {
    return (
      <div className="mode-card mode-featured mode-card-featured">
        <div className="mode-featured-inner">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: '1 1 300px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <IconBadge icon={mode.icon} tint={mode.tint} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#0a0a0a', background: 'var(--color-pop-accent)', borderRadius: 'var(--radius-pill)', padding: '3px 10px' }}>Start here</span>
            </div>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 3vw, 2.75rem)', letterSpacing: '0.02em', color: 'var(--color-pop-text)' }}>{mode.name}</h3>
            <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.6, color: 'var(--color-pop-muted)' }}>{mode.tagline}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, flex: '1 1 300px' }}>
            <DetailRows who={mode.who} mode={mode} />
            {cta}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mode-card">
      <IconBadge icon={mode.icon} tint={mode.tint} />
      <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.75rem', letterSpacing: '0.02em', color: 'var(--color-pop-text)' }}>{mode.name}</h3>
      <p style={{ margin: 0, fontSize: '0.9375rem', lineHeight: 1.6, color: 'var(--color-pop-muted)' }}>{mode.tagline}</p>
      <div style={{ height: 1, background: 'var(--color-pop-surface-2)' }} />
      <DetailRows who={mode.who} mode={mode} />
      <div style={{ marginTop: 'auto', paddingTop: 4 }}>{cta}</div>
    </div>
  )
}

export function ThreeModes() {
  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
      <div style={{ marginBottom: 40, maxWidth: 640 }}>
        <div style={{ color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14, fontFamily: 'var(--font-mono)' }}>THREE WAYS TO PLAY</div>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3.25rem)', margin: '0 0 16px', letterSpacing: '0.02em' }}>
          ONE PROTOCOL, THREE GAMES
        </h2>
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '1rem', lineHeight: 1.7, margin: 0 }}>
          Back a shared pool, go head-to-head with a friend, or stack picks into a parlay. Same USDC, same agent reading public data, same on-chain settlement.
        </p>
      </div>

      <div className="modes-grid">
        {MODES.map((mode) => (
          <ModeCard key={mode.key} mode={mode} />
        ))}
      </div>
    </section>
  )
}
