'use client'

import Link from 'next/link'
import { Logo } from '@/components/Logo'

// Global footer, one design on every page (mounted once in app/layout.tsx). The top nav
// stays lean, so the footer carries the About / FAQ links plus section shortcuts, and the
// X social.

const LINK_GROUPS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: 'Play',
    links: [
      { label: 'Lobby', href: '/lobby' },
      { label: 'Predict', href: '/predict' },
      { label: 'Activity', href: '/activity' },
    ],
  },
  {
    heading: 'Learn',
    links: [
      { label: 'About', href: '/#about' },
      { label: 'FAQ', href: '/#faq' },
    ],
  },
]

export function Footer() {
  return (
    <footer
      style={{
        marginTop: 'auto',
        borderTop: '1px solid var(--color-pop-surface-2)',
        background: 'rgba(11,11,15,0.6)',
        padding: '40px 32px 32px',
      }}
    >
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 40,
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 300 }}>
          <Logo size="lg" />
          <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            Settle 1v1 bets and predict outcomes with friends. Stake USDC, let the agent call it.
          </p>
          <span
            style={{
              alignSelf: 'flex-start',
              fontSize: '0.68rem',
              fontWeight: 600,
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-pop-muted)',
              background: 'var(--color-pop-surface-2)',
              borderRadius: 'var(--radius-pill)',
              padding: '3px 10px',
            }}
          >
            Arc testnet
          </span>
        </div>

        <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap' }}>
          {LINK_GROUPS.map((group) => (
            <nav key={group.heading} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-pop-muted)', opacity: 0.7 }}>
                {group.heading}
              </span>
              {group.links.map(({ label, href }) => (
                <Link key={label} href={href} className="nav-link" style={{ color: 'var(--color-pop-text)', fontSize: '0.9rem', textDecoration: 'none' }}>
                  {label}
                </Link>
              ))}
            </nav>
          ))}
        </div>
      </div>

      <div
        style={{
          maxWidth: 1100,
          margin: '32px auto 0',
          paddingTop: 20,
          borderTop: '1px solid var(--color-pop-surface-2)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.72rem', opacity: 0.75 }}>
          © 2026 POP · Testnet only · No real funds
        </span>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a
            href="https://x.com/_pop_arc"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="POP on X"
            style={{ color: 'var(--color-pop-muted)', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-pop-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-pop-muted)')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
      </div>
    </footer>
  )
}
