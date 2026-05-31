'use client'

import { useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { useWatchContractEvent } from 'wagmi'
import { POP_CONTRACT, popAbi } from '@/lib/contracts'
import { UsdcAmount } from './UsdcAmount'

interface PopCelebrationProps {
  userAddress?: `0x${string}`
}

type WinVariant = 'standard' | 'open-creator' | 'open-claimant'

export function PopCelebration({ userAddress }: PopCelebrationProps) {
  const [visible, setVisible] = useState(false)
  const [pot, setPot] = useState<bigint>(0n)
  const [winner, setWinner] = useState<`0x${string}` | null>(null)
  const [winVariant, setWinVariant] = useState<WinVariant>('standard')
  const firedRef = useRef(false)
  const openBetsRef = useRef<Map<string, { claimant: `0x${string}` }>>(new Map())

  useWatchContractEvent({
    address: POP_CONTRACT,
    abi: popAbi,
    eventName: 'OpenBetClaimed',
    onLogs(logs) {
      for (const log of logs) {
        const { id, claimant } = log.args as { id: bigint; claimant: `0x${string}` }
        openBetsRef.current.set(id.toString(), { claimant })
      }
    },
  })

  useWatchContractEvent({
    address: POP_CONTRACT,
    abi: popAbi,
    eventName: 'BetResolved',
    onLogs(logs) {
      for (const log of logs) {
        const { id, winner: w, pot: p } = log.args as { id: bigint; winner: `0x${string}`; pot: bigint }
        if (!userAddress || w?.toLowerCase() !== userAddress.toLowerCase()) continue
        if (firedRef.current) continue
        firedRef.current = true

        const openInfo = openBetsRef.current.get(id.toString())
        let variant: WinVariant = 'standard'
        if (openInfo) {
          variant = openInfo.claimant.toLowerCase() === userAddress.toLowerCase()
            ? 'open-claimant'
            : 'open-creator'
        }

        setPot(p)
        setWinner(w)
        setWinVariant(variant)
        setVisible(true)
        fireConfetti()
        setTimeout(() => { firedRef.current = false }, 8000)
      }
    },
  })

  if (!visible || !winner) return null

  const isWinner = !userAddress || winner.toLowerCase() === userAddress.toLowerCase()

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isWinner ? 'You won the bet!' : 'Bet resolved'}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0 16px 48px',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          background: 'var(--color-pop-surface)',
          border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)',
          padding: '32px 36px',
          maxWidth: 420,
          width: '100%',
          textAlign: 'center',
          pointerEvents: 'auto',
          animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {isWinner ? (
          <>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>🎉</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-pop-accent)', marginBottom: 8 }}>
              You won!
            </h2>
            <p style={{ color: 'var(--color-pop-muted)', marginBottom: 16, fontSize: '0.9375rem' }}>
              {winVariant === 'open-creator' && 'Someone took your bet. You won.'}
              {winVariant === 'open-claimant' && 'You called it. Stake doubled.'}
              {winVariant === 'standard' && 'The pot is yours.'}
            </p>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--color-pop-accent)' }}>
              <UsdcAmount amount={pot} />
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🤝</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, marginBottom: 8 }}>
              GG
            </h2>
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9375rem' }}>Better luck next time.</p>
          </>
        )}
        <button
          onClick={() => setVisible(false)}
          style={{
            marginTop: 24,
            background: 'var(--color-pop-surface-2)',
            border: 'none',
            borderRadius: 'var(--radius-pill)',
            color: 'var(--color-pop-muted)',
            padding: '8px 24px',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Dismiss
        </button>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

function fireConfetti() {
  const count = 180
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 10000 }
  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min

  confetti({ ...defaults, particleCount: count * 0.4, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#D7FF1E', '#22C55E', '#FFFFFF'] })
  confetti({ ...defaults, particleCount: count * 0.4, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#D7FF1E', '#FF3DA1', '#FFFFFF'] })
}
