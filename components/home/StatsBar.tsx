'use client'

import { useEffect, useState } from 'react'
import { useMarkets, openSorted } from '@/components/home/useMarkets'

// Three counts that are actually true, replacing the old bar that only ever moved if a PvP settlement
// event happened to fire while you sat on the page (so every first-time visitor saw three dashes).
//
// A count that could not be read renders as a dash, never as 0. "0 open markets" and "unknown" look
// identical to a reader but mean completely different things, and only one of them is a fact.

function display(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('en-US')
}

export function StatsBar() {
  const { markets } = useMarkets()
  const [openDuels, setOpenDuels] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/lobby')
      .then((r) => {
        if (!r.ok) throw new Error(`/api/lobby responded ${r.status}`)
        return r.json()
      })
      .then((data: unknown) => {
        if (!cancelled) setOpenDuels(Array.isArray(data) ? data.length : null)
      })
      .catch(() => { if (!cancelled) setOpenDuels(null) })
    return () => { cancelled = true }
  }, [])

  // markets stays null until a fetch succeeds, so a failure leaves these unknown rather than zero.
  const known = markets !== null
  const stats = [
    { label: 'Open markets', value: display(known ? openSorted(markets).length : null) },
    { label: 'Open 1v1 bets', value: display(openDuels) },
    { label: 'Markets settled', value: display(known ? markets.filter((m) => m.status === 'Resolved').length : null) },
  ]

  return (
    <div className="stats-bar" style={{ paddingTop: 8 }}>
      {stats.map(({ label, value }) => (
        <div key={label}>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.625rem', color: 'var(--color-pop-accent)', lineHeight: 1 }}>
            {value}
          </div>
          <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem', marginTop: 5 }}>{label}</div>
        </div>
      ))}
    </div>
  )
}
