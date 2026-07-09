'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Logo } from '@/components/Logo'

const NAV_LINKS = [
  { label: 'Home',  href: '/' },
  { label: 'About', href: '/#about' },
  { label: 'FAQ',   href: '/#faq' },
  { label: 'Lobby', href: '/lobby' },
  { label: 'Predict', href: '/predict' },
  { label: 'Parlay', href: '/parlay' },
] as const

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 32px',
        background: 'rgba(11,11,15,0.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-pop-surface-2)',
      }}
    >
      <Logo size="md" />

      <div
        className="nav-links"
        style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}
      >
        {NAV_LINKS.map(({ label, href }) => {
          const isActive =
            href === '/'
              ? pathname === '/'
              : pathname.startsWith(href.replace('/#', '/'))
          return (
            <Link
              key={href}
              href={href}
              className="nav-link"
              style={{
                color: isActive ? 'var(--color-pop-text)' : undefined,
                fontWeight: isActive ? 700 : undefined,
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/my" className="my-bets-link">My Bets</Link>
        <ConnectButton />
      </div>
    </nav>
  )
}
