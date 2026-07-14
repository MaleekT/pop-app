'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { parseEventLogs } from 'viem'
import { usePublicClient, useWriteContract } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { backBtnStyle, cardStyle, ctaStyle, outcomeColor, formatMarketTitle, friendlyTxError } from '@/components/predict/ui'
import { PARLAY_CONTRACT, parlayAbi, PARLAY_STATUS } from '@/lib/predict/contracts'
import type { MarketRow, ParlayRow } from '@/lib/markets/db.types'

const ODDS_SCALE = 1_000_000n
const STATUS_COLOR: Record<string, string> = {
  Open: 'var(--color-pop-accent)',
  Won: 'var(--color-pop-win)',
  Lost: 'var(--color-pop-muted)',
  Refunded: '#60A5FA',
}

export default function ParlayTicketPage() {
  const { id } = useParams<{ id: string }>()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [parlay, setParlay] = useState<ParlayRow | null>(null)
  const [legMarkets, setLegMarkets] = useState<Record<string, MarketRow>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    fetch(`/api/parlays/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((p: ParlayRow | null) => {
        setParlay(p)
        setLoading(false)
        p?.legs.forEach((leg) => {
          fetch(`/api/markets/${leg.marketOnChainId}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((m: MarketRow | null) => { if (m) setLegMarkets((prev) => ({ ...prev, [leg.marketOnChainId]: m })) })
            .catch(() => {})
        })
      })
      .catch(() => setLoading(false))
  }, [id])
  useEffect(() => { load() }, [load])

  async function handleSettle() {
    if (!publicClient || !parlay) return
    setError('')
    try {
      setBusy(true)
      const hash = await writeContractAsync({ address: PARLAY_CONTRACT, abi: parlayAbi, functionName: 'settle', args: [BigInt(parlay.on_chain_id)] })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const [log] = parseEventLogs({ abi: parlayAbi, eventName: 'TicketSettled', logs: receipt.logs })
      if (!log) throw new Error('Ticket settled on-chain, but its result could not be read from the receipt.')
      const finalStatus = PARLAY_STATUS[Number(log.args.status)] ?? 'Open'
      try {
        await fetch(`/api/parlays/${parlay.on_chain_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: finalStatus }),
        })
      } catch (err) {
        console.error('parlay status mirror failed (ticket is settled on-chain):', err)
      }
      setBusy(false)
      load()
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  if (loading) {
    return (<><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}><p style={{ color: 'var(--color-pop-muted)' }}>Loading ticket…</p></main></>)
  }
  if (!parlay) {
    return (
      <><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <Link href="/parlay" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Parlay</Link>
        <p style={{ color: 'var(--color-pop-muted)' }}>Ticket not found.</p>
      </main></>
    )
  }

  const stake = BigInt(parlay.stake)
  const mult = BigInt(parlay.locked_multiplier)
  const payout = (stake * mult) / ODDS_SCALE
  const payoutLabel = parlay.status === 'Open' ? 'Potential payout' : 'Payout'
  const shownPayout = parlay.status === 'Lost' ? 0n : parlay.status === 'Refunded' ? stake : payout

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 96px' }}>
        <Link href="/parlay" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Parlay</Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Parlay ticket</h1>
          <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.85rem', textTransform: 'uppercase', color: STATUS_COLOR[parlay.status] ?? 'var(--color-pop-muted)' }}>{parlay.status}</span>
        </div>

        <div style={{ ...cardStyle, marginBottom: 20, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div><span style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem', display: 'block' }}>Stake</span><span style={{ fontWeight: 600 }}><UsdcAmount amount={stake} /></span></div>
          <div><span style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem', display: 'block' }}>Multiplier</span><span style={{ fontWeight: 700, color: 'var(--color-pop-accent)' }}>{(Number(mult) / 1e6).toFixed(2)}x</span></div>
          <div><span style={{ color: 'var(--color-pop-muted)', fontSize: '0.8rem', display: 'block' }}>{payoutLabel}</span><span style={{ fontWeight: 700, color: 'var(--color-pop-win)' }}><UsdcAmount amount={shownPayout} /></span></div>
        </div>

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Legs, all must hit</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
            {parlay.legs.map((leg, i) => {
              const m = legMarkets[leg.marketOnChainId]
              const label = m?.outcomes[leg.outcomeIndex] ?? `Outcome ${leg.outcomeIndex}`
              const legStatus = m?.status ?? 'Pending'
              const won = m?.status === 'Resolved' && m?.resolved_outcome === leg.outcomeIndex
              const lost = m?.status === 'Resolved' && m?.resolved_outcome !== leg.outcomeIndex
              return (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: i > 0 ? '1px solid var(--color-pop-surface-2)' : 'none', paddingTop: i > 0 ? 12 : 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: '0 0 4px', fontSize: '0.9rem', color: 'var(--color-pop-text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m ? formatMarketTitle(m.definition_text) : `Market #${leg.marketOnChainId}`}</p>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: outcomeColor(leg.outcomeIndex) }} />
                      <span style={{ color: 'var(--color-pop-muted)' }}>Your pick: <span style={{ color: 'var(--color-pop-text)', fontWeight: 600 }}>{label}</span></span>
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', flexShrink: 0, color: won ? 'var(--color-pop-win)' : lost ? 'var(--color-pop-danger)' : legStatus === 'Voided' ? '#60A5FA' : 'var(--color-pop-muted)' }}>
                    {won ? 'HIT' : lost ? 'MISS' : legStatus === 'Voided' ? 'VOID' : legStatus === 'Pending' ? 'OPEN' : legStatus}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</p>}

        {parlay.status === 'Open' ? (
          <>
            <button onClick={handleSettle} disabled={busy} style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Settling…' : 'Settle ticket'}
            </button>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.78rem', marginTop: 10, textAlign: 'center' }}>Settles once every leg has resolved. If it is too early, it will just tell you to wait.</p>
          </>
        ) : parlay.status === 'Won' ? (
          <p style={{ color: 'var(--color-pop-win)', textAlign: 'center', fontWeight: 600 }}>Won. Payout was sent to the bettor.</p>
        ) : parlay.status === 'Refunded' ? (
          <p style={{ color: '#60A5FA', textAlign: 'center', fontWeight: 600 }}>A leg voided, stake refunded.</p>
        ) : (
          <p style={{ color: 'var(--color-pop-muted)', textAlign: 'center', fontWeight: 600 }}>Lost. One or more legs missed.</p>
        )}
      </main>
    </>
  )
}
