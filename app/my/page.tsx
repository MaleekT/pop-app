'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import type { BetRow } from '@/lib/db.types'
import { AppNav } from '@/components/AppNav'
import { BetsList } from '@/components/BetsList'

export default function MyBetsPage() {
  const { address, isConnected } = useAccount()
  const [bets, setBets] = useState<BetRow[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetch(`/api/bets?address=${address}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setBets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [address])

  if (!isConnected) {
    return (
      <>
        <AppNav />
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 24 }}>
          <p style={{ color: 'var(--color-pop-muted)' }}>Connect your wallet to see your bets.</p>
          <ConnectButton />
        </main>
      </>
    )
  }

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, margin: 0 }}>My bets</h1>
            <Link
              href="/settings"
              title="Settings"
              className="nav-link"
              style={{ fontSize: '1.1rem', lineHeight: 1, paddingTop: 2 }}
            >
              ⚙
            </Link>
          </div>
          <Link
            href="/new"
            style={{
              background: 'var(--color-pop-accent)',
              color: '#0B0B0F',
              fontWeight: 700,
              fontSize: '0.875rem',
              padding: '9px 18px',
              borderRadius: 'var(--radius-cta)',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            + New Bet
          </Link>
        </div>

        <BetsList bets={bets} address={address} loading={loading} />
      </main>
    </>
  )
}
