'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Segmented sub-nav that makes Parlays read as living inside the Predict section.
// Markets = /predict (+ /predict/new, /predict/[id]); Parlays = /parlay (+ /parlay/[id]).

const SUB_LINKS = [
  { label: 'Markets', href: '/predict', match: '/predict' },
  { label: 'Parlays', href: '/parlay', match: '/parlay' },
] as const

export function PredictSubNav() {
  const pathname = usePathname()

  return (
    <div
      role="tablist"
      aria-label="Predict"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        marginBottom: 28,
        background: 'var(--color-pop-surface)',
        border: '1px solid var(--color-pop-surface-2)',
        borderRadius: 'var(--radius-pill)',
      }}
    >
      {SUB_LINKS.map(({ label, href, match }) => {
        const active = pathname.startsWith(match)
        return (
          <Link
            key={href}
            href={href}
            role="tab"
            aria-selected={active}
            style={{
              padding: '7px 20px',
              borderRadius: 'var(--radius-pill)',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '0.85rem',
              background: active ? 'var(--color-pop-accent)' : 'transparent',
              color: active ? '#0B0B0F' : 'var(--color-pop-muted)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {label}
          </Link>
        )
      })}
    </div>
  )
}
