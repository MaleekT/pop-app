'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { Logo } from '@/components/Logo'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'Predict', href: '/predict' },
  { label: 'Lobby', href: '/lobby' },
  { label: 'Activity', href: '/activity' },
] as const

function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/'
  // Parlay is nested inside the Predict section, so keep Predict lit up there too.
  if (href === '/predict') return pathname.startsWith('/predict') || pathname.startsWith('/parlay')
  return pathname.startsWith(href)
}

export function AppNav() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav
      className="top-nav"
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

      {/* Desktop links */}
      <div className="top-nav-links">
        {NAV_LINKS.map(({ label, href }) => {
          const active = isNavActive(href, pathname)
          return (
            <Link
              key={href}
              href={href}
              className="top-nav-link"
              aria-current={active ? 'page' : undefined}
              data-active={active ? 'true' : undefined}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Right cluster: wallet + mobile burger */}
      <div className="top-nav-right">
        <ConnectButton
          accountStatus={{ smallScreen: 'avatar', largeScreen: 'full' }}
          showBalance={{ smallScreen: false, largeScreen: true }}
          chainStatus="icon"
        />
        <button
          type="button"
          className="top-nav-burger"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="top-nav-panel"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <CloseIcon /> : <BurgerIcon />}
        </button>
      </div>

      {/* Mobile panel */}
      {menuOpen && (
        <div id="top-nav-panel" className="top-nav-panel">
          {NAV_LINKS.map(({ label, href }) => {
            const active = isNavActive(href, pathname)
            return (
              <Link
                key={href}
                href={href}
                className="top-nav-panel-link"
                aria-current={active ? 'page' : undefined}
                data-active={active ? 'true' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {label}
              </Link>
            )
          })}
        </div>
      )}
    </nav>
  )
}

function BurgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M3 6h18M3 12h18M3 18h18" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
