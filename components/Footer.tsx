'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Global footer for every page except the landing page, which ships its own richer
// footer. The top nav stays lean, so this footer carries the About / FAQ links
// (plus section shortcuts) on the app pages that would otherwise have none.

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
  const pathname = usePathname()
  // The landing page ships its own richer footer; avoid doubling up.
  if (pathname === '/') return null

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 280 }}>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.6rem', letterSpacing: '-0.02em', color: 'var(--color-pop-text)' }}>
              POP
            </span>
          </Link>
          <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            Settle 1v1 bets and predict outcomes with friends. Stake USDC, let the agent call it.
          </p>
          <span
            style={{
              alignSelf: 'flex-start',
              marginTop: 2,
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
          color: 'var(--color-pop-muted)',
          fontSize: '0.72rem',
          opacity: 0.75,
        }}
      >
        © 2026 POP · Testnet only · No real funds
      </div>
    </footer>
  )
}
