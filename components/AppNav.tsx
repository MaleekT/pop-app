'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Logo } from '@/components/Logo'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/#about' },
  { label: 'FAQ', href: '/#faq' },
  { label: 'Lobby', href: '/lobby' },
] as const

export function AppNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        padding: '12px 24px',
        background: 'rgba(11,11,15,0.92)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-pop-surface-2)',
      }}
    >
      <Logo size="sm" />

      <div className="nav-links">
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

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <ConnectButton />
      </div>
    </nav>
  )
}
