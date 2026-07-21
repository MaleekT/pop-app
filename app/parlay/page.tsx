'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { parseUnits, parseEventLogs } from 'viem'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { ParlayTicketCard } from '@/components/predict/ParlayTicketCard'
import { PredictSubNav } from '@/components/predict/PredictSubNav'
import { cardStyle, ctaStyle, inputStyle, outcomeColor, formatMarketTitle, friendlyTxError } from '@/components/predict/ui'
import { PARLAY_CONTRACT, parlayAbi, USDC } from '@/lib/predict/contracts'
import { erc20Abi } from '@/lib/contracts'
import type { MarketRow, ParlayRow } from '@/lib/markets/db.types'

const ODDS_SCALE = 1_000_000n

export default function ParlayPage() {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const router = useRouter()

  const [markets, setMarkets] = useState<MarketRow[]>([])
  const [slip, setSlip] = useState<Record<string, number>>({}) // on_chain_id -> outcomeIndex
  const [stake, setStake] = useState('')
  const [tickets, setTickets] = useState<ParlayRow[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/markets?status=Pending')
      .then((r) => r.json())
      .then((d: MarketRow[]) => setMarkets(Array.isArray(d) ? d.filter((m) => new Date(m.resolve_at).getTime() > Date.now()).sort((a, b) => new Date(a.resolve_at).getTime() - new Date(b.resolve_at).getTime()) : []))
      .catch(() => {})
  }, [])

  const loadTickets = useCallback(() => {
    if (!address) { setTickets([]); return }
    fetch(`/api/parlays?bettor=${encodeURIComponent(address)}`)
      .then((r) => r.json())
      .then((d: ParlayRow[]) => setTickets(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [address])
  useEffect(() => { loadTickets() }, [loadTickets])

  const legIds = Object.keys(slip)
  const legs = legIds.map((id) => ({ marketId: BigInt(id), outcome: slip[id] }))
  const { data: quoteData, isError: quoteFailed } = useReadContract({
    address: PARLAY_CONTRACT,
    abi: parlayAbi,
    functionName: 'quote',
    args: [legs],
    query: { enabled: legIds.length >= 2 },
  })
  const multiplier = (quoteData as bigint | undefined) ?? 0n
  // quote() reverts with MarketNotPriced when a picked market's pool is empty: it has no odds to
  // fold in. That is deliberate — an empty pool used to be read as "maximum odds" and priced the
  // leg at the cap, which is how a 3-leg slip once quoted 15x on what was really a coin flip.
  const unpricedLeg = legIds.length >= 2 && quoteFailed
  const buyDisabled = busy || legIds.length < 2 || !stake || unpricedLeg

  function toggle(id: string, outcome: number) {
    setSlip((s) => {
      if (s[id] === outcome) { const n = { ...s }; delete n[id]; return n }
      return { ...s, [id]: outcome }
    })
  }

  async function handleBuy() {
    if (!address || !publicClient) return
    setError('')
    if (legIds.length < 2) { setError('Pick at least 2 legs, one per market.'); return }
    let stakeRaw: bigint
    try { stakeRaw = parseUnits(stake, 6); if (stakeRaw <= 0n) throw new Error() } catch { setError('Enter a valid stake.'); return }

    try {
      setBusy(true)
      const approveHash = await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [PARLAY_CONTRACT, stakeRaw] })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })
      const buyHash = await writeContractAsync({ address: PARLAY_CONTRACT, abi: parlayAbi, functionName: 'buyTicket', args: [legs, stakeRaw] })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: buyHash })
      const [log] = parseEventLogs({ abi: parlayAbi, eventName: 'TicketBought', logs: receipt.logs })
      if (!log) throw new Error('Ticket bought on-chain, but its confirmation could not be read from the receipt.')
      const ticketId = log.args.id.toString()

      try {
        const res = await fetch('/api/parlays', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            on_chain_id: ticketId,
            bettor: address,
            stake: stakeRaw.toString(),
            locked_multiplier: log.args.multiplier.toString(),
            legs: legIds.map((id) => ({ marketOnChainId: id, outcomeIndex: slip[id] })),
          }),
        })
        if (!res.ok) console.error('parlay mirror failed:', res.status)
      } catch (err) {
        console.error('parlay mirror failed (ticket is on-chain):', err)
      }

      router.push(`/parlay/${ticketId}`)
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  const payout = multiplier > 0n && stake ? (() => { try { return (parseUnits(stake, 6) * multiplier) / ODDS_SCALE } catch { return 0n } })() : 0n

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 96px' }}>
        <PredictSubNav />
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.25rem, 4.5vw, 3.25rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 10px' }}>
          PARLAY
        </h1>
        <div style={{ width: 48, height: 3, background: 'var(--color-pop-accent)', borderRadius: 99, marginBottom: 14 }} />
        <p style={{ color: 'var(--color-pop-muted)', margin: '0 0 28px', maxWidth: 560 }}>
          Combine 2 or more open markets into one ticket. Every leg must hit, the odds multiply. Odds lock in when you buy.
        </p>

        <div className="parlay-layout">
          {/* Market picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {markets.length === 0 ? (
              <div style={{ ...cardStyle, borderStyle: 'dashed' }}>
                <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>No open markets to build a parlay from yet.</p>
              </div>
            ) : (
              markets.map((m) => (
                <div key={m.on_chain_id} style={cardStyle}>
                  <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: '0.95rem', lineHeight: 1.4 }}>{formatMarketTitle(m.definition_text)}</p>
                  <div style={{ display: 'grid', gridTemplateColumns: `repeat(${m.outcomes.length}, 1fr)`, gap: 8 }}>
                    {m.outcomes.map((label, i) => {
                      const active = slip[m.on_chain_id] === i
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => toggle(m.on_chain_id, i)}
                          style={{
                            padding: '9px 8px',
                            borderRadius: 'var(--radius-input)',
                            border: '1px solid',
                            borderColor: active ? outcomeColor(i) : 'var(--color-pop-surface-2)',
                            background: active ? `${outcomeColor(i)}14` : 'var(--color-pop-surface-2)',
                            color: active ? outcomeColor(i) : 'var(--color-pop-text)',
                            fontWeight: 600,
                            fontSize: '0.82rem',
                            cursor: 'pointer',
                          }}
                        >
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Slip */}
          <div className="parlay-slip" style={cardStyle}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Your slip</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', margin: '14px 0 4px' }}>
              <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Legs</span>
              <span style={{ fontWeight: 600 }}>{legIds.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Multiplier</span>
              <span style={{ fontWeight: 700, color: 'var(--color-pop-accent)' }}>
                {legIds.length >= 2 && !unpricedLeg ? `${(Number(multiplier) / 1e6).toFixed(2)}x` : '—'}
              </span>
            </div>

            {unpricedLeg && (
              <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 12px' }}>
                One of your picks has no money in its pool yet, so it has no odds to price. Remove it to build the slip.
              </p>
            )}

            {!isConnected ? (
              <ConnectButton />
            ) : (
              <>
                <input
                  type="number"
                  placeholder="Stake (USDC)"
                  min="0"
                  step="0.01"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                />
                {payout > 0n && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Potential payout</span>
                    <span style={{ fontWeight: 700, color: 'var(--color-pop-win)' }}><UsdcAmount amount={payout} /></span>
                  </div>
                )}
                {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.82rem', margin: '0 0 10px' }}>{error}</p>}
                <button
                  onClick={handleBuy}
                  disabled={buyDisabled}
                  style={{ ...ctaStyle, opacity: buyDisabled ? 0.5 : 1, cursor: buyDisabled ? 'not-allowed' : 'pointer' }}
                >
                  {busy ? 'Buying…' : 'Approve & buy ticket'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Your tickets */}
        {tickets.length > 0 && (
          <div style={{ marginTop: 40 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 14px' }}>Your tickets</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {tickets.map((t) => (
                <ParlayTicketCard key={t.on_chain_id} ticket={t} href={`/parlay/${t.on_chain_id}`} />
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
