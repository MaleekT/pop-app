'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { parseUnits, zeroAddress } from 'viem'
import { useAccount, useReadContract, useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { OddsBar } from '@/components/predict/OddsBar'
import { MarketStatusBadge } from '@/components/predict/MarketStatusBadge'
import {
  backBtnStyle, cardStyle, ctaStyle, inputStyle, chipStyle,
  categoryLabel, outcomeColor, friendlyTxError,
} from '@/components/predict/ui'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, MARKET_STATUS } from '@/lib/predict/contracts'
import { USDC, erc20Abi } from '@/lib/contracts'
import { formatBetTitle } from '@/lib/display-name'
import type { MarketRow, MarketStatus } from '@/lib/markets/db.types'

const BASE = { address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi } as const

export default function MarketDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { address } = useAccount()

  const [market, setMarket] = useState<MarketRow | null>(null)
  const [loading, setLoading] = useState(true)

  const loadMarket = useCallback(() => {
    fetch(`/api/markets/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MarketRow | null) => { setMarket(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => { loadMarket() }, [loadMarket])

  const outcomes = market?.outcomes ?? []
  const onChainId = market ? BigInt(market.on_chain_id) : 0n
  const user = address ?? zeroAddress
  const enabled = Boolean(market)

  const { data: potData, refetch: refetchPot } = useReadContract({ ...BASE, functionName: 'totalPot', args: [onChainId], query: { enabled, refetchInterval: 20_000 } })
  const { data: chainData, refetch: refetchChain } = useReadContract({ ...BASE, functionName: 'getMarket', args: [onChainId], query: { enabled } })
  const { data: claimedData, refetch: refetchClaimed } = useReadContract({ ...BASE, functionName: 'claimed', args: [onChainId, user], query: { enabled } })
  const { data: poolsData, refetch: refetchPools } = useReadContracts({
    contracts: outcomes.map((_, i) => ({ ...BASE, functionName: 'pool' as const, args: [onChainId, i] })),
    query: { enabled, refetchInterval: 20_000 },
  })
  const { data: stakesData, refetch: refetchStakes } = useReadContracts({
    contracts: outcomes.map((_, i) => ({ ...BASE, functionName: 'staked' as const, args: [onChainId, i, user] })),
    query: { enabled },
  })

  const refetchAll = useCallback(() => {
    refetchPot(); refetchChain(); refetchClaimed(); refetchPools(); refetchStakes(); loadMarket()
  }, [refetchPot, refetchChain, refetchClaimed, refetchPools, refetchStakes, loadMarket])

  if (loading) {
    return (<><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}><p style={{ color: 'var(--color-pop-muted)' }}>Loading market…</p></main></>)
  }
  if (!market) {
    return (
      <><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Back to markets</Link>
        <p style={{ color: 'var(--color-pop-muted)' }}>Market not found.</p>
      </main></>
    )
  }

  const chainMarket = chainData as unknown as { status: number; resolvedOutcome: number } | undefined
  const status: MarketStatus = chainMarket ? MARKET_STATUS[chainMarket.status] ?? market.status : market.status
  const resolvedOutcome = chainMarket ? chainMarket.resolvedOutcome : market.resolved_outcome
  const totalPot = (potData as bigint | undefined) ?? 0n
  const pools = outcomes.map((_, i) => (poolsData?.[i]?.result as bigint | undefined) ?? 0n)
  const userStakes = outcomes.map((_, i) => (stakesData?.[i]?.result as bigint | undefined) ?? 0n)
  const totalUserStake = userStakes.reduce((a, b) => a + b, 0n)
  const hasClaimed = Boolean(claimedData)

  const resolveMs = new Date(market.resolve_at).getTime()
  const bettingOpen = status === 'Pending' && resolveMs > Date.now()
  const evidence = market.evidence as { sourceUrl?: string; rawValue?: string; rawStatus?: string } | null

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 96px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Back to markets</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={chipStyle}>{categoryLabel(market.category)}</span>
          <MarketStatusBadge status={status} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.35, margin: '0 0 24px' }}>
          {formatBetTitle(market.definition_text)}
        </h1>

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Total pool</span>
            <span style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-pop-accent)' }}><UsdcAmount amount={totalPot} /></span>
          </div>
          <OddsBar outcomes={outcomes} pools={pools} total={totalPot} resolvedOutcome={status === 'Resolved' ? resolvedOutcome : null} />
        </div>

        {totalUserStake > 0n && (
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Your position</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
              {outcomes.map((label, i) => userStakes[i] > 0n && (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: outcomeColor(i) }} />
                    <span style={{ color: 'var(--color-pop-text)', fontWeight: 600 }}>{label}</span>
                  </span>
                  <span style={{ color: 'var(--color-pop-text)' }}><UsdcAmount amount={userStakes[i]} /></span>
                </div>
              ))}
            </div>
          </div>
        )}

        {bettingOpen && <DepositPanel marketId={onChainId} onChainIdStr={market.on_chain_id} outcomes={outcomes} onDone={refetchAll} />}

        <ClaimActions
          status={status}
          resolvedOutcome={resolvedOutcome}
          userStakes={userStakes}
          totalUserStake={totalUserStake}
          hasClaimed={hasClaimed}
          marketId={onChainId}
          onDone={refetchAll}
        />

        {evidence?.sourceUrl && (
          <div style={{ ...cardStyle, marginTop: 20 }}>
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Resolution evidence</span>
            <div style={{ marginTop: 10, fontSize: '0.85rem', lineHeight: 1.6 }}>
              {evidence.rawValue && <div style={{ color: 'var(--color-pop-text)' }}>Value: {evidence.rawValue}</div>}
              {evidence.rawStatus && <div style={{ color: 'var(--color-pop-text)' }}>Status: {evidence.rawStatus}</div>}
              <a href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-pop-accent)', wordBreak: 'break-all' }}>
                {evidence.sourceUrl}
              </a>
            </div>
          </div>
        )}

        {!bettingOpen && status === 'Pending' && (
          <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem', marginTop: 20, textAlign: 'center' }}>
            Betting is closed. Waiting for the resolver to settle this market.
          </p>
        )}
      </main>
    </>
  )
}

// ─── Deposit panel ────────────────────────────────────────────────────────────

function DepositPanel({ marketId, onChainIdStr, outcomes, onDone }: { marketId: bigint; onChainIdStr: string; outcomes: string[]; onDone: () => void }) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [outcome, setOutcome] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleDeposit() {
    if (outcome === null || !address || !publicClient) return
    setError('')
    let amountRaw: bigint
    try {
      amountRaw = parseUnits(amount, 6)
      if (amountRaw <= 0n) throw new Error()
    } catch {
      setError('Enter a valid amount.')
      return
    }

    try {
      setBusy(true)
      const approveHash = await writeContractAsync({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [PREDICT_MARKET_CONTRACT, amountRaw] })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      const depositHash = await writeContractAsync({ ...BASE, functionName: 'deposit', args: [marketId, outcome, amountRaw] })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })

      // Deposit is confirmed on-chain (the source of truth for claims). Mirror to the DB
      // best-effort — a mirror failure only affects the off-chain positions list, not funds.
      try {
        const res = await fetch(`/api/markets/${onChainIdStr}/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bettor: address, outcome_index: outcome, amount: amountRaw.toString(), tx_hash: depositHash }),
        })
        if (!res.ok) console.error('position mirror POST failed:', res.status)
      } catch (err) {
        console.error('position mirror failed (deposit is on-chain):', err)
      }

      setAmount('')
      setOutcome(null)
      setBusy(false)
      onDone()
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  if (!isConnected) {
    return (
      <div style={{ ...cardStyle, textAlign: 'center' }}>
        <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to back an outcome.</p>
      </div>
    )
  }

  return (
    <div style={cardStyle}>
      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Back an outcome</span>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${outcomes.length}, 1fr)`, gap: 8, margin: '14px 0' }}>
        {outcomes.map((label, i) => {
          const active = outcome === i
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOutcome(i)}
              style={{
                padding: '12px 8px',
                borderRadius: 'var(--radius-input)',
                border: '1px solid',
                borderColor: active ? outcomeColor(i) : 'var(--color-pop-surface-2)',
                background: active ? `${outcomeColor(i)}14` : 'var(--color-pop-surface-2)',
                color: active ? outcomeColor(i) : 'var(--color-pop-text)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      <input
        type="number"
        placeholder="Amount (USDC)"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }}
      />

      {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.85rem', margin: '0 0 12px' }}>{error}</p>}

      <button
        onClick={handleDeposit}
        disabled={busy || outcome === null || !amount}
        style={{ ...ctaStyle, opacity: busy || outcome === null || !amount ? 0.5 : 1, cursor: busy || outcome === null || !amount ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'Depositing…' : 'Approve & deposit'}
      </button>
    </div>
  )
}

// ─── Claim / refund ───────────────────────────────────────────────────────────

function ClaimActions({
  status, resolvedOutcome, userStakes, totalUserStake, hasClaimed, marketId, onDone,
}: {
  status: MarketStatus
  resolvedOutcome: number | null
  userStakes: bigint[]
  totalUserStake: bigint
  hasClaimed: boolean
  marketId: bigint
  onDone: () => void
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const winningStake = status === 'Resolved' && resolvedOutcome != null ? (userStakes[resolvedOutcome] ?? 0n) : 0n
  const canClaim = status === 'Resolved' && winningStake > 0n && !hasClaimed
  const canRefund = status === 'Voided' && totalUserStake > 0n && !hasClaimed

  if (!canClaim && !canRefund) {
    if (hasClaimed && (status === 'Resolved' || status === 'Voided')) {
      return <p style={{ color: 'var(--color-pop-win)', fontSize: '0.9rem', marginTop: 20, textAlign: 'center' }}>You have already collected from this market.</p>
    }
    return null
  }

  async function handle(fn: 'claim' | 'claimRefund') {
    if (!publicClient) return
    setError('')
    try {
      setBusy(true)
      const hash = await writeContractAsync({ ...BASE, functionName: fn, args: [marketId] })
      await publicClient.waitForTransactionReceipt({ hash })
      setBusy(false)
      onDone()
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  return (
    <div style={{ ...cardStyle, marginTop: 20 }}>
      {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.85rem', margin: '0 0 12px' }}>{error}</p>}
      <button
        onClick={() => handle(canClaim ? 'claim' : 'claimRefund')}
        disabled={busy}
        style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'Processing…' : canClaim ? 'Claim winnings' : 'Claim refund'}
      </button>
    </div>
  )
}
