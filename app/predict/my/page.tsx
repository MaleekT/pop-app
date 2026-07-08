'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'
import { MarketCard } from '@/components/predict/MarketCard'
import { backBtnStyle } from '@/components/predict/ui'
import type { MarketRow } from '@/lib/markets/db.types'

export default function MyPredictPage() {
  const { address, isConnected } = useAccount()
  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!address) {
      setMarkets([])
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    fetch(`/api/positions?bettor=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((d: MarketRow[]) => {
        if (active) {
          setMarkets(Array.isArray(d) ? d : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [address])

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px 96px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← All markets</Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 2.75rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 24px' }}>
          MY POSITIONS
        </h1>

        {!isConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
            <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to see your market positions.</p>
            <ConnectButton />
          </div>
        ) : loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
        ) : markets.length === 0 ? (
          <div style={{ background: 'var(--color-pop-surface)', border: '1px dashed var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: '56px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, margin: '0 0 6px' }}>No positions yet</p>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', margin: 0 }}>
              Back an outcome on a market and it will show up here.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {markets.map((m) => (
              <MarketCard key={`${m.contract_address}-${m.on_chain_id}`} market={m} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
