'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { UsdcAmount } from '@/components/UsdcAmount'
import { StatusBadge } from '@/components/StatusBadge'
import type { BetRow } from '@/lib/db.types'
import { AppNav } from '@/components/AppNav'

const REFRESH_INTERVAL = 30_000

function useCountdown(target: string | null) {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    if (!target) return
    const ts = new Date(target).getTime()
    let active = true

    function tick() {
      if (!active) return
      const rem = ts - Date.now()
      if (rem <= 0) { setDisplay('Expired'); return }
      const h = Math.floor(rem / 3_600_000)
      const m = Math.floor((rem % 3_600_000) / 60_000)
      const s = Math.floor((rem % 60_000) / 1_000)
      setDisplay(h > 0 ? `${h}h ${m}m` : `${m}m ${s}s`)
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => { active = false; clearInterval(id) }
  }, [target])

  return display
}

function LobbyRow({ bet, profile }: { bet: BetRow; profile?: { handle?: string | null } }) {
  const countdown = useCountdown(bet.claim_deadline)
  const creatorLabel = profile?.handle ? `@${profile.handle}` : `${bet.creator.slice(0, 6)}…${bet.creator.slice(-4)}`

  return (
    <Link
      href={`/bet/${bet.on_chain_id}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto',
        gap: 16,
        alignItems: 'center',
        background: 'var(--color-pop-surface)',
        border: '1px solid var(--color-pop-surface-2)',
        borderRadius: 'var(--radius-card)',
        padding: '18px 20px',
        textDecoration: 'none',
        transition: 'border-color 0.15s',
        outline: 'none',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-pop-accent)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-pop-surface-2)')}
      onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-pop-accent)')}
      onBlur={e => (e.currentTarget.style.borderColor = 'var(--color-pop-surface-2)')}
    >
      <div>
        <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, marginBottom: 4, fontSize: '0.9375rem', lineHeight: 1.4 }}>
          {bet.definition_text}
        </p>
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem', margin: 0, fontFamily: profile?.handle ? undefined : 'var(--font-mono)' }}>
          by {creatorLabel}
        </p>
      </div>

      <div style={{ textAlign: 'right' }}>
        <UsdcAmount amount={BigInt(bet.stake)} className="lobby-stake" />
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem', margin: '2px 0 0' }}>each</p>
      </div>

      <div style={{ textAlign: 'right' }}>
        <p style={{ color: 'var(--color-pop-text)', fontWeight: 600, fontSize: '0.875rem', margin: 0 }}>{countdown}</p>
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem', margin: '2px 0 0' }}>to claim</p>
      </div>

      <div>
        <StatusBadge status="Open" />
      </div>
    </Link>
  )
}

export default function LobbyPage() {
  const [bets, setBets] = useState<BetRow[]>([])
  const [profiles, setProfiles] = useState<Record<string, { handle?: string | null }>>({})
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchBets = useCallback(async () => {
    try {
      const res = await fetch('/api/lobby')
      if (!mountedRef.current) return
      if (!res.ok) { setFetchError(true); return }
      const data: BetRow[] = await res.json()
      if (!mountedRef.current) return
      setBets(data)
      setFetchError(false)

      const addresses = [...new Set(data.map(b => b.creator))].filter(Boolean)
      if (addresses.length > 0) {
        try {
          const pRes = await fetch(`/api/profile?addresses=${addresses.map(encodeURIComponent).join(',')}`)
          if (pRes.ok && mountedRef.current) setProfiles(await pRes.json())
        } catch { /* retain stale profiles */ }
      }
    } catch {
      if (mountedRef.current) setFetchError(true)
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchBets()
    const id = setInterval(() => { void fetchBets() }, REFRESH_INTERVAL)
    return () => clearInterval(id)
  }, [fetchBets])

  return (
    <>
      <AppNav />

      <main style={{ maxWidth: 800, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, marginBottom: 6 }}>Lobby</h1>
            <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Open bets waiting for an opponent.</p>
          </div>
          <Link
            href="/new"
            style={{
              background: 'var(--color-pop-accent)', color: '#0B0B0F', fontWeight: 700,
              fontSize: '0.9375rem', padding: '10px 20px', borderRadius: 'var(--radius-cta)',
              textDecoration: 'none',
            }}
          >
            + Post a bet
          </Link>
        </div>

        {loading && (
          <p style={{ color: 'var(--color-pop-muted)', textAlign: 'center', padding: '48px 0' }}>Loading…</p>
        )}

        {!loading && fetchError && (
          <p style={{ color: 'var(--color-pop-danger)', textAlign: 'center', padding: '48px 0' }}>
            Could not load open bets. Check your connection and try again.
          </p>
        )}

        {!loading && !fetchError && bets.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '64px 24px',
            border: '1px dashed var(--color-pop-surface-2)',
            borderRadius: 'var(--radius-card)',
          }}>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '1rem', marginBottom: 16 }}>
              No open bets right now. Be the first to post one.
            </p>
            <Link href="/new" style={{ color: 'var(--color-pop-accent)', fontWeight: 600, textDecoration: 'none', fontSize: '0.9375rem' }}>
              Create a bet →
            </Link>
          </div>
        )}

        {!loading && !fetchError && bets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {bets.map(bet => <LobbyRow key={bet.on_chain_id} bet={bet} profile={profiles[bet.creator]} />)}
          </div>
        )}
      </main>
    </>
  )
}


