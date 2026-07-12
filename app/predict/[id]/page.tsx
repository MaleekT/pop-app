'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { parseUnits, zeroAddress, keccak256, toHex } from 'viem'
import { useAccount, useReadContract, useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { OddsBar } from '@/components/predict/OddsBar'
import { MarketStatusBadge } from '@/components/predict/MarketStatusBadge'
import {
  backBtnStyle, cardStyle, ctaStyle, secondaryCtaStyle, inputStyle, chipStyle,
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
  const [parlayRefs, setParlayRefs] = useState<number | null>(null)

  const loadMarket = useCallback(() => {
    fetch(`/api/markets/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MarketRow | null) => { setMarket(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  useEffect(() => { loadMarket() }, [loadMarket])

  useEffect(() => {
    if (!market) { setParlayRefs(null); return }
    fetch(`/api/markets/${market.on_chain_id}/parlay-refs`)
      .then((r) => (r.ok ? r.json() : { count: 1 }))
      .then((d: { count?: number }) => setParlayRefs(d.count ?? 0))
      .catch(() => setParlayRefs(1)) // fail closed: block removal if the check fails
  }, [market])

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
  const { data: ownerData } = useReadContract({ ...BASE, functionName: 'owner', query: { enabled } })

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
  // Pooled markets are one-side-per-user: once you hold a position, deposits lock to it.
  const userOutcome = userStakes.findIndex((s) => s > 0n)

  const resolveMs = new Date(market.resolve_at).getTime()
  const bettingOpen = status === 'Pending' && resolveMs > Date.now()
  const evidence = market.evidence as { sourceUrl?: string; rawValue?: string; rawStatus?: string } | null

  const isOwner = Boolean(address && ownerData && address.toLowerCase() === (ownerData as string).toLowerCase())
  // Removable only before anyone else pools in: the owner is the sole depositor (or the pool
  // is empty) and no open parlay references it. The owner's own seed refunds via the cron.
  const removable = isOwner && status === 'Pending' && totalPot === totalUserStake && parlayRefs === 0

  // One plain-language line per state, so a viewer always knows what happened and what is next.
  const winningLabel = resolvedOutcome != null ? outcomes[resolvedOutcome] : undefined
  const statusBanner: { text: string; accent?: boolean } | null =
    status === 'Resolved'
      ? { text: `Settled. ${winningLabel ?? 'The winning outcome'} won.`, accent: true }
      : status === 'Voided'
        ? { text: 'Cancelled. Everyone who deposited can claim their stake back.' }
        : status === 'Proposed' || status === 'Challenged'
          ? { text: 'Settling now. The result is in and this market is being finalized.' }
          : status === 'Pending' && !bettingOpen
            ? { text: 'Betting is closed. This market settles automatically, usually within a minute or two.' }
            : null

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '40px 24px 96px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Back to markets</Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={chipStyle}>{categoryLabel(market.category)}</span>
          <MarketStatusBadge status={status} resolveAt={market.resolve_at} />
        </div>

        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.35, margin: '0 0 24px' }}>
          {formatBetTitle(market.definition_text)}
        </h1>

        {statusBanner && (
          <div style={{ ...cardStyle, marginBottom: 20, padding: '14px 18px', border: `1px solid ${statusBanner.accent ? 'rgba(34,197,94,0.4)' : 'var(--color-pop-surface-2)'}` }}>
            <p style={{ margin: 0, color: statusBanner.accent ? 'var(--color-pop-win)' : 'var(--color-pop-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {statusBanner.text}
            </p>
          </div>
        )}

        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Total pool</span>
            <span style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-pop-accent)' }}><UsdcAmount amount={totalPot} /></span>
          </div>
          <OddsBar outcomes={outcomes} pools={pools} total={totalPot} resolvedOutcome={status === 'Resolved' ? resolvedOutcome : null} />
        </div>

        {isOwner && status === 'Pending' && (
          <OwnerActions market={market} marketId={onChainId} removable={removable} />
        )}

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

        {bettingOpen && (
          <DepositPanel
            marketId={onChainId}
            onChainIdStr={market.on_chain_id}
            outcomes={outcomes}
            lockedOutcome={userOutcome >= 0 ? userOutcome : null}
            onDone={refetchAll}
          />
        )}

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

      </main>
    </>
  )
}

// ─── Deposit panel ────────────────────────────────────────────────────────────

function DepositPanel({ marketId, onChainIdStr, outcomes, lockedOutcome, onDone }: { marketId: bigint; onChainIdStr: string; outcomes: string[]; lockedOutcome: number | null; onDone: () => void }) {
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [outcome, setOutcome] = useState<number | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const selected = lockedOutcome ?? outcome

  async function handleDeposit() {
    if (selected === null || !address || !publicClient) return
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

      const depositHash = await writeContractAsync({ ...BASE, functionName: 'deposit', args: [marketId, selected, amountRaw] })
      await publicClient.waitForTransactionReceipt({ hash: depositHash })

      // Deposit is confirmed on-chain (the source of truth for claims). Mirror to the DB
      // best-effort — a mirror failure only affects the off-chain positions list, not funds.
      try {
        const res = await fetch(`/api/markets/${onChainIdStr}/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bettor: address, outcome_index: selected, amount: amountRaw.toString(), tx_hash: depositHash }),
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
      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
        {lockedOutcome !== null ? `Add to your ${outcomes[lockedOutcome]} position` : 'Back an outcome'}
      </span>
      {lockedOutcome !== null ? (
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem', margin: '10px 0 14px' }}>
          You are backing{' '}
          <span style={{ color: outcomeColor(lockedOutcome), fontWeight: 600 }}>{outcomes[lockedOutcome]}</span>. In a
          pooled market you back one side, more deposits add to it.
        </p>
      ) : (
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
      )}

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
        disabled={busy || selected === null || !amount}
        style={{ ...ctaStyle, opacity: busy || selected === null || !amount ? 0.5 : 1, cursor: busy || selected === null || !amount ? 'not-allowed' : 'pointer' }}
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

// ─── Owner controls ───────────────────────────────────────────────────────────

function OwnerActions({ market, marketId, removable }: { market: MarketRow; marketId: bigint; removable: boolean }) {
  const router = useRouter()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function handleEdit() {
    // Edit = recreate with changes (on-chain markets are immutable). Hand the current
    // template + params to the create form via sessionStorage.
    sessionStorage.setItem('predict-edit', JSON.stringify({
      key: market.template_key,
      params: market.params,
      resolveAt: new Date(market.resolve_at).toISOString().slice(0, 16),
    }))
    router.push('/predict/new')
  }

  async function handleRemove() {
    if (!publicClient) return
    setError('')
    try {
      setBusy(true)
      // voidMarket is owner-callable and costless on an unbacked market. The owner's own
      // seed (if any) is returned automatically by the resolve-markets reclaim cron.
      const evidenceHash = keccak256(toHex(`owner-removed:${market.on_chain_id}`))
      const hash = await writeContractAsync({ address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi, functionName: 'voidMarket', args: [marketId, evidenceHash] })
      await publicClient.waitForTransactionReceipt({ hash })
      try {
        await fetch(`/api/markets/${market.on_chain_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'Voided' }),
        })
      } catch { /* DB mirror is best-effort; the market is voided on-chain regardless */ }
      router.push('/predict')
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  if (!removable) {
    return (
      <div style={{ ...cardStyle, marginTop: 20 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Owner controls</span>
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem', margin: '8px 0 0' }}>
          This market already has deposits from others or is used in a parlay, so it can no longer be edited or removed.
        </p>
      </div>
    )
  }

  return (
    <div style={{ ...cardStyle, marginTop: 20 }}>
      <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>Owner controls</span>
      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem', margin: '8px 0 14px' }}>
        No one else has backed this market yet, so you can still edit or remove it.
      </p>
      {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.82rem', margin: '0 0 10px' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={handleEdit} disabled={busy} style={{ ...secondaryCtaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
          Edit
        </button>
        <button onClick={handleRemove} disabled={busy} style={{ ...ctaStyle, background: 'var(--color-pop-danger)', color: '#fff', opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
          {busy ? 'Removing…' : 'Remove market'}
        </button>
      </div>
    </div>
  )
}
