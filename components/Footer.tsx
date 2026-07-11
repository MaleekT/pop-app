'use client'

import Link from 'next/link'
import { Logo } from '@/components/Logo'

// Global footer, one design on every page (mounted once in app/layout.tsx). The top nav
// stays lean, so the footer carries the About / FAQ links plus section shortcuts, and the
// Discord / X socials that used to live only on the home page.

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
            href=""
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            style={{ color: 'var(--color-pop-muted)', transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-pop-text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-pop-muted)')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <a
            href=""
            target="_blank"
            rel="noopener noreferrer"
            aria-label="X (Twitter)"
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
