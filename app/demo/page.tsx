'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { keccak256, toHex, parseUnits } from 'viem'
import { useAccount, useWriteContract } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { publicClient } from '@/lib/arc'
import { POP_CONTRACT, USDC, erc20Abi, popAbi } from '@/lib/contracts'
import { TEMPLATES, type TemplateKey } from '@/lib/templates'

type Side = 'creator' | 'opponent'

const DEMO_TEMPLATES: TemplateKey[] = ['crypto_price_above', 'crypto_price_below', 'youtube_views']
const DEFAULT_STAKE = '1' // 1 USDC

export default function DemoPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const { writeContractAsync } = useWriteContract()

  const [selectedKey, setSelectedKey] = useState<TemplateKey>('crypto_price_above')
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [userSide, setUserSide] = useState<Side>('creator')
  const [status, setStatus] = useState<'idle' | 'approving' | 'creating' | 'done'>('idle')
  const [error, setError] = useState('')

  if (!isConnected) {
    return (
      <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24, padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 400 }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Try a demo bet</h1>
          <p style={{ color: 'var(--color-pop-muted)', marginBottom: 24 }}>
            Pick a side. The house takes the other. Resolved by the same agent — no house edge.
          </p>
          <ConnectButton />
        </div>
      </main>
    )
  }

  const template = TEMPLATES[selectedKey]
  const fields = template.fields.filter(f => f.name !== 'resolveAt')

  async function handleDemo() {
    if (!address) return
    setError('')

    const resolveAtDate = formValues.resolveAt
    if (!resolveAtDate) { setError('Set a resolve date.'); return }

    const resolveAtTs = BigInt(Math.floor(new Date(resolveAtDate).getTime() / 1000))
    const joinDeadlineTs = resolveAtTs - 300n // 5 min before resolveAt
    const stakeRaw = parseUnits(DEFAULT_STAKE, 6)
    const definitionText = template.definition({ ...formValues })
    const definitionHash = keccak256(toHex(definitionText))

    // House address comes from the server (HOUSE_PRIVATE_KEY)
    const houseRes = await fetch('/api/demo/house-address')
    if (!houseRes.ok) { setError('House unavailable.'); return }
    const { address: houseAddress } = await houseRes.json() as { address: `0x${string}` }

    const creator = userSide === 'creator' ? address : houseAddress
    const opponent = userSide === 'creator' ? houseAddress : address

    try {
      setStatus('approving')
      const approveHash = await writeContractAsync({
        address: USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [POP_CONTRACT, stakeRaw],
      })
      await publicClient.waitForTransactionReceipt({ hash: approveHash })

      setStatus('creating')

      // If user is opponent, house creates first; for simplicity user always creates here
      // and house auto-accepts via the server
      const createHash = await writeContractAsync({
        address: POP_CONTRACT,
        abi: popAbi,
        functionName: 'createBet',
        args: [opponent, stakeRaw as unknown as bigint, definitionHash, joinDeadlineTs, resolveAtTs],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash })

      // Extract bet ID from BetCreated event
      const betId = extractBetId(receipt.logs)

      // Ask server to have house accept the bet
      await fetch('/api/demo/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ betId: betId?.toString(), definitionText, definitionHash, templateKey: selectedKey, params: formValues, resolveAt: new Date(resolveAtDate).toISOString(), creator, opponent }),
      })

      setStatus('done')
      if (betId !== null) router.push(`/bet/${betId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Transaction failed.')
      setStatus('idle')
    }
  }

  const busy = status !== 'idle' && status !== 'done'

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ background: 'rgba(215,255,30,0.1)', color: 'var(--color-pop-accent)', fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)', letterSpacing: '0.05em' }}>
          DEMO
        </span>
      </div>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>Try it out</h1>
      <p style={{ color: 'var(--color-pop-muted)', marginBottom: 32, fontSize: '0.9375rem' }}>
        The house takes the other side. Stake: <strong style={{ color: 'var(--color-pop-text)' }}>1 USDC</strong>. Resolved by the same agent — no house edge.
      </p>

      {/* Template picker */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {DEMO_TEMPLATES.map(key => (
          <button
            key={key}
            onClick={() => { setSelectedKey(key); setFormValues({}) }}
            style={{
              background: selectedKey === key ? 'var(--color-pop-accent)' : 'var(--color-pop-surface)',
              color: selectedKey === key ? '#0B0B0F' : 'var(--color-pop-muted)',
              border: `1px solid ${selectedKey === key ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)'}`,
              borderRadius: 'var(--radius-pill)',
              padding: '7px 16px',
              fontWeight: 600,
              fontSize: '0.8125rem',
              cursor: 'pointer',
            }}
          >
            {TEMPLATES[key].title}
          </button>
        ))}
      </div>

      {/* Side picker */}
      <div style={{ marginBottom: 24 }}>
        <p style={{ fontSize: '0.875rem', color: 'var(--color-pop-muted)', marginBottom: 10 }}>Pick your side:</p>
        <div style={{ display: 'flex', gap: 10 }}>
          {(['creator', 'opponent'] as Side[]).map(side => (
            <button
              key={side}
              onClick={() => setUserSide(side)}
              style={{
                flex: 1,
                padding: '12px 0',
                borderRadius: 'var(--radius-card)',
                border: `2px solid ${userSide === side ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)'}`,
                background: userSide === side ? 'rgba(215,255,30,0.07)' : 'var(--color-pop-surface)',
                color: userSide === side ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                fontWeight: 700,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {side === 'creator' ? '✅ It will happen' : '❌ It won\'t happen'}
            </button>
          ))}
        </div>
      </div>

      {/* Template fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
        {fields.map(field => (
          <label key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>{field.label}</span>
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              placeholder={field.placeholder}
              value={formValues[field.name] ?? ''}
              onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))}
              style={inputStyle}
            />
          </label>
        ))}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Resolve date/time (UTC)</span>
          <input
            type="datetime-local"
            value={formValues.resolveAt ?? ''}
            onChange={e => setFormValues(v => ({ ...v, resolveAt: e.target.value }))}
            style={inputStyle}
          />
        </label>
      </div>

      {/* Source attribution */}
      <p style={{ fontSize: '0.75rem', color: 'var(--color-pop-muted)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
        Resolved by: {template.boundSource}
      </p>

      {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', marginBottom: 12 }}>{error}</p>}

      {busy && (
        <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
          {status === 'approving' && 'Approving USDC…'}
          {status === 'creating' && 'Creating bet on-chain…'}
        </p>
      )}

      <button onClick={handleDemo} disabled={busy} style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
        {busy ? 'Processing…' : 'Start demo bet →'}
      </button>
    </main>
  )
}

function extractBetId(logs: readonly { topics: readonly string[] }[]): bigint | null {
  for (const log of logs) {
    if (log.topics[1]) {
      try { return BigInt(log.topics[1]) } catch { /* skip */ }
    }
  }
  return null
}

const inputStyle: React.CSSProperties = {
  background: 'var(--color-pop-surface)',
  border: '1px solid var(--color-pop-surface-2)',
  borderRadius: 'var(--radius-input)',
  color: 'var(--color-pop-text)',
  padding: '10px 14px',
  fontSize: '0.9375rem',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const ctaStyle: React.CSSProperties = {
  background: 'var(--color-pop-accent)',
  color: '#0B0B0F',
  fontWeight: 700,
  fontSize: '1rem',
  padding: '14px 0',
  borderRadius: 'var(--radius-cta)',
  border: 'none',
  width: '100%',
}
