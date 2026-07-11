'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount, useReadContract } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { MarketCard } from '@/components/predict/MarketCard'
import { PredictSubNav } from '@/components/predict/PredictSubNav'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import type { MarketRow } from '@/lib/markets/db.types'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'resolved', label: 'Resolved' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

export default function PredictPage() {
  const { address } = useAccount()
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')

  const { data: owner } = useReadContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'owner',
  })
  const isOwner = Boolean(address && owner && address.toLowerCase() === (owner as string).toLowerCase())

  useEffect(() => {
    let active = true
    fetch('/api/markets')
      .then((r) => r.json())
      .then((data: MarketRow[]) => {
        if (active) {
          setMarkets(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = markets.filter((m) => {
    if (filter === 'open') return m.status === 'Pending'
    if (filter === 'resolved') return m.status === 'Resolved' || m.status === 'Voided'
    return true
  })

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

        <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                style={{
                  padding: '7px 16px',
                  borderRadius: 'var(--radius-pill)',
                  border: '1px solid',
                  borderColor: active ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                  background: active ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                  color: active ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                {f.label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading markets…</p>
        ) : filtered.length === 0 ? (
          <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>No markets here yet</p>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: 0 }}>
              {isOwner ? 'Create the first market to get things rolling.' : 'Check back soon, markets are on the way.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {filtered.map((m) => (
              <MarketCard key={`${m.contract_address}-${m.on_chain_id}`} market={m} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
