'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { parseUnits, zeroAddress, keccak256, toHex } from 'viem'
import { useAccount, useReadContract, useReadContracts, useWriteContract, usePublicClient } from 'wagmi'
import { AppNav } from '@/components/AppNav'
import { UsdcAmount } from '@/components/UsdcAmount'
import { OddsBar } from '@/components/predict/OddsBar'
import { MarketStatusBadge } from '@/components/predict/MarketStatusBadge'
import { BackLink } from '@/components/predict/BackLink'
import {
  cardStyle, ctaStyle, secondaryCtaStyle, inputStyle,
  categoryLabel, categoryPillStyle, outcomeColor, impliedPct, formatMarketTitle, friendlyTxError,
} from '@/components/predict/ui'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi, MARKET_STATUS } from '@/lib/predict/contracts'
import { USDC, erc20Abi } from '@/lib/contracts'
import type { MarketRow, MarketStatus } from '@/lib/markets/db.types'

const BASE = { address: PREDICT_MARKET_CONTRACT, abi: predictMarketAbi } as const

export interface MarketDetailProps {
  id: string
  // The section this view is mounted under. Drives Back on a cold load and the post-remove redirect,
  // so a user is returned to where they came from rather than always to the board.
  backHref: string
}

// The market detail view, mounted under BOTH sections: /predict/[id] for the board and
// /activity/market/[id] for a wallet's own positions. Each section owning its own URL is what keeps
// AppNav's pathname check honest, so opening your own position from Activity cannot read as Predict.
export function MarketDetail({ id, backHref }: MarketDetailProps) {
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

  const { data: potData, refetch: refetchPot } = useReadContract({ ...BASE, functionName: 'totalPot', args: [onChainId], query: { enabled, refetchInterval: 15_000 } })
  // Sum of the outcome pools, EXCLUDING sponsorship. The odds are derived from this, never from
  // totalPot, so a sponsored pot cannot distort the percentages.
  const { data: poolSumData, refetch: refetchPoolSum } = useReadContract({ ...BASE, functionName: 'poolSum', args: [onChainId], query: { enabled, refetchInterval: 15_000 } })
  const { data: chainData, refetch: refetchChain } = useReadContract({ ...BASE, functionName: 'getMarket', args: [onChainId], query: { enabled } })
  const { data: claimedData, isSuccess: claimedKnown, refetch: refetchClaimed } = useReadContract({ ...BASE, functionName: 'claimed', args: [onChainId, user], query: { enabled, refetchInterval: 15_000 } })
  const { data: poolsData, refetch: refetchPools } = useReadContracts({
    contracts: outcomes.map((_, i) => ({ ...BASE, functionName: 'pool' as const, args: [onChainId, i] })),
    query: { enabled, refetchInterval: 15_000 },
  })
  // The pool reads above retry on an interval; this one did not, so one rate-limited call left
  // stakesData undefined indefinitely, and the `?? 0n` below renders that as "no position". Retry on
  // the same interval, and track whether the answer is actually known (see stakesKnown).
  const { data: stakesData, isSuccess: stakesQueryOk, isError: stakesFailed, refetch: refetchStakes } = useReadContracts({
    contracts: outcomes.map((_, i) => ({ ...BASE, functionName: 'staked' as const, args: [onChainId, i, user] })),
    query: { enabled, refetchInterval: 15_000 },
  })
  const { data: ownerData } = useReadContract({ ...BASE, functionName: 'owner', query: { enabled } })

  const refetchAll = useCallback(() => {
    refetchPot(); refetchPoolSum(); refetchChain(); refetchClaimed(); refetchPools(); refetchStakes(); loadMarket()
  }, [refetchPot, refetchPoolSum, refetchChain, refetchClaimed, refetchPools, refetchStakes, loadMarket])

  if (loading) {
    return (<><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}><p style={{ color: 'var(--color-pop-muted)' }}>Loading market…</p></main></>)
  }
  if (!market) {
    return (
      <><AppNav /><main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <BackLink fallbackHref={backHref} />
        <p style={{ color: 'var(--color-pop-muted)' }}>Market not found.</p>
      </main></>
    )
  }

  const chainMarket = chainData as unknown as { status: number; resolvedOutcome: number } | undefined
  const status: MarketStatus = chainMarket ? MARKET_STATUS[chainMarket.status] ?? market.status : market.status
  const resolvedOutcome = chainMarket ? chainMarket.resolvedOutcome : market.resolved_outcome
  const totalPot = (potData as bigint | undefined) ?? 0n
  const poolSum = (poolSumData as bigint | undefined) ?? 0n
  const pools = outcomes.map((_, i) => (poolsData?.[i]?.result as bigint | undefined) ?? 0n)
  const userStakes = outcomes.map((_, i) => (stakesData?.[i]?.result as bigint | undefined) ?? 0n)
  const totalUserStake = userStakes.reduce((a, b) => a + b, 0n)
  const hasClaimed = Boolean(claimedData)
  // Known only when the multicall succeeded AND every outcome came back. A partial result must not
  // pass: the `?? 0n` above would render a missing stake as a zero one.
  const stakesKnown = stakesQueryOk && outcomes.every((_, i) => stakesData?.[i]?.status === 'success')
  // Pooled markets are one-side-per-user: once you hold a position, deposits lock to it. That rule is
  // enforced ONLY here — deposit() happily funds both sides (PredictMarket.sol:107) — so it may only be
  // trusted while stakesKnown. claim() pays staked[winner] alone and then sets claimed, so a deposit on
  // the second side is unrecoverable. An unknown position therefore hides the picker outright rather
  // than defaulting to "no position" and offering the user a side they may already be against.
  const userOutcome = userStakes.findIndex((s) => s > 0n)

  const resolveMs = new Date(market.resolve_at).getTime()
  const bettingOpen = status === 'Pending' && resolveMs > Date.now()
  const evidence = market.evidence as { sourceUrl?: string; rawValue?: string; rawStatus?: string } | null

  const isOwner = Boolean(address && ownerData && address.toLowerCase() === (ownerData as string).toLowerCase())
  // Removable only before anyone else pools in: the owner is the sole depositor (or the pool
  // is empty) and no open parlay references it. The owner's own seed refunds via the cron.
  // Compare against poolSum (deposits), NOT totalPot (deposits + sponsorship). Using totalPot would
  // mean the owner sponsoring their own market silently made it unremovable, since sponsorship is
  // not someone else's bet — it is the owner's own money, refunded to them by the void.
  const removable = isOwner && status === 'Pending' && poolSum === totalUserStake && parlayRefs === 0

  // One plain-language line per state, so a viewer always knows what happened and what is next.
  // On a settled market a holder is told THEIR result (won/lost), not just which outcome won.
  // Guaranteed a string (bounds-checked), so it never renders "undefined" in any banner branch.
  // The contract validates outcome < outcomeCount at propose time, so the fallback is unreachable.
  const winningLabel = resolvedOutcome != null && resolvedOutcome < outcomes.length ? outcomes[resolvedOutcome] : 'the winning outcome'
  const holdsPosition = userOutcome >= 0
  const resolvedBanner: { text: string; accent?: boolean } =
    holdsPosition && resolvedOutcome != null
      ? userOutcome === resolvedOutcome
        ? { text: `You won. ${winningLabel} took it — claim your payout below.`, accent: true }
        : { text: `You lost this one. ${winningLabel} won; you backed ${outcomes[userOutcome]}.` }
      : { text: `Settled. ${winningLabel} won.`, accent: true }
  const statusBanner: { text: string; accent?: boolean } | null =
    status === 'Resolved'
      ? resolvedBanner
      : status === 'Voided'
        ? { text: 'Cancelled. Everyone who deposited can claim their stake back.' }
        : status === 'Proposed' || status === 'Challenged'
          ? { text: 'Settling now. The result is in and this market is being finalized.' }
          : status === 'Pending' && !bettingOpen
            // No time promise here: betting on a fixture closes at kick-off, so this is the state a
            // market holds for the whole match. It settles on the first resolver run after the
            // result is final, which is immediate for a crypto strike and the final whistle for a game.
            ? { text: 'Betting is closed. This market settles automatically as soon as the result is final.' }
            : null

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 24px 96px' }}>
        <BackLink fallbackHref={backHref} />

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 420px', minWidth: 0 }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={categoryPillStyle(market.category)}>{categoryLabel(market.category)}</span>
              <MarketStatusBadge status={status} resolveAt={market.resolve_at} />
            </div>

            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, lineHeight: 1.35, margin: '0 0 24px' }}>
              {formatMarketTitle(market.definition_text)}
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
                <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Prize pool</span>
                <span style={{ fontWeight: 700, fontSize: '1.15rem', color: 'var(--color-pop-accent)' }}><UsdcAmount amount={totalPot} /></span>
              </div>
              {/* Odds come off the pools, not the pot: sponsorship lifts the pot without touching a pool. */}
              <OddsBar outcomes={outcomes} pools={pools} total={poolSum} resolvedOutcome={status === 'Resolved' ? resolvedOutcome : null} />
            </div>

            {isOwner && status === 'Pending' && (
              <OwnerActions market={market} marketId={onChainId} removable={removable} backHref={backHref} />
            )}

            {totalUserStake > 0n && (
              <div style={{ ...cardStyle, marginBottom: 20 }}>
                <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>
                  {isOwner ? 'Liquidity you seeded' : 'Your position'}
                </span>
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

            {/* The owner is a neutral liquidity sponsor: they top up the prize pot, they never back a side. */}
            {bettingOpen && (isOwner ? (
              <SponsorPanel marketId={onChainId} onDone={refetchAll} />
            ) : stakesKnown ? (
              <DepositPanel
                marketId={onChainId}
                onChainIdStr={market.on_chain_id}
                outcomes={outcomes}
                lockedOutcome={userOutcome >= 0 ? userOutcome : null}
                onDone={refetchAll}
              />
            ) : (
              <PositionUnavailable failed={stakesFailed} onRetry={() => { refetchStakes() }} />
            ))}

            <ClaimActions
              status={status}
              resolvedOutcome={resolvedOutcome}
              userStakes={userStakes}
              totalUserStake={totalUserStake}
              hasClaimed={hasClaimed}
              ready={stakesKnown && claimedKnown}
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

          </div>

          {/* Side rail: what this bettor stands to win, live off the pool. The owner has no side, so no
              card. Only while the market is unsettled — once it resolves, ClaimActions states what you
              actually won or lost, and a "potential payout" beside it would be a lie to a losing bettor. */}
          {!isOwner && totalUserStake > 0n && status === 'Pending' && (
            <aside style={{ flex: '0 1 320px', minWidth: 280, position: 'sticky', top: 84 }}>
              <PayoutCard
                outcomes={outcomes}
                pools={pools}
                poolSum={poolSum}
                totalPot={totalPot}
                userStakes={userStakes}
              />
            </aside>
          )}
        </div>
      </main>
    </>
  )
}

// What the bettor gets back if their side wins, at the pool as it stands right now.
// POP is parimutuel (unlike Polymarket, which locks a price at buy), so this is provisional:
// it moves with every new deposit and is only final once the market resolves.
function PayoutCard({ outcomes, pools, poolSum, totalPot, userStakes }: {
  outcomes: string[]
  pools: bigint[]
  poolSum: bigint
  totalPot: bigint
  userStakes: bigint[]
}) {
  // One side per user, so the first funded outcome is the whole position.
  const side = userStakes.findIndex((s) => s > 0n)
  if (side < 0) return null

  const stake = userStakes[side]
  const sidePool = pools[side] ?? 0n
  const pct = impliedPct(sidePool, poolSum)
  // Parimutuel: winners split the whole pot pro-rata to their share of the winning pool.
  const payout = sidePool > 0n ? (stake * totalPot) / sidePool : 0n
  const profit = payout > stake ? payout - stake : 0n
  const multiplier = sidePool > 0n ? Number((totalPot * 100n) / sidePool) / 100 : 0

  const row = (label: string, value: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem' }}>{label}</span>
      <span style={{ fontSize: '0.9rem', textAlign: 'right' }}>{value}</span>
    </div>
  )

  return (
    <div style={{ ...cardStyle, padding: 20 }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Your payout</span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
        {row('You backed', (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: outcomeColor(side) }} />
            <span style={{ color: outcomeColor(side), fontWeight: 700 }}>{outcomes[side]}</span>
          </span>
        ))}
        {row('Deposited', <UsdcAmount amount={stake} />)}
        {row('Odds', <span style={{ fontFamily: 'var(--font-mono)' }}>{pct.toFixed(1)}% · {multiplier.toFixed(2)}x</span>)}

        <div style={{ height: 1, background: 'var(--color-pop-surface-2)', margin: '3px 0' }} />

        {row('Potential payout', (
          <span style={{ color: 'var(--color-pop-win)', fontWeight: 700, fontSize: '1.05rem' }}><UsdcAmount amount={payout} /></span>
        ))}
        {row('Profit', (
          <span style={{ color: 'var(--color-pop-accent)', fontWeight: 600 }}>+<UsdcAmount amount={profit} /></span>
        ))}
      </div>

      <p style={{ margin: '14px 0 0', color: 'var(--color-pop-muted)', fontSize: '0.72rem', lineHeight: 1.55 }}>
        At current pool. This is a pooled market: your payout moves as money comes in on either side,
        and is only final once the market resolves.
      </p>
    </div>
  )
}

// Owner-only. Adds prize money to the pot WITHOUT joining a side, so the odds cannot move and the
// owner takes no position. It exists to lift payouts when liquidity is thin.
function SponsorPanel({ marketId, onDone }: { marketId: bigint; onDone: () => void }) {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSponsor() {
    if (!address || !publicClient) return
    setError('')

    let raw: bigint
    try {
      raw = parseUnits(amount, 6)
    } catch {
      setError('Enter a valid amount.')
      return
    }
    if (raw <= 0n) { setError('Enter an amount greater than zero.'); return }

    try {
      setBusy(true)
      const approveHash = await writeContractAsync({
        address: USDC, abi: erc20Abi, functionName: 'approve', args: [PREDICT_MARKET_CONTRACT, raw],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      const hash = await writeContractAsync({ ...BASE, functionName: 'sponsor', args: [marketId, raw] })
      await publicClient.waitForTransactionReceipt({ hash })

      setAmount('')
      onDone()
    } catch (e) {
      setError(friendlyTxError(e))
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || !amount

  return (
    <div style={{ ...cardStyle, marginBottom: 20 }}>
      <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>Sponsor the pot</span>
      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem', margin: '10px 0 14px', lineHeight: 1.6 }}>
        Adds prize money that the winners split. It joins neither side, so the odds do not move and you
        take no position — it simply raises every bettor&apos;s payout. Refunded to you if the market is cancelled.
      </p>
      <input
        type="number" min="0" step="0.01" placeholder="Amount (USDC)"
        value={amount} onChange={(e) => setAmount(e.target.value)}
        style={{ ...inputStyle, marginBottom: 12 }}
      />
      {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.85rem', margin: '0 0 12px' }}>{error}</p>}
      <button
        onClick={handleSponsor}
        disabled={disabled}
        style={{ ...ctaStyle, opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
      >
        {busy ? 'Sponsoring…' : 'Approve & sponsor'}
      </button>
    </div>
  )
}

// ─── Deposit panel ────────────────────────────────────────────────────────────

// Stands in for the deposit panel while this wallet's position is unknown. "I could not read it" and
// "you have none" are different facts, and only the second one may unlock the outcome picker: showing
// the picker to someone who already holds a side invites a deposit on the opposite one, which claim()
// can never pay out. Unknown fails closed, and says why.
function PositionUnavailable({ failed, onRetry }: { failed: boolean; onRetry: () => void }) {
  if (!failed) {
    return (
      <div style={cardStyle}>
        <p style={{ color: 'var(--color-pop-muted)', margin: 0, fontSize: '0.9rem' }}>Loading your position…</p>
      </div>
    )
  }
  return (
    <div style={cardStyle}>
      <p style={{ color: 'var(--color-pop-text)', fontWeight: 700, fontSize: '0.95rem', margin: '0 0 8px' }}>
        Could not load your position
      </p>
      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.82rem', margin: '0 0 14px', lineHeight: 1.6 }}>
        The network did not answer, so we cannot tell which side you are on. Backing an outcome stays
        hidden until we can, so you are never shown the wrong one.
      </p>
      <button type="button" onClick={onRetry} style={secondaryCtaStyle}>Retry</button>
    </div>
  )
}

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
  status, resolvedOutcome, userStakes, totalUserStake, hasClaimed, ready, marketId, onDone,
}: {
  status: MarketStatus
  resolvedOutcome: number | null
  userStakes: bigint[]
  totalUserStake: bigint
  hasClaimed: boolean
  // Both the stake and the claimed flag were actually read. Without this, a failed `claimed` read
  // reads as "not yet claimed" and offers a Claim that reverts AlreadyClaimed at the user's expense.
  ready: boolean
  marketId: bigint
  onDone: () => void
}) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const winningStake = status === 'Resolved' && resolvedOutcome != null ? (userStakes[resolvedOutcome] ?? 0n) : 0n
  const canClaim = ready && status === 'Resolved' && winningStake > 0n && !hasClaimed
  const canRefund = ready && status === 'Voided' && totalUserStake > 0n && !hasClaimed

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

function OwnerActions({ market, marketId, removable, backHref }: { market: MarketRow; marketId: bigint; removable: boolean; backHref: string }) {
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
      router.push(backHref)
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
