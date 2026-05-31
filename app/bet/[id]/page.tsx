'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { keccak256, toHex, formatUnits } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi'
import { publicClient } from '@/lib/arc'
import { POP_CONTRACT, popAbi, USDC, erc20Abi } from '@/lib/contracts'
import { StatusBadge } from '@/components/StatusBadge'
import { UsdcAmount } from '@/components/UsdcAmount'
import { TxLink, AddressLink } from '@/components/TxLink'
import { Countdown } from '@/components/Countdown'
import { AppNav } from '@/components/AppNav'
import type { BetRow } from '@/lib/db.types'

type OnChainBet = {
  creator: `0x${string}`
  opponent: `0x${string}`
  stake: bigint
  joinDeadline: bigint
  resolveAt: bigint
  acceptedAt: bigint
  proposedAt: bigint
  definitionHash: `0x${string}`
  evidenceHash: `0x${string}`
  proposedWinner: `0x${string}`
  creatorVote: `0x${string}`
  opponentVote: `0x${string}`
  status: number
}

const CONTRACT_STATUS = ['Pending', 'Locked', 'Proposed', 'Resolved', 'Disputed', 'Cancelled', 'Expired', 'Open', 'Voided'] as const

export default function BetDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { address } = useAccount()
  const [dbBet, setDbBet] = useState<BetRow | null>(null)
  const [dbLoading, setDbLoading] = useState(true)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [actionError, setActionError] = useState('')
  const [profiles, setProfiles] = useState<Record<string, { handle?: string | null }>>({})
  const { writeContractAsync } = useWriteContract()
  const { isLoading: txPending } = useWaitForTransactionReceipt({ hash: txHash })

  // Read on-chain bet
  const { data: onChainRaw, refetch } = useReadContract({
    address: POP_CONTRACT,
    abi: popAbi,
    functionName: 'getBet',
    args: [BigInt(id)],
    query: { enabled: !isNaN(Number(id)) },
  })
  const bet = onChainRaw as OnChainBet | undefined

  // Fetch Supabase row for definition_text + evidence
  useEffect(() => {
    fetch(`/api/bets/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setDbBet(d); setDbLoading(false) })
      .catch(() => setDbLoading(false))
  }, [id])

  // Auto-heal: if chain status differs from Supabase, patch Supabase to match.
  // Chain is always truth — this fixes stale statuses from before sync was added.
  useEffect(() => {
    if (!bet || !dbBet) return
    const onChainStatus = CONTRACT_STATUS[bet.status]
    if (!onChainStatus || onChainStatus === dbBet.status) return
    fetch(`/api/bets/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: onChainStatus }),
    })
      .then(() => setDbBet(prev => prev ? { ...prev, status: onChainStatus as typeof CONTRACT_STATUS[number] } : prev))
      .catch(() => {})
  }, [bet, dbBet, id])

  // Fetch profiles for both participants to enable handle display
  useEffect(() => {
    if (!bet) return
    const addrs = [bet.creator, bet.opponent].filter(
      a => a && a !== '0x0000000000000000000000000000000000000000'
    )
    if (addrs.length === 0) return
    Promise.all(
      addrs.map(a => fetch(`/api/profile?address=${encodeURIComponent(a)}`).then(r => r.ok ? r.json() : null))
    ).then(results => {
      const map: Record<string, { handle?: string | null }> = {}
      addrs.forEach((a, i) => { if (results[i]) map[a] = results[i] })
      setProfiles(map)
    }).catch(() => {})
  }, [bet?.creator, bet?.opponent])

  // USDC allowance for accept flow
  const { data: allowance } = useReadContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && POP_CONTRACT ? [address, POP_CONTRACT] : undefined,
    query: { enabled: !!address },
  })

  if (!bet) {
    return (
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <p style={{ color: 'var(--color-pop-muted)' }}>Loading bet…</p>
      </main>
    )
  }

  const status = CONTRACT_STATUS[bet.status] ?? 'Pending'
  const nowMs = Date.now()
  const CHALLENGE_WINDOW_SECS = 3600 // 1 hour — must match Pop.sol CHALLENGE_WINDOW
  const challengeDeadlineMs = bet.proposedAt > 0n ? (Number(bet.proposedAt) + CHALLENGE_WINDOW_SECS) * 1000 : 0
  const resolveAtMs = Number(bet.resolveAt) * 1000
  const claimDeadlineMs = dbBet?.claim_deadline ? new Date(dbBet.claim_deadline).getTime() : 0

  // Definition text + tamper check
  const definitionText = dbBet?.definition_text
  const computedHash = definitionText ? keccak256(toHex(definitionText)) : undefined
  const tampered = computedHash && computedHash.toLowerCase() !== bet.definitionHash.toLowerCase()

  const isCreator = address?.toLowerCase() === bet.creator.toLowerCase()
  const isOpponent = address?.toLowerCase() === bet.opponent.toLowerCase()
  const isParticipant = isCreator || isOpponent
  const userIsWinner = status === 'Resolved' && isParticipant && !!address &&
    bet.proposedWinner.toLowerCase() === address.toLowerCase()
  const userIsLoser = status === 'Resolved' && isParticipant && !userIsWinner

  async function doAction(fn: () => Promise<`0x${string}`>) {
    setActionError('')
    try {
      const hash = await fn()
      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      const result = await refetch()
      // Sync the new on-chain status back to Supabase so /my stays accurate
      const updated = result.data as OnChainBet | undefined
      if (updated != null) {
        const newStatus = CONTRACT_STATUS[updated.status]
        if (newStatus) {
          await fetch(`/api/bets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          }).catch(() => {})
        }
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Transaction failed.')
    }
  }

  async function handleClaim() {
    if (!bet || !address) return
    setActionError('')
    try {
      const latest = (await refetch()).data as OnChainBet | undefined
      if (!latest || latest.status !== 7) {
        setActionError('Someone else just claimed this bet first.')
        return
      }
      const needsApprove = !allowance || (allowance as bigint) < bet.stake
      if (needsApprove) {
        const approveHash = await writeContractAsync({
          address: USDC, abi: erc20Abi, functionName: 'approve', args: [POP_CONTRACT, bet.stake],
        })
        setTxHash(approveHash)
        await publicClient.waitForTransactionReceipt({ hash: approveHash })
      }
      const claimHash = await writeContractAsync({
        address: POP_CONTRACT, abi: popAbi, functionName: 'claimOpenBet', args: [BigInt(id)],
      })
      setTxHash(claimHash)
      await publicClient.waitForTransactionReceipt({ hash: claimHash })
      const result = await refetch()
      const updated = result.data as OnChainBet | undefined
      if (updated) {
        const newStatus = CONTRACT_STATUS[updated.status]
        if (newStatus) {
          await fetch(`/api/bets/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            // Write the opponent address so the claimer sees the bet in My Bets
            body: JSON.stringify({ status: newStatus, opponent: address }),
          }).catch(() => {})
          setDbBet(prev => prev ? { ...prev, status: newStatus as typeof CONTRACT_STATUS[number], opponent: address ?? '' } : prev)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Transaction failed.'
      setActionError(msg.includes('SeatTaken') ? 'Someone else just claimed this bet first.' : msg)
    }
  }

  async function handleAccept() {
    if (!bet) return
    const needsApprove = !allowance || (allowance as bigint) < bet.stake
    if (needsApprove) {
      await doAction(() =>
        writeContractAsync({ address: USDC, abi: erc20Abi, functionName: 'approve', args: [POP_CONTRACT, bet.stake] })
      )
    }
    await doAction(() =>
      writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'acceptBet', args: [BigInt(id)] })
    )
  }

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <a href="/my" style={{ color: 'var(--color-pop-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>← My bets</a>
          <StatusBadge status={status} />
        </div>

      {tampered && (
        <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid var(--color-pop-danger)', borderRadius: 'var(--radius-card)', padding: '12px 16px', marginBottom: 20, color: 'var(--color-pop-danger)', fontSize: '0.875rem' }}>
          ⚠ Definition text has been tampered with — the stored text does not match the on-chain hash.
        </div>
      )}

      {/* Bet definition */}
      <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 20 }}>
        {dbLoading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading definition…</p>
        ) : definitionText ? (
          <p style={{ lineHeight: 1.7, fontSize: '1.0625rem' }}>{definitionText}</p>
        ) : (
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--color-pop-muted)', wordBreak: 'break-all' }}>
            Definition hash: {bet.definitionHash}
          </p>
        )}
      </div>

      {/* Financials */}
      <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20, display: 'flex', justifyContent: 'space-around' }}>
        <Stat label="Stake each" value={<UsdcAmount amount={bet.stake} />} />
        <Stat label="Total pot" value={<UsdcAmount amount={bet.stake * 2n} accent />} />
      </div>

      {/* Participants */}
      <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ParticipantRow label="Creator" address={bet.creator} isYou={isCreator} profile={profiles[bet.creator]} />
        <ParticipantRow
          label="Opponent"
          address={bet.opponent === '0x0000000000000000000000000000000000000000' ? undefined : bet.opponent}
          isYou={isOpponent}
          profile={bet.opponent ? profiles[bet.opponent] : undefined}
        />
      </div>

      {/* Timings */}
      {status === 'Locked' && resolveAtMs > nowMs && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Countdown targetMs={resolveAtMs} label="until resolution" />
        </div>
      )}

      {status === 'Proposed' && challengeDeadlineMs > nowMs && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Countdown targetMs={challengeDeadlineMs} label="challenge window" />
        </div>
      )}

      {status === 'Open' && claimDeadlineMs > nowMs && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '24px 0' }}>
          <Countdown targetMs={claimDeadlineMs} label="to claim" />
        </div>
      )}

      {/* Evidence card (Proposed / Resolved) */}
      {(status === 'Proposed' || status === 'Resolved') && dbBet?.evidence && (
        <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-pop-muted)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Evidence</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <EvidenceRow label="Raw value" value={'rawValue' in dbBet.evidence ? dbBet.evidence.rawValue : dbBet.evidence.rawStatus} />
            <EvidenceRow label="Fetched at" value={new Date(dbBet.evidence.fetchedAt).toLocaleString()} />
            <EvidenceRow label="Source" value={
              <a href={dbBet.evidence.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-pop-accent)', wordBreak: 'break-all' }}>
                {dbBet.evidence.sourceUrl}
              </a>
            } />
          </div>
        </div>
      )}

      {/* Voided evidence card */}
      {status === 'Voided' && dbBet?.evidence && 'rawStatus' in dbBet.evidence && (
        <div style={{ background: 'rgba(113,113,122,0.1)', border: '1px solid rgba(113,113,122,0.3)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-pop-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Bet voided</div>
          <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12, margin: '0 0 12px' }}>
            This match was {dbBet.evidence.rawStatus.toLowerCase()}. Both stakes have been refunded.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <EvidenceRow label="Status" value={dbBet.evidence.rawStatus} />
            <EvidenceRow label="Checked at" value={new Date(dbBet.evidence.fetchedAt).toLocaleString()} />
          </div>
        </div>
      )}

      {/* Proposed winner */}
      {status === 'Proposed' && bet.proposedWinner !== '0x0000000000000000000000000000000000000000' && (
        <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 'var(--radius-card)', padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: dbBet ? 12 : 0 }}>
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>Proposed winner:</span>
            <AddressLink address={bet.proposedWinner} />
            {bet.proposedWinner.toLowerCase() === address?.toLowerCase() && (
              <span style={{ color: 'var(--color-pop-accent)', fontSize: '0.75rem', fontWeight: 700 }}>← that's you</span>
            )}
          </div>
          {dbBet && <ResolutionEvidence dbBet={dbBet} />}
        </div>
      )}

      {/* Resolved winner */}
      {status === 'Resolved' && bet.proposedWinner !== '0x0000000000000000000000000000000000000000' && (
        <div style={{
          background: userIsLoser ? 'rgba(239,68,68,0.08)' : 'rgba(34,197,94,0.08)',
          border: `1px solid ${userIsLoser ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)'}`,
          borderRadius: 'var(--radius-card)',
          padding: '20px 24px',
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: dbBet ? 14 : 0 }}>
            <div>
              <div style={{
                fontSize: '1.125rem',
                fontWeight: 800,
                color: userIsLoser ? 'var(--color-pop-danger)' : 'var(--color-pop-win)',
                marginBottom: (userIsLoser || !isParticipant) ? 6 : 0,
              }}>
                {userIsWinner ? '🎉 You won!' : userIsLoser ? 'Better luck next time' : 'Bet resolved'}
              </div>
              {(userIsLoser || !isParticipant) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AddressLink address={bet.proposedWinner} />
                  <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>took the pot</span>
                </div>
              )}
            </div>
            {isParticipant ? (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-pop-muted)', fontWeight: 600, marginBottom: 2 }}>P&L</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: userIsWinner ? 'var(--color-pop-win)' : 'var(--color-pop-danger)' }}>
                  {userIsWinner ? '+' : '−'}<UsdcAmount amount={bet.stake} />
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-pop-muted)', fontWeight: 600, marginBottom: 2 }}>Pot</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--color-pop-accent)' }}>
                  <UsdcAmount amount={bet.stake * 2n} />
                </div>
              </div>
            )}
          </div>
          {dbBet && <ResolutionEvidence dbBet={dbBet} />}
        </div>
      )}

      {/* Actions */}
      {actionError && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', marginBottom: 12 }}>{actionError}</p>}

      {txHash && (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-pop-muted)', marginBottom: 12 }}>
          Tx: <TxLink hash={txHash} />
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {status === 'Open' && address && !isCreator && claimDeadlineMs > nowMs && (
          <ActionButton label={txPending ? 'Claiming…' : 'Take this bet'} accent disabled={txPending} onClick={handleClaim} />
        )}

        {status === 'Open' && isCreator && claimDeadlineMs > nowMs && (
          <ActionButton label={txPending ? 'Cancelling…' : 'Cancel bet'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'cancelBet', args: [BigInt(id)] }))} />
        )}

        {status === 'Open' && isCreator && claimDeadlineMs <= nowMs && (
          <ActionButton label={txPending ? 'Claiming refund…' : 'Claim refund (expired)'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'claimExpired', args: [BigInt(id)] }))} />
        )}

        {status === 'Pending' && isOpponent && (
          <>
            <ActionButton label={txPending ? 'Accepting…' : 'Accept bet'} disabled={txPending} accent onClick={handleAccept} />
            <ActionButton label="Decline" disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'declineBet', args: [BigInt(id)] }))} />
          </>
        )}

        {status === 'Pending' && isCreator && (
          <ActionButton label={txPending ? 'Cancelling…' : 'Cancel bet'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'cancelBet', args: [BigInt(id)] }))} />
        )}

        {status === 'Proposed' && isParticipant && nowMs < challengeDeadlineMs && (
          <ActionButton label={txPending ? 'Challenging…' : 'Challenge result'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'challenge', args: [BigInt(id)] }))} />
        )}

        {status === 'Proposed' && nowMs >= challengeDeadlineMs && (
          <ActionButton label={txPending ? 'Finalising…' : 'Finalise (claim pot)'} accent disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'finalize', args: [BigInt(id)] }))} />
        )}

        {status === 'Disputed' && isParticipant && (
          <>
            <ActionButton label={txPending ? 'Voting…' : `Vote: ${bet.creator.slice(0,6)}… (creator)`} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'voteWinner', args: [BigInt(id), bet.creator] }))} />
            <ActionButton label={`Vote: ${bet.opponent.slice(0,6)}… (opponent)`} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'voteWinner', args: [BigInt(id), bet.opponent] }))} />
          </>
        )}

        {status === 'Locked' && isParticipant && resolveAtMs > 0 && nowMs >= resolveAtMs && (
          <ActionButton label={txPending ? 'Claiming refund…' : 'Claim refund (resolver timed out)'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'claimExpired', args: [BigInt(id)] }))} />
        )}

        {status === 'Disputed' && isParticipant && resolveAtMs > 0 && nowMs >= resolveAtMs && (
          <ActionButton label={txPending ? 'Claiming refund…' : 'Claim refund (dispute timed out)'} disabled={txPending} onClick={() => doAction(() => writeContractAsync({ address: POP_CONTRACT, abi: popAbi, functionName: 'claimExpired', args: [BigInt(id)] }))} />
        )}
      </div>
      </main>
    </>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: '1.125rem' }}>{value}</div>
    </div>
  )
}

function ParticipantRow({ label, address, isYou, profile }: { label: string; address?: `0x${string}`; isYou: boolean; profile?: { handle?: string | null } }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>{label}</span>
      <span>
        {address ? <AddressLink address={address} profile={profile} /> : <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>—</span>}
        {isYou && <span style={{ color: 'var(--color-pop-accent)', fontSize: '0.75rem', marginLeft: 6 }}>you</span>}
      </span>
    </div>
  )
}

function EvidenceRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>{value}</span>
    </div>
  )
}

function ResolutionEvidence({ dbBet }: { dbBet: BetRow }) {
  const evidence = dbBet.evidence
  if (!evidence || !('rawValue' in evidence)) return null

  const tk = dbBet.template_key
  const p = dbBet.params
  const raw = evidence.rawValue

  function fmtUsd(v: string) {
    const n = parseFloat(v)
    if (isNaN(n)) return v
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  function fmtCount(v: string) {
    const n = parseInt(v, 10)
    if (isNaN(n)) return v
    return n.toLocaleString('en-US')
  }

  function ticker(coinName?: string): string {
    if (!coinName) return ''
    const m = coinName.match(/\(([A-Z]+)\)/)
    return m ? m[1] : coinName
  }

  type EvidenceRow = { label: string; value: string; accent?: boolean }
  let rows: EvidenceRow[] = []

  if (tk === 'crypto_price_above' || tk === 'crypto_price_below') {
    const sym = ticker(p.coinName)
    const dir = tk === 'crypto_price_above' ? 'above' : 'below'
    rows = [
      { label: 'Threshold', value: `${sym} ${dir} ${fmtUsd(p.target)}` },
      { label: 'Final price', value: `${sym} at ${fmtUsd(raw)}`, accent: true },
    ]
  } else if (tk === 'youtube_views') {
    rows = [
      { label: 'Target views', value: fmtCount(p.target) },
      { label: 'Actual views', value: fmtCount(raw), accent: true },
    ]
  } else if (tk === 'youtube_subs') {
    rows = [
      { label: 'Target subs', value: fmtCount(p.target) },
      { label: 'Actual subs', value: fmtCount(raw), accent: true },
    ]
  } else if (tk === 'sports_winner') {
    rows = [
      { label: 'Predicted winner', value: p.pickedTeam ?? '--' },
      { label: 'Actual result', value: raw, accent: true },
    ]
  } else if (tk === 'sports_score') {
    const dir = (p.direction ?? 'OVER').toUpperCase()
    rows = [
      { label: 'Score threshold', value: `${dir} ${p.target}` },
      { label: 'Final score', value: raw, accent: true },
    ]
  } else {
    return null
  }

  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, display: 'flex', gap: 32, flexWrap: 'wrap' }}>
      {rows.map(r => (
        <div key={r.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-pop-muted)', fontWeight: 600 }}>
            {r.label}
          </span>
          <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: r.accent ? 'var(--color-pop-accent)' : 'var(--color-pop-text)' }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function ActionButton({ label, onClick, accent, disabled }: { label: string; onClick: () => void; accent?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: accent ? 'var(--color-pop-accent)' : 'var(--color-pop-surface)',
        color: accent ? '#0B0B0F' : 'var(--color-pop-text)',
        border: accent ? 'none' : '1px solid var(--color-pop-surface-2)',
        borderRadius: 'var(--radius-cta)',
        padding: '13px 0',
        fontWeight: 700,
        fontSize: '0.9375rem',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        width: '100%',
      }}
    >
      {label}
    </button>
  )
}
