'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { formatUnits } from 'viem'
import type { InviteRow } from '@/lib/db.types'
import { formatBetTitle } from '@/lib/display-name'

export default function InvitePage() {
  const { code } = useParams<{ code: string }>()
  const router = useRouter()
  const { address, isConnected } = useAccount()

  const [invite, setInvite] = useState<InviteRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/invites/${code}`)
      .then(r => r.json())
      .then((d: InviteRow) => { setInvite(d); setLoading(false) })
      .catch(() => { setError('Invite not found.'); setLoading(false) })
  }, [code])

  async function handleClaim() {
    if (!address || !invite) return
    setClaiming(true)
    setError('')
    const res = await fetch(`/api/invites/${code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opponent: address }),
    })
    const body = await res.json() as { ok?: boolean; error?: string }
    if (!res.ok) {
      setError(body.error ?? 'Failed to claim invite.')
      setClaiming(false)
      return
    }
    setInvite(prev => prev ? { ...prev, pending_opponent: address } : prev)
    setClaiming(false)
  }

  const stakeUsdc = invite ? parseFloat(formatUnits(BigInt(invite.stake), 6)).toFixed(2) : '0'
  const isCreator = address && invite && address.toLowerCase() === invite.creator.toLowerCase()
  const isOpponent = address && invite && invite.pending_opponent && address.toLowerCase() === invite.pending_opponent.toLowerCase()
  const hasOpponent = Boolean(invite?.pending_opponent)

  return (
    <>
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'rgba(10,10,10,0.85)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-pop-surface-2)',
      }}>
        <Link href="/" style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--color-pop-accent)', letterSpacing: '0.05em', textDecoration: 'none' }}>
          POP
        </Link>
        <ConnectButton />
      </nav>

      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        {loading && <p style={{ color: 'var(--color-pop-muted)' }}>Loading invite…</p>}

        {!loading && error && (
          <p style={{ color: 'var(--color-pop-danger)' }}>{error}</p>
        )}

        {!loading && invite && (
          <>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              Bet Invite
            </p>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 32 }}>
              You've been challenged
            </h1>

            {/* Bet terms */}
            <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 24 }}>
              <p style={{ color: 'var(--color-pop-text)', lineHeight: 1.7, fontSize: '1.05rem', marginBottom: 16 }}>
                {formatBetTitle(invite.definition_text)}
              </p>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-pop-muted)', wordBreak: 'break-all' }}>
                keccak256: {invite.definition_hash}
              </div>
            </div>

            {/* Details */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 }}>
              <Row label="Stake each" value={`${stakeUsdc} USDC`} />
              <Row label="Pot if you win" value={`${(parseFloat(stakeUsdc) * 2).toFixed(2)} USDC`} accent />
              <Row label="Resolves" value={new Date(invite.resolve_at).toLocaleString()} />
              <Row label="Join by" value={new Date(invite.join_deadline).toLocaleString()} />
              <Row label="Creator" value={`${invite.creator.slice(0, 6)}…${invite.creator.slice(-4)}`} mono />
            </div>

            {/* Already claimed */}
            {invite.status === 'claimed' && (
              <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, textAlign: 'center', color: 'var(--color-pop-muted)' }}>
                This bet has already been created on-chain.
              </div>
            )}

            {/* Creator view — opponent ready */}
            {invite.status === 'open' && isCreator && hasOpponent && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ background: 'rgba(215,255,30,0.08)', border: '1px solid var(--color-pop-accent)', borderRadius: 'var(--radius-card)', padding: '16px 20px' }}>
                  <p style={{ color: 'var(--color-pop-accent)', fontWeight: 700, marginBottom: 4 }}>Opponent is ready!</p>
                  <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                    {invite.pending_opponent}
                  </p>
                </div>
                <button
                  onClick={() => router.push(`/new?invite=${code}`)}
                  style={ctaStyle}
                >
                  Create Bet Now →
                </button>
              </div>
            )}

            {/* Creator view — waiting for opponent */}
            {invite.status === 'open' && isCreator && !hasOpponent && (
              <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, textAlign: 'center', color: 'var(--color-pop-muted)' }}>
                Waiting for your opponent to accept…
              </div>
            )}

            {/* Opponent view — already claimed by them */}
            {invite.status === 'open' && isOpponent && (
              <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, textAlign: 'center', color: 'var(--color-pop-muted)' }}>
                You've accepted. Waiting for the creator to create the bet on-chain.
              </div>
            )}

            {/* Opponent view — can claim */}
            {invite.status === 'open' && !isCreator && !isOpponent && !hasOpponent && (
              <>
                {!isConnected && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                    <p style={{ color: 'var(--color-pop-muted)' }}>Connect your wallet to accept this bet.</p>
                    <ConnectButton />
                  </div>
                )}
                {isConnected && (
                  <>
                    {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', marginBottom: 12 }}>{error}</p>}
                    <button onClick={handleClaim} disabled={claiming} style={{ ...ctaStyle, opacity: claiming ? 0.5 : 1 }}>
                      {claiming ? 'Accepting…' : `I'll take this bet — stake ${stakeUsdc} USDC`}
                    </button>
                  </>
                )}
              </>
            )}

            {/* Someone else already claimed */}
            {invite.status === 'open' && hasOpponent && !isCreator && !isOpponent && (
              <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, textAlign: 'center', color: 'var(--color-pop-muted)' }}>
                Another opponent has already claimed this invite.
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}

function Row({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>{label}</span>
      <span style={{
        fontWeight: 600,
        color: accent ? 'var(--color-pop-accent)' : 'var(--color-pop-text)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontSize: mono ? '0.85rem' : undefined,
      }}>{value}</span>
    </div>
  )
}

const ctaStyle: React.CSSProperties = {
  background: 'var(--color-pop-accent)',
  color: '#0B0B0F',
  fontWeight: 700,
  fontSize: '1rem',
  padding: '14px 0',
  borderRadius: 'var(--radius-cta)',
  border: 'none',
  cursor: 'pointer',
  width: '100%',
}
