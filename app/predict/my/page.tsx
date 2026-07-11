'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { MarketCard } from '@/components/predict/MarketCard'
import { backBtnStyle, cardStyle } from '@/components/predict/ui'
import type { MarketRow, ParlayRow } from '@/lib/markets/db.types'

type Tab = 'markets' | 'parlays'

// Parlay status colours, matching the parlay pages.
const TICKET_STATUS_COLOR: Record<string, string> = {
  Open: 'var(--color-pop-accent)',
  Won: 'var(--color-pop-win)',
  Lost: 'var(--color-pop-muted)',
  Refunded: '#60A5FA',
}

export default function MyPredictPage() {
  const { address, isConnected } = useAccount()
  const [tab, setTab] = useState<Tab>('markets')
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [tickets, setTickets] = useState<ParlayRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) {
      setMarkets([])
      setTickets([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    Promise.all([
      fetch(`/api/positions?bettor=${encodeURIComponent(address)}`).then((r) => r.json()).catch(() => []),
      fetch(`/api/parlays?bettor=${encodeURIComponent(address)}`).then((r) => r.json()).catch(() => []),
    ]).then(([m, t]) => {
      if (!active) return
      setMarkets(Array.isArray(m) ? m : [])
      setTickets(Array.isArray(t) ? t : [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [address])

  const tabs: [Tab, string][] = [
    ['markets', `Markets${markets.length ? ` (${markets.length})` : ''}`],
    ['parlays', `Parlays${tickets.length ? ` (${tickets.length})` : ''}`],
  ]

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 96px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← All markets</Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
          MY PREDICT
        </h1>

        {!isConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
            <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to see your positions and tickets.</p>
            <ConnectButton />
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
              {tabs.map(([key, label]) => {
                const active = tab === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTab(key)}
                    style={{
                      padding: '7px 16px', borderRadius: 'var(--radius-pill)', border: '1px solid',
                      borderColor: active ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                      background: active ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                      color: active ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                      fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>

            {loading ? (
              <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
            ) : tab === 'markets' ? (
              markets.length === 0 ? (
                <EmptyState text="No market positions yet" sub="Back an outcome on a market and it will show up here." />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
                  {markets.map((m) => <MarketCard key={`${m.contract_address}-${m.on_chain_id}`} market={m} />)}
                </div>
              )
            ) : tickets.length === 0 ? (
              <EmptyState text="No parlay tickets yet" sub="Build a slip on the Parlay page and your tickets will show up here." />
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
                {tickets.map((t) => (
                  <Link key={t.on_chain_id} href={`/parlay/${t.on_chain_id}`} style={{ textDecoration: 'none' }}>
                    <div style={{ ...cardStyle, padding: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem' }}>{t.legs.length} legs</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: TICKET_STATUS_COLOR[t.status] ?? 'var(--color-pop-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                          {t.status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <span style={{ color: 'var(--color-pop-text)' }}><UsdcAmount amount={t.stake} /></span>
                        <span style={{ color: 'var(--color-pop-accent)', fontWeight: 700, fontSize: '0.85rem' }}>{(Number(t.locked_multiplier) / 1e6).toFixed(2)}x</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}

function EmptyState({ text, sub }: { text: string; sub: string }) {
  return (
    <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: '56px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>{text}</p>
      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: 0 }}>{sub}</p>
    </div>
  )
}
