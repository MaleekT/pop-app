'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { MarketCard } from '@/components/predict/MarketCard'
import { PredictSubNav } from '@/components/predict/PredictSubNav'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import type { MarketRow } from '@/lib/markets/db.types'

const CATEGORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'sports', label: 'Sports' },
  { key: 'youtube', label: 'Social' },
] as const
type CategoryKey = (typeof CATEGORY_FILTERS)[number]['key']

// The board is a shop window: only markets you can still bet on. Re-polling stops a card lingering
// here after it closes — a stale board is what made a market read "RESOLVING" until you clicked it.
const REFRESH_MS = 30_000

function FilterRow({ label, options, active, onSelect }: {
  label: string
  options: readonly { key: string; label: string }[]
  active: string
  onSelect: (key: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ width: 52, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-pop-muted)', opacity: 0.7 }}>
        {label}
      </span>
      {options.map((o) => {
        const isActive = active === o.key
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onSelect(o.key)}
            style={{
              padding: '7px 16px',
              borderRadius: 'var(--radius-pill)',
              border: '1px solid',
              borderColor: isActive ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
              background: isActive ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
              color: isActive ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export default function PredictPage() {
  const { address } = useAccount()
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState<CategoryKey>('all')

  const { data: owner } = useReadContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'owner',
  })
  const isOwner = Boolean(address && owner && address.toLowerCase() === (owner as string).toLowerCase())

  useEffect(() => {
    let cancelled = false

    const load = () => {
      fetch('/api/markets')
        .then((r) => r.json())
        .then((data: MarketRow[]) => {
          if (cancelled) return
          setMarkets(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        // Leave what is already on screen alone; the next poll retries.
        .catch(() => { if (!cancelled) setLoading(false) })
    }

    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  // Open only: every card here is one you can still bet on. Settled, settling and cancelled markets
  // drop off the board — a user tracks those in Activity.
  const now = Date.now()
  const filtered = markets
    .filter((m) => m.status === 'Pending' && new Date(m.resolve_at).getTime() > now)
    .filter((m) => category === 'all' || m.category === category)
    .sort((a, b) => new Date(a.resolve_at).getTime() - new Date(b.resolve_at).getTime())

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 96px' }}>
        <PredictSubNav />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.5rem, 5vw, 3.75rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 12px', lineHeight: 1 }}>
              PREDICT
            </h1>
            <div style={{ width: 48, height: 3, background: 'var(--color-pop-accent)', borderRadius: 99, marginBottom: 16 }} />
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '1.05rem', margin: 0, maxWidth: 520 }}>
              Pooled prediction markets. Back an outcome, and the winning side splits the whole pot.
            </p>
          </div>
          {isOwner && (
            <Link
              href="/predict/new"
              style={{
                background: 'var(--color-pop-accent)',
                color: '#0B0B0F',
                fontWeight: 700,
                fontSize: '0.9rem',
                padding: '11px 20px',
                borderRadius: 'var(--radius-cta)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              + Create market
            </Link>
          )}
        </div>

        <div style={{ marginBottom: 28 }}>
          <FilterRow label="Type" options={CATEGORY_FILTERS} active={category} onSelect={(k) => setCategory(k as CategoryKey)} />
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading markets…</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>No open markets right now</p>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: 0 }}>
              {isOwner ? 'Create the first market to get things rolling.' : 'Fresh markets land regularly. Check back soon.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map((m) => (
              <MarketCard key={`${m.contract_address}-${m.on_chain_id}`} market={m} href={`/predict/${m.on_chain_id}`} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
