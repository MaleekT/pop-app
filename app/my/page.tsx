'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { StatusBadge } from '@/components/StatusBadge'
import { UsdcAmount } from '@/components/UsdcAmount'
import { AddressLink } from '@/components/TxLink'
import type { BetRow, BetStatus } from '@/lib/db.types'
import { formatBetTitle } from '@/lib/display-name'
import { AppNav } from '@/components/AppNav'

type Tab = 'Active' | 'Resolved' | 'Disputed'

const ACTIVE_STATUSES: BetStatus[] = ['Pending', 'Locked', 'Proposed']
const TAB_STATUSES: Record<Tab, BetStatus[]> = {
  Active:   ACTIVE_STATUSES,
  Resolved: ['Resolved', 'Cancelled', 'Expired', 'Voided'],
  Disputed: ['Disputed'],
}


interface StatChipProps { label: string; value: number; variant?: 'accent' | 'danger' | 'muted' | 'default' }

function StatChip({ label, value, variant = 'default' }: StatChipProps) {
  const valueColor = variant === 'accent'
    ? 'var(--color-pop-accent)'
    : variant === 'danger'
      ? 'var(--color-pop-danger)'
      : variant === 'muted'
        ? 'var(--color-pop-muted)'
        : 'var(--color-pop-text)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: '1.25rem', fontWeight: 700, color: valueColor, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: '0.7rem', color: 'var(--color-pop-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
    </div>
  )
}

export default function MyBetsPage() {
  const { address, isConnected } = useAccount()
  const [bets, setBets] = useState<BetRow[]>([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('Active')

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetch(`/api/bets?address=${address}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setBets(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [address])

  const resolvedBets = bets.filter(b => b.status === 'Resolved')
  const wins = resolvedBets.filter(b => b.proposed_winner?.toLowerCase() === address?.toLowerCase())
  const losses = resolvedBets.filter(b => b.proposed_winner != null && b.proposed_winner.toLowerCase() !== address?.toLowerCase())
  const voidedCount = bets.filter(b => b.status === 'Voided').length

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

  const tabBets = bets.filter(b => TAB_STATUSES[activeTab].includes(b.status))

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

        {/* Summary stats — only shown once bets are loaded */}
        {!loading && bets.length > 0 && (
          <div style={{
            display: 'flex', gap: 32, marginBottom: 28,
            padding: '16px 20px',
            background: 'var(--color-pop-surface)',
            border: '1px solid var(--color-pop-surface-2)',
            borderRadius: 'var(--radius-card)',
          }}>
            <StatChip label="Total bets" value={bets.length} />
            <StatChip label="Won" value={wins.length} variant="accent" />
            <StatChip label="Lost" value={losses.length} variant="danger" />
            {voidedCount > 0 && <StatChip label="Voided" value={voidedCount} variant="muted" />}
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'var(--color-pop-surface)', borderRadius: 'var(--radius-pill)', padding: 4 }}>
          {(['Active', 'Resolved', 'Disputed'] as Tab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                flex: 1,
                padding: '8px 0',
                borderRadius: 'var(--radius-pill)',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '0.875rem',
                background: activeTab === tab ? 'var(--color-pop-surface-2)' : 'transparent',
                color: activeTab === tab ? 'var(--color-pop-text)' : 'var(--color-pop-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {tab}
              {tab === 'Disputed' && bets.filter(b => b.status === 'Disputed').length > 0 && (
                <span style={{ marginLeft: 6, background: 'var(--color-pop-danger)', color: '#fff', borderRadius: 'var(--radius-pill)', padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                  {bets.filter(b => b.status === 'Disputed').length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading && <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>}

        {!loading && tabBets.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--color-pop-muted)' }}>
            {activeTab === 'Active' ? (
              <>
                <p style={{ marginBottom: 16 }}>No active bets yet.</p>
                <Link href="/new" style={{ color: 'var(--color-pop-accent)', textDecoration: 'underline' }}>Create your first bet →</Link>
              </>
            ) : (
              <p>No {activeTab.toLowerCase()} bets.</p>
            )}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {tabBets.map(bet => {
            const isCreator = bet.creator.toLowerCase() === address?.toLowerCase()
            const other = isCreator ? bet.opponent : bet.creator
            const role = isCreator ? 'Creator' : 'Opponent'
            const isWon = bet.status === 'Resolved' && bet.proposed_winner?.toLowerCase() === address?.toLowerCase()
            const isLost = bet.status === 'Resolved' && bet.proposed_winner != null && bet.proposed_winner.toLowerCase() !== address?.toLowerCase()

            return (
              <Link
                key={bet.id}
                href={`/bet/${bet.on_chain_id}`}
                style={{ textDecoration: 'none' }}
              >
                <div
                  style={{
                    background: 'var(--color-pop-surface)',
                    border: '1px solid var(--color-pop-surface-2)',
                    borderRadius: 'var(--radius-card)',
                    padding: '18px 20px',
                    cursor: 'pointer',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-pop-accent)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-pop-surface-2)')}
                >
                  {/* Top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <p style={{ fontSize: '0.9375rem', lineHeight: 1.5, maxWidth: '75%', margin: 0 }}>
                      {(() => { const t = formatBetTitle(bet.definition_text); return t.length > 90 ? t.slice(0, 90) + '…' : t })()}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <StatusBadge status={bet.status} />
                      {(isWon || isLost) && (
                        <span style={{
                          fontSize: '0.65rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: isWon ? 'rgba(215,255,30,0.15)' : 'rgba(239,68,68,0.15)',
                          color: isWon ? 'var(--color-pop-accent)' : 'var(--color-pop-danger)',
                          letterSpacing: '0.05em',
                        }}>
                          {isWon ? 'WON' : 'LOST'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bottom row */}
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem' }}>{role}</span>
                    <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem' }}>vs <AddressLink address={other} /></span>
                    <span style={{ marginLeft: 'auto', fontWeight: 700, color: 'var(--color-pop-accent)' }}>
                      <UsdcAmount amount={bet.stake} />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </main>
    </>
  )
}
