'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { keccak256, toHex, parseEventLogs } from 'viem'
import { useAccount, useReadContract, useWriteContract, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'
import { TEMPLATES, type TemplateKey } from '@/lib/templates'
import { PREDICT_MARKET_CONTRACT, predictMarketAbi } from '@/lib/predict/contracts'
import { backBtnStyle, ctaStyle, inputStyle, friendlyTxError, categoryLabel } from '@/components/predict/ui'

const TEMPLATE_ORDER: TemplateKey[] = [
  'crypto_price_above',
  'crypto_price_below',
  'sports_winner',
  'sports_score',
  'youtube_views',
  'youtube_subs',
]

// Fields the market form does not collect: 1v1-only picks and the fixed over/under
// direction (a market covers both sides), plus resolveAt which is its own control.
const SKIP_FIELDS = new Set(['pickedTeam', 'creatorOutcome', 'direction', 'resolveAt'])

function asUTC(datetimeLocal: string): Date {
  return new Date(datetimeLocal + ':00Z')
}

function categoryFor(key: TemplateKey): string {
  if (key.startsWith('crypto_price')) return 'crypto'
  if (key.startsWith('sports')) return 'sports'
  return 'youtube'
}

// Outcome slot labels, index-aligned with the engines (0 = Yes/Home/Over).
function deriveOutcomes(key: TemplateKey, p: Record<string, string>): string[] {
  if (key === 'sports_winner') return [p.homeTeam || 'Home', p.awayTeam || 'Away', 'Draw']
  if (key === 'sports_score') return ['Over', 'Under']
  return ['Yes', 'No']
}

// Human-readable market question. The engines resolve from params, not this text,
// so phrasing is display-only (tamper-proofed by its keccak256 hash).
function marketDefinition(key: TemplateKey, p: Record<string, string>): string {
  const coin = p.coinName || p.coin || 'the coin'
  const home = p.homeTeam || 'Home'
  const away = p.awayTeam || 'Away'
  switch (key) {
    case 'crypto_price_above': return `Will ${coin} be ABOVE $${p.target} at ${p.resolveAt} UTC? (CoinGecko)`
    case 'crypto_price_below': return `Will ${coin} be BELOW $${p.target} at ${p.resolveAt} UTC? (CoinGecko)`
    case 'sports_winner':      return `${home} vs ${away}: who wins? (${p.sport || 'sports'} fixture ${p.fixtureId})`
    case 'sports_score':       return `${home} vs ${away}: total ${p.sport === 'basketball' ? 'points' : 'goals'} over or under ${p.target}?`
    case 'youtube_views':      return `Will YouTube video ${p.videoId} reach ${p.target} views by ${p.resolveAt} UTC?`
    case 'youtube_subs':       return `Will YouTube channel ${p.channelId} reach ${p.target} subscribers by ${p.resolveAt} UTC?`
    default:                   return 'Prediction market'
  }
}

export default function NewMarketPage() {
  const router = useRouter()
  const { address, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [key, setKey] = useState<TemplateKey | null>(null)
  const [params, setParams] = useState<Record<string, string>>({})
  const [resolveAt, setResolveAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { data: owner } = useReadContract({
    address: PREDICT_MARKET_CONTRACT,
    abi: predictMarketAbi,
    functionName: 'owner',
  })
  const isOwner = Boolean(address && owner && address.toLowerCase() === (owner as string).toLowerCase())

  async function handleCreate() {
    if (!key || !address || !publicClient) return
    setError('')

    if (!resolveAt) {
      setError('Set a resolve date and time.')
      return
    }
    const resolveMs = asUTC(resolveAt).getTime()
    if (isNaN(resolveMs) || resolveMs <= Date.now()) {
      setError('Resolve time must be in the future.')
      return
    }

    const fullParams = { ...params, resolveAt }
    const outcomes = deriveOutcomes(key, fullParams)
    const definitionText = marketDefinition(key, fullParams)
    const definitionHash = keccak256(toHex(definitionText))
    const resolveAtTs = BigInt(Math.floor(resolveMs / 1000))

    try {
      setBusy(true)
      const hash = await writeContractAsync({
        address: PREDICT_MARKET_CONTRACT,
        abi: predictMarketAbi,
        functionName: 'createMarket',
        args: [definitionHash, resolveAtTs, outcomes.length],
      })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      const [log] = parseEventLogs({ abi: predictMarketAbi, eventName: 'MarketCreated', logs: receipt.logs })
      const marketId = log.args.id.toString()

      const res = await fetch('/api/markets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          on_chain_id: marketId,
          category: categoryFor(key),
          template_key: key,
          params: fullParams,
          outcomes,
          definition_text: definitionText,
          definition_hash: definitionHash,
          resolve_at: asUTC(resolveAt).toISOString(),
        }),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setError(`Market created on-chain (ID ${marketId}) but saving to the app failed: ${body.error ?? 'database error'}. Market ID: ${marketId}`)
        setBusy(false)
        return
      }

      router.push(`/predict/${marketId}`)
    } catch (e) {
      setError(friendlyTxError(e))
      setBusy(false)
    }
  }

  if (!isConnected) {
    return (
      <>
        <AppNav />
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 20, padding: '0 24px' }}>
          <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to create a market.</p>
          <ConnectButton />
        </main>
      </>
    )
  }

  if (!isOwner) {
    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Back to markets</Link>
          <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 28 }}>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800, margin: '0 0 10px' }}>Owner only</h1>
            <p style={{ color: 'var(--color-pop-muted)', margin: 0, lineHeight: 1.6 }}>
              Markets are curated. Only the market owner wallet can create them. Anyone can deposit into an open market.
            </p>
          </div>
        </main>
      </>
    )
  }

  const template = key ? TEMPLATES[key] : null
  const fields = template ? template.fields.filter((f) => !SKIP_FIELDS.has(f.name)) : []

  return (
    <>
      <AppNav />
      <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
        <Link href="/predict" style={{ ...backBtnStyle, display: 'inline-block', textDecoration: 'none' }}>← Back to markets</Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, margin: '0 0 24px' }}>New market</h1>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Template</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 8 }}>
            {TEMPLATE_ORDER.map((k) => {
              const active = key === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setKey(k); setParams({}) }}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-input)',
                    border: '1px solid',
                    borderColor: active ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                    background: active ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                    color: active ? 'var(--color-pop-accent)' : 'var(--color-pop-text)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--color-pop-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>
                    {categoryLabel(categoryFor(k))}
                  </span>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{TEMPLATES[k].title}</span>
                </button>
              )
            })}
          </div>
        </div>

        {template && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {fields.map((field) => (
              <label key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>{field.label}</span>
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  placeholder={field.placeholder}
                  value={params[field.name] ?? ''}
                  onChange={(e) => setParams((v) => ({ ...v, [field.name]: e.target.value }))}
                  style={inputStyle}
                />
              </label>
            ))}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Resolve date/time (UTC)</span>
              <input type="datetime-local" value={resolveAt} onChange={(e) => setResolveAt(e.target.value)} style={inputStyle} />
            </label>

            <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 16 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-pop-muted)' }}>Outcomes</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {deriveOutcomes(key!, { ...params, resolveAt }).map((o, i) => (
                  <span key={i} style={{ fontSize: '0.85rem', color: 'var(--color-pop-text)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-pill)', padding: '3px 12px' }}>
                    {o}
                  </span>
                ))}
              </div>
            </div>

            {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>}

            <button onClick={handleCreate} disabled={busy} style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
              {busy ? 'Creating…' : 'Create market'}
            </button>
          </div>
        )}
      </main>
    </>
  )
}
