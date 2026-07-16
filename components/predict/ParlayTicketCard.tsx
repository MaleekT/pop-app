'use client'

import Link from 'next/link'
import { UsdcAmount } from '@/components/UsdcAmount'
import { cardStyle } from '@/components/predict/ui'
import type { ParlayRow } from '@/lib/markets/db.types'

const STATUS_COLOR: Record<string, string> = {
  Open: 'var(--color-pop-accent)',
  Won: 'var(--color-pop-win)',
  Lost: 'var(--color-pop-muted)',
  Refunded: '#60A5FA',
}

interface ParlayTicketCardProps {
  ticket: ParlayRow
  // Where this card leads. REQUIRED, for the same reason MarketCard's is. This markup was previously
  // copy-pasted into both the Parlay page and Activity with `/parlay/${id}` hardcoded into each, so
  // Activity had no way to keep its own users inside Activity, and the duplication had already
  // drifted (one copy used this lookup, the other an inline ternary chain). One component with a
  // required destination means a new call site must decide where its tickets go, and the compiler
  // asks rather than a reviewer noticing.
  href: string
}

export function ParlayTicketCard({ ticket, href }: ParlayTicketCardProps) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{ ...cardStyle, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem' }}>{ticket.legs.length} legs</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: STATUS_COLOR[ticket.status] ?? 'var(--color-pop-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            {ticket.status}
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ color: 'var(--color-pop-text)' }}><UsdcAmount amount={ticket.stake} /></span>
          <span style={{ color: 'var(--color-pop-accent)', fontWeight: 700, fontSize: '0.85rem' }}>{(Number(ticket.locked_multiplier) / 1e6).toFixed(2)}x</span>
        </div>
      </div>
    </Link>
  )
}
