'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { motion } from 'framer-motion'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { keccak256, toHex, parseUnits, getAddress, parseEventLogs } from 'viem'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { TEMPLATES, type TemplateKey } from '@/lib/templates'
import { POP_CONTRACT, USDC, erc20Abi, popAbi } from '@/lib/contracts'
import type { InviteRow } from '@/lib/db.types'
import { AppNav } from '@/components/AppNav'

type Step = 'template' | 'form' | 'confirm' | 'confirm-open' | 'invite-link' | 'approving' | 'creating' | 'done'

const TEMPLATE_LIST = Object.values(TEMPLATES)

// ─── Tx error helper ─────────────────────────────────────────────────────────

function friendlyTxError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('timeout') || msg.includes('network')) {
    return 'Network error: could not reach the chain. Check your connection and try again.'
  }
  if (msg.toLowerCase().includes('user rejected') || msg.includes('4001')) {
    return 'Transaction cancelled.'
  }
  if (msg.includes('insufficient funds') || msg.includes('exceeds balance')) {
    return 'Insufficient USDC balance.'
  }
  if (msg.includes('allowance') || msg.includes('ERC20')) {
    return 'USDC approval failed. Please try again.'
  }
  return msg
}

// ─── Coin search autocomplete ────────────────────────────────────────────────

interface CoinResult { id: string; name: string; symbol: string; market_cap_rank: number | null }

function CoinSearchInput({
  value,
  displayValue,
  onChange,
}: {
  value: string
  displayValue: string
  onChange: (id: string, display: string) => void
}) {
  const [query, setQuery] = useState(displayValue || value)
  const [results, setResults] = useState<CoinResult[]>([])
  const [open, setOpen] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`)
        const data = await res.json() as { coins: CoinResult[] }
        setResults((data.coins ?? []).slice(0, 8))
      } catch { setResults([]) }
    }, 300)
  }

  function select(coin: CoinResult) {
    const display = `${coin.name} (${coin.symbol.toUpperCase()})`
    setQuery(display)
    setOpen(false)
    setResults([])
    onChange(coin.id, display)
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder="Search coin… e.g. Bitcoin"
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        style={inputStyle}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)', marginTop: 4, overflow: 'hidden',
        }}>
          {results.map(coin => (
            <button
              key={coin.id}
              type="button"
              onMouseDown={() => select(coin)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                color: 'var(--color-pop-text)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-pop-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontWeight: 600 }}>{coin.name} <span style={{ color: 'var(--color-pop-muted)', fontWeight: 400 }}>({coin.symbol.toUpperCase()})</span></span>
              {coin.market_cap_rank && (
                <span style={{ fontSize: '0.75rem', color: 'var(--color-pop-muted)', fontFamily: 'var(--font-mono)' }}>#{coin.market_cap_rank}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Live price chip ─────────────────────────────────────────────────────────

function LivePriceChip({ coinId }: { coinId: string }) {
  const [price, setPrice] = useState<number | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!coinId) return
    setStatus('loading')
    setPrice(null)
    setFetchedAt(null)

    async function fetchPrice() {
      try {
        const res = await fetch(`/api/crypto/price?coin=${encodeURIComponent(coinId)}`)
        const data = await res.json() as { price?: number; fetchedAt?: string; error?: string }
        if (data.price != null) {
          setPrice(data.price)
          setFetchedAt(data.fetchedAt ?? null)
          setStatus('ok')
        } else {
          setStatus('error')
        }
      } catch {
        setStatus('error')
      }
    }

    void fetchPrice()
    const interval = setInterval(() => { void fetchPrice() }, 30_000)
    return () => clearInterval(interval)
  }, [coinId])

  if (!coinId) return null

  const dotColor = status === 'ok'
    ? 'var(--color-pop-win)'
    : status === 'error'
      ? 'var(--color-pop-danger)'
      : 'var(--color-pop-muted)'

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      marginTop: 8,
      padding: '6px 12px',
      background: 'var(--color-pop-surface)',
      border: '1px solid var(--color-pop-surface-2)',
      borderRadius: 'var(--radius-pill)',
      fontSize: '0.8125rem',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      {status === 'loading' && (
        <span style={{ color: 'var(--color-pop-muted)' }}>Fetching price…</span>
      )}
      {status === 'ok' && price != null && (
        <>
          <span style={{ color: 'var(--color-pop-muted)' }}>Current price:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-pop-text)' }}>
            ${price.toLocaleString('en-US', {
              minimumFractionDigits: 2,
              maximumFractionDigits: price >= 1 ? 2 : 6,
            })}
          </span>
          {fetchedAt && (
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.7rem' }}>
              as of {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </>
      )}
      {status === 'error' && (
        <span style={{ color: 'var(--color-pop-muted)' }}>Price unavailable</span>
      )}
    </div>
  )
}

// ─── Match search ────────────────────────────────────────────────────────────

interface SportFixture { id: string; homeTeam: string; awayTeam: string; league: string; date: string }

// Parse a datetime-local input value ("YYYY-MM-DDTHH:MM") as UTC.
// HTML datetime-local inputs have no timezone — appending :00Z makes JS treat the value
// as UTC instead of local time, which is what we want since all inputs are labelled UTC.
function asUTC(datetimeLocal: string): Date {
  return new Date(datetimeLocal + ':00Z')
}

function MatchSearchInput({
  sport,
  homeTeam,
  awayTeam,
  onChange,
}: {
  sport: string
  homeTeam: string
  awayTeam: string
  onChange: (fixture: SportFixture) => void
}) {
  const [query, setQuery] = useState(homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : '')
  const [results, setResults] = useState<SportFixture[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const latestQuery = useRef('')

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleInput(q: string) {
    setQuery(q)
    setOpen(true)
    setSearched(false)
    setApiError(null)
    setResults([])
    setSelectedDate(null)
    latestQuery.current = q
    if (timer.current) clearTimeout(timer.current)
    if (q.length < 3) { return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sports/search?query=${encodeURIComponent(q)}&sport=${encodeURIComponent(sport)}`)
        const data = await res.json() as { fixtures: SportFixture[]; error?: string }
        // Ignore responses for queries the user has since changed away from.
        if (latestQuery.current !== q) return
        setResults(data.fixtures ?? [])
        if (data.error) setApiError(data.error)
      } catch {
        if (latestQuery.current !== q) return
        setResults([])
        setApiError('Search request failed, check your connection')
      } finally {
        if (latestQuery.current === q) {
          setLoading(false)
          setSearched(true)
        }
      }
    }, 400)
  }

  function select(fixture: SportFixture) {
    setQuery(`${fixture.homeTeam} vs ${fixture.awayTeam}`)
    setSelectedDate(fixture.date)
    setOpen(false)
    setResults([])
    setSearched(false)
    onChange(fixture)
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      })
    } catch { return dateStr }
  }

  const showDropdown = open && query.length >= 3 && (loading || searched)

  function formatMatchDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
      })
    } catch { return dateStr }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={`e.g. ${sport === 'basketball' ? 'Los Angeles Lakers' : 'Manchester United, Real Madrid, Mexico'}`}
        value={query}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => query.length >= 3 && searched && setOpen(true)}
        style={inputStyle}
      />
      {selectedDate && !open && (
        <p style={{
          margin: '6px 0 0 2px',
          fontSize: '0.78rem',
          color: 'var(--color-pop-muted)',
          letterSpacing: '0.01em',
        }}>
          Match date: {formatMatchDate(selectedDate)}
        </p>
      )}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)', marginTop: 4, overflow: 'hidden',
        }}>
          {loading && (
            <div style={{ padding: '10px 14px', color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Searching…</div>
          )}
          {!loading && results.map(f => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => select(f)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--color-pop-surface-2)',
                cursor: 'pointer', color: 'var(--color-pop-text)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-pop-surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                {f.homeTeam} <span style={{ color: 'var(--color-pop-muted)', fontWeight: 400 }}>vs</span> {f.awayTeam}
              </div>
              <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem' }}>
                {f.league} · {formatDate(f.date)}
              </div>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
              <span style={{ color: apiError ? '#f87171' : 'var(--color-pop-muted)' }}>
                {apiError ?? 'No upcoming fixtures found for this team'}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Template picker icons ───────────────────────────────────────────────────

function TrendingUpIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

function TrendingDownIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  )
}

function TrophyIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" />
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
  )
}

function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="20" x2="12" y2="10" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="6" y1="20" x2="6" y2="16" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  )
}

function UsersIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

// ─── Template picker data ─────────────────────────────────────────────────────

const PICK_ORDER: TemplateKey[] = [
  'crypto_price_above',
  'crypto_price_below',
  'sports_winner',
  'sports_score',
  'youtube_views',
  'youtube_subs',
]

const CARD_META: Record<TemplateKey, { icon: React.ReactNode; examples: string }> = {
  crypto_price_above: { icon: <TrendingUpIcon />,   examples: 'BTC → $90,000 · ETH → $7,000' },
  crypto_price_below: { icon: <TrendingDownIcon />, examples: 'SOL → $100 · BNB → $500' },
  sports_winner:      { icon: <TrophyIcon />,       examples: 'UFC · NFL · Football' },
  sports_score:       { icon: <BarChartIcon />,     examples: 'NBA · EPL · F1' },
  youtube_views:      { icon: <PlayIcon />,         examples: '100K · 1M views' },
  youtube_subs:       { icon: <UsersIcon />,        examples: '100K · 1M subscribers' },
}

const TRUST_ITEMS = ['Decentralised settlement', 'Transparent outcomes', 'On-chain escrow', 'Fast payouts']

interface TemplateCardProps {
  template: typeof TEMPLATES[TemplateKey]
  meta: { icon: React.ReactNode; examples: string }
  index: number
  onSelect: () => void
}

function TemplateCard({ template, meta, index, onSelect }: TemplateCardProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -6, transition: { duration: 0.3, ease: [0.2, 0.8, 0.2, 1] } }}
      onClick={onSelect}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'rgba(198,255,0,0.35)'
        e.currentTarget.style.boxShadow = '0 24px 64px rgba(0,0,0,0.55), 0 0 48px rgba(198,255,0,0.07)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.boxShadow = '0 20px 60px rgba(0,0,0,0.4)'
      }}
      style={{
        background: 'rgba(14,16,25,0.6)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        padding: '28px 28px 24px',
        textAlign: 'left',
        cursor: 'pointer',
        minHeight: 230,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
      }}
    >
      <div style={{
        width: 46, height: 46, borderRadius: 12, marginBottom: 20,
        background: 'rgba(198,255,0,0.09)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#C6FF00', flexShrink: 0,
      }}>
        {meta.icon}
      </div>

      <div style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '1.125rem', marginBottom: 10, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
        {template.title}
      </div>

      <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: '0.875rem', lineHeight: 1.55, flex: 1, marginBottom: 20 }}>
        {template.description}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.78rem', letterSpacing: '0.01em' }}>
          {meta.examples}
        </span>
        <span style={{ color: '#C6FF00', fontSize: '1.125rem', fontWeight: 600, lineHeight: 1 }}>→</span>
      </div>
    </motion.button>
  )
}

// ─── Main page ───────────────────────────────────────────────────────────────

function NewBetInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()

  const [step, setStep] = useState<Step>('template')
  const [selectedKey, setSelectedKey] = useState<TemplateKey | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [opponent, setOpponent] = useState('')
  const [stakeUsdc, setStakeUsdc] = useState('')
  const [joinDeadlineDate, setJoinDeadlineDate] = useState('')
  const [error, setError] = useState('')
  const [inviteId, setInviteId] = useState('')
  const [copied, setCopied] = useState(false)
  const [betType, setBetType] = useState<'private' | 'open'>('private')
  const [claimDeadlineDate, setClaimDeadlineDate] = useState('')

  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient()
  const [approveTxHash, setApproveTxHash] = useState<`0x${string}` | undefined>()
  const [createTxHash, setCreateTxHash] = useState<`0x${string}` | undefined>()
  const { isLoading: approveLoading } = useWaitForTransactionReceipt({ hash: approveTxHash })
  const { isLoading: createLoading } = useWaitForTransactionReceipt({ hash: createTxHash })

  // Pre-fill from invite link (?invite=uuid)
  useEffect(() => {
    const inviteCode = searchParams.get('invite')
    if (!inviteCode) return
    fetch(`/api/invites/${inviteCode}`)
      .then(r => r.json())
      .then((inv: InviteRow) => {
        setSelectedKey(inv.template_key as TemplateKey)
        setFormValues(inv.params)
        setOpponent(inv.pending_opponent ?? '')
        setStakeUsdc((parseFloat((BigInt(inv.stake) / 1000000n).toString())).toString())
        setJoinDeadlineDate(new Date(inv.join_deadline).toISOString().slice(0, 16))
        setStep('confirm')
      })
      .catch(() => {})
  }, [searchParams])

  if (!isConnected) {
    return (
      <>
        <AppNav />
        <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 20, padding: '0 24px' }}>
          <Link
            href="/"
            style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', textDecoration: 'none', alignSelf: 'flex-start', maxWidth: 560, width: '100%', marginBottom: 8 }}
          >
            ← Back
          </Link>
          <p style={{ color: 'var(--color-pop-muted)', margin: 0 }}>Connect your wallet to create a bet.</p>
          <ConnectButton />
        </main>
      </>
    )
  }

  const template = selectedKey ? TEMPLATES[selectedKey] : null

  async function handlePreview() {
    setError('')
    if (!template) return

    if (betType === 'open') {
      if (!claimDeadlineDate || !formValues.resolveAt) {
        setError('Claim deadline and resolve date are required.')
        return
      }
      if (!stakeUsdc || parseFloat(stakeUsdc) <= 0) {
        setError('Invalid stake amount.')
        return
      }
      const claimDeadlineTs = asUTC(claimDeadlineDate).getTime()
      const resolveAtTs = asUTC(formValues.resolveAt).getTime()
      const isSportsBet = selectedKey === 'sports_winner' || selectedKey === 'sports_score'
      const minGapMs = isSportsBet ? 2 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      const minGapLabel = isSportsBet ? '2 hours' : '24 hours'
      if (resolveAtTs - claimDeadlineTs < minGapMs) {
        setError(`Claim deadline must be at least ${minGapLabel} before resolve date.`)
        return
      }
      setStep('confirm-open')
      return
    }

    // Validate dates & stake before deciding path
    if (!joinDeadlineDate || !formValues.resolveAt) {
      setError('Join deadline and resolve date are required.')
      return
    }
    if (!stakeUsdc || parseFloat(stakeUsdc) <= 0) {
      setError('Invalid stake amount.')
      return
    }

    const joinDeadlineTs = asUTC(joinDeadlineDate).getTime()
    const resolveAtTs = asUTC(formValues.resolveAt).getTime()
    if (resolveAtTs <= joinDeadlineTs) {
      setError('Resolve date must be after join deadline.')
      return
    }

    // No opponent → create invite link
    if (!opponent.trim()) {
      if (!address) return
      let stakeRaw: bigint
      try {
        stakeRaw = parseUnits(stakeUsdc, 6)
      } catch {
        setError('Invalid stake amount.')
        return
      }
      const definitionText = template.definition({ ...formValues })
      const definitionHash = keccak256(toHex(definitionText))

      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creator: address,
          template_key: selectedKey,
          params: formValues,
          definition_text: definitionText,
          definition_hash: definitionHash,
          resolve_at: asUTC(formValues.resolveAt).toISOString(),
          join_deadline: asUTC(joinDeadlineDate).toISOString(),
          stake: stakeRaw.toString(),
        }),
      })
      const body = await res.json() as { id?: string; error?: string; detail?: string }
      if (!res.ok) { setError(body.detail ?? body.error ?? 'Failed to create invite.'); return }
      setInviteId(body.id ?? '')
      setStep('invite-link')
      return
    }

    setStep('confirm')
  }

  async function handleCreate() {
    if (!template || !address) return
    setError('')

    let opponentAddress: `0x${string}`
    try {
      opponentAddress = getAddress(opponent) as `0x${string}`
    } catch {
      setError('Invalid opponent address.')
      return
    }

    let stakeRaw: bigint
    try {
      stakeRaw = parseUnits(stakeUsdc, 6)
      if (stakeRaw <= 0n) throw new Error()
    } catch {
      setError('Invalid stake amount.')
      return
    }

    if (!joinDeadlineDate || !formValues.resolveAt) {
      setError('Join deadline and resolve date are required.')
      return
    }

    const joinDeadlineTs = BigInt(Math.floor(asUTC(joinDeadlineDate).getTime() / 1000))
    const resolveAtTs = BigInt(Math.floor(asUTC(formValues.resolveAt).getTime() / 1000))

    if (resolveAtTs <= joinDeadlineTs) {
      setError('Resolve date must be after join deadline.')
      return
    }

    const definitionText = template.definition({ ...formValues })
    const definitionHash = keccak256(toHex(definitionText))

    try {
      setStep('approving')
      const approveHash = await writeContractAsync({
        address: USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [POP_CONTRACT, stakeRaw],
      })
      setApproveTxHash(approveHash)

      // Wait for approval to be mined before createBet — the contract calls
      // transferFrom which requires the allowance to be confirmed on-chain.
      await publicClient!.waitForTransactionReceipt({ hash: approveHash })

      setStep('creating')
      const createHash = await writeContractAsync({
        address: POP_CONTRACT,
        abi: popAbi,
        functionName: 'createBet',
        args: [opponentAddress, stakeRaw as unknown as bigint, definitionHash, joinDeadlineTs, resolveAtTs],
      })
      setCreateTxHash(createHash)

      const createReceipt = await publicClient!.waitForTransactionReceipt({ hash: createHash })

      // Extract the sequential numeric bet ID from the BetCreated event log.
      // The contract returns uint256 id (1, 2, 3…) — NOT the tx hash.
      const [betCreatedLog] = parseEventLogs({ abi: popAbi, eventName: 'BetCreated', logs: createReceipt.logs })
      const betId = betCreatedLog.args.id.toString()

      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          on_chain_id: betId,
          creator: address,
          opponent: opponentAddress,
          stake: stakeRaw.toString(),
          definition_text: definitionText,
          definition_hash: definitionHash,
          template_key: selectedKey,
          params: formValues,
          resolve_at: asUTC(formValues.resolveAt).toISOString(),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const dbError = (body as { error?: string }).error ?? 'database error'
        setError(
          `Bet created on-chain (ID: ${betId}) but failed to save to the app database: ${dbError}. ` +
          `Your USDC is safe in the contract. Save your bet ID: ${betId}`
        )
        setStep('confirm')
        return
      }

      setStep('done')
      router.push(`/bet/${betId}`)
    } catch (e) {
      setError(friendlyTxError(e))
      setStep('confirm')
    }
  }

  async function handleCreateOpen() {
    if (!template || !address) return
    setError('')

    let stakeRaw: bigint
    try {
      stakeRaw = parseUnits(stakeUsdc, 6)
      if (stakeRaw <= 0n) throw new Error()
    } catch {
      setError('Invalid stake amount.')
      return
    }

    if (!claimDeadlineDate || !formValues.resolveAt) {
      setError('Claim deadline and resolve date are required.')
      return
    }

    const claimDeadlineTs = BigInt(Math.floor(asUTC(claimDeadlineDate).getTime() / 1000))
    const resolveAtTs = BigInt(Math.floor(asUTC(formValues.resolveAt).getTime() / 1000))

    const isSportsBetFinal = selectedKey === 'sports_winner' || selectedKey === 'sports_score'
    const minGapSecs = BigInt(isSportsBetFinal ? 2 * 60 * 60 : 24 * 60 * 60)
    const minGapLabelFinal = isSportsBetFinal ? '2 hours' : '24 hours'
    if (resolveAtTs - claimDeadlineTs < minGapSecs) {
      setError(`Claim deadline must be at least ${minGapLabelFinal} before resolve date.`)
      return
    }

    const definitionText = template.definition({ ...formValues })
    const definitionHash = keccak256(toHex(definitionText))

    try {
      setStep('approving')
      const approveHash = await writeContractAsync({
        address: USDC,
        abi: erc20Abi,
        functionName: 'approve',
        args: [POP_CONTRACT, stakeRaw],
      })
      setApproveTxHash(approveHash)

      await publicClient!.waitForTransactionReceipt({ hash: approveHash })

      setStep('creating')
      const createHash = await writeContractAsync({
        address: POP_CONTRACT,
        abi: popAbi,
        functionName: 'createOpenBet',
        args: [stakeRaw as unknown as bigint, definitionHash, claimDeadlineTs, resolveAtTs],
      })
      setCreateTxHash(createHash)

      const createReceipt = await publicClient!.waitForTransactionReceipt({ hash: createHash })

      const [openBetLog] = parseEventLogs({ abi: popAbi, eventName: 'OpenBetPosted', logs: createReceipt.logs })
      const betId = openBetLog.args.id.toString()

      const res = await fetch('/api/bets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          on_chain_id: betId,
          creator: address,
          opponent: '',
          stake: stakeRaw.toString(),
          definition_text: definitionText,
          definition_hash: definitionHash,
          template_key: selectedKey,
          params: formValues,
          resolve_at: asUTC(formValues.resolveAt).toISOString(),
          claim_deadline: asUTC(claimDeadlineDate).toISOString(),
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const dbError = (body as { error?: string }).error ?? 'database error'
        setError(
          `Bet created on-chain (ID: ${betId}) but failed to save to the app database: ${dbError}. ` +
          `Your USDC is safe in the contract. Save your bet ID: ${betId}`
        )
        setStep('confirm-open')
        return
      }

      setStep('done')
      router.push(`/bet/${betId}`)
    } catch (e) {
      setError(friendlyTxError(e))
      setStep('confirm-open')
    }
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(`${window.location.origin}/invite/${inviteId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Template picker ──────────────────────────────────────────────────────
  if (step === 'template') {
    return (
      <>
        <AppNav />
        <div style={{ position: 'relative', background: '#06070B', minHeight: 'calc(100vh - 72px)', overflow: 'hidden' }}>
          {/* Atmospheric background glows */}
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 65% 55% at 80% -5%, rgba(198,255,0,0.07) 0%, transparent 100%)',
          }} />
          <div aria-hidden style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 45% 40% at 15% 110%, rgba(198,255,0,0.04) 0%, transparent 100%)',
          }} />

          <main style={{ position: 'relative', zIndex: 1, maxWidth: 1200, margin: '0 auto', padding: '52px 32px 96px' }}>

            <Link href="/" style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              color: 'rgba(255,255,255,0.38)', fontSize: '0.875rem',
              textDecoration: 'none', marginBottom: 60, letterSpacing: '0.01em',
            }}>
              ← Back
            </Link>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              style={{ marginBottom: 56 }}
            >
              <h1 style={{
                fontFamily: 'var(--font-heading)',
                fontSize: 'clamp(2.75rem, 5.5vw, 4.5rem)',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-0.025em',
                margin: '0 0 14px',
                lineHeight: 1,
              }}>
                NEW BET
              </h1>
              <div style={{ width: 52, height: 3, background: '#C6FF00', borderRadius: 99, marginBottom: 18 }} />
              <p style={{
                color: 'rgba(255,255,255,0.48)',
                fontSize: '1.125rem',
                fontWeight: 400,
                margin: 0,
                letterSpacing: '0.01em',
              }}>
                What are you betting on today?
              </p>
            </motion.div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 20,
              marginBottom: 52,
            }}>
              {PICK_ORDER.map((key, i) => (
                <TemplateCard
                  key={key}
                  template={TEMPLATES[key]}
                  meta={CARD_META[key]}
                  index={i}
                  onSelect={() => { setSelectedKey(key); setStep('form') }}
                />
              ))}
            </div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.52, duration: 0.5 }}
              style={{ display: 'flex', gap: 32, justifyContent: 'center', flexWrap: 'wrap' }}
            >
              {TRUST_ITEMS.map(label => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'rgba(255,255,255,0.26)', fontSize: '0.8rem', letterSpacing: '0.025em' }}>
                  <span style={{ color: '#C6FF00', fontWeight: 700, fontSize: '0.7rem' }}>✓</span>
                  {label}
                </div>
              ))}
            </motion.div>

          </main>
        </div>
      </>
    )
  }

  // ── Form ─────────────────────────────────────────────────────────────────
  if (step === 'form' && template) {
    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          <button onClick={() => setStep('template')} style={backBtnStyle}>← Back</button>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 32 }}>
            {template.title}
          </h1>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {template.fields
              .filter(f => f.name !== 'resolveAt' && f.name !== 'homeTeam' && f.name !== 'awayTeam')
              .map((field) => (
                <div key={field.name} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>{field.label}</span>

                  {field.name === 'coin' ? (
                    <>
                      <CoinSearchInput
                        value={formValues.coin ?? ''}
                        displayValue={formValues.coinName ?? ''}
                        onChange={(id, display) => setFormValues(v => ({ ...v, coin: id, coinName: display }))}
                      />
                      <LivePriceChip coinId={formValues.coin ?? ''} />
                    </>
                  ) : field.name === 'sport' ? (
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['football', 'basketball'].map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFormValues(v => ({ ...v, sport: s, fixtureId: '', homeTeam: '', awayTeam: '', pickedTeam: '' }))}
                          style={{
                            flex: 1, padding: '10px 0', borderRadius: 'var(--radius-input)',
                            border: '1px solid',
                            borderColor: formValues.sport === s ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                            background: formValues.sport === s ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                            color: formValues.sport === s ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                            fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                          }}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  ) : field.name === 'fixtureId' ? (
                    formValues.sport ? (
                      <MatchSearchInput
                        sport={formValues.sport}
                        homeTeam={formValues.homeTeam ?? ''}
                        awayTeam={formValues.awayTeam ?? ''}
                        onChange={(fixture) => {
                          const isSportsBet = selectedKey === 'sports_winner' || selectedKey === 'sports_score'
                          const matchStartMs = new Date(fixture.date).getTime()
                          if (isSportsBet && !isNaN(matchStartMs)) {
                            // Claim/join closes 1 min before kick-off — no betting once match starts
                            const claimTs = new Date(matchStartMs - 60 * 1000).toISOString().slice(0, 16)
                            // Resolve 3 h after kick-off — covers 90 min match + buffer for result
                            const resolveTs = new Date(matchStartMs + 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
                            setClaimDeadlineDate(claimTs)  // lobby bets
                            setJoinDeadlineDate(claimTs)   // private bets
                            setFormValues(v => ({
                              ...v,
                              fixtureId: fixture.id,
                              homeTeam: fixture.homeTeam,
                              awayTeam: fixture.awayTeam,
                              resolveAt: resolveTs,
                              pickedTeam: '',
                            }))
                          } else {
                            const resolveAt = new Date(matchStartMs + 3 * 60 * 60 * 1000)
                              .toISOString().slice(0, 16)
                            setFormValues(v => ({
                              ...v,
                              fixtureId: fixture.id,
                              homeTeam: fixture.homeTeam,
                              awayTeam: fixture.awayTeam,
                              resolveAt,
                              pickedTeam: '',
                            }))
                          }
                        }}
                      />
                    ) : (
                      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem', margin: 0, padding: '10px 0' }}>
                        ↑ Pick a sport first
                      </p>
                    )
                  ) : field.name === 'pickedTeam' ? (
                    formValues.homeTeam ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[formValues.homeTeam, formValues.awayTeam].filter(Boolean).map(team => (
                          <button
                            key={team}
                            type="button"
                            onClick={() => setFormValues(v => ({ ...v, pickedTeam: team }))}
                            style={{
                              flex: 1, padding: '10px 8px', borderRadius: 'var(--radius-input)',
                              border: '1px solid',
                              borderColor: formValues.pickedTeam === team ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                              background: formValues.pickedTeam === team ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                              color: formValues.pickedTeam === team ? 'var(--color-pop-accent)' : 'var(--color-pop-text)',
                              fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                            }}
                          >
                            {team}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.85rem', margin: 0, padding: '10px 0' }}>
                        ↑ Select a match first
                      </p>
                    )
                  ) : (
                    <input
                      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'datetime-local' : 'text'}
                      placeholder={field.placeholder}
                      value={formValues[field.name] ?? ''}
                      onChange={e => setFormValues(v => ({ ...v, [field.name]: e.target.value }))}
                      style={inputStyle}
                    />
                  )}
                </div>
              ))}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Resolve date/time (UTC)</span>
              <input type="datetime-local" value={formValues.resolveAt ?? ''} onChange={e => setFormValues(v => ({ ...v, resolveAt: e.target.value }))} style={inputStyle} />
            </label>

            <div style={{ display: 'flex', gap: 8 }}>
              {(['private', 'open'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBetType(t)}
                  style={{
                    flex: 1, padding: '10px 0', borderRadius: 'var(--radius-input)',
                    border: '1px solid',
                    borderColor: betType === t ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)',
                    background: betType === t ? 'rgba(215,255,30,0.08)' : 'var(--color-pop-surface)',
                    color: betType === t ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)',
                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer',
                  }}
                >
                  {t === 'private' ? 'Private' : 'Open to lobby'}
                </button>
              ))}
            </div>

            {betType === 'private' && (
              <>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Join deadline <span style={{ fontWeight: 400, fontSize: '0.8rem' }}>(UTC)</span></span>
                  <input type="datetime-local" value={joinDeadlineDate} onChange={e => setJoinDeadlineDate(e.target.value)} style={inputStyle} />
                </label>

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>
                    Opponent wallet address
                    <span style={{ fontWeight: 400, color: 'var(--color-pop-muted)', fontSize: '0.8rem' }}> — optional, or leave blank to share an invite link</span>
                  </span>
                  <input type="text" placeholder="0x… (leave blank to get a shareable link)" value={opponent} onChange={e => setOpponent(e.target.value)} style={inputStyle} />
                </label>
              </>
            )}

            {betType === 'open' && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>
                  Claim deadline
                  <span style={{ fontWeight: 400, color: 'var(--color-pop-muted)', fontSize: '0.8rem' }}>
                    {(selectedKey === 'sports_winner' || selectedKey === 'sports_score')
                      ? ' — auto-set to 1 min before kick-off'
                      : ' — must be at least 24h before resolve date'}
                  </span>
                </span>
                <input type="datetime-local" value={claimDeadlineDate} onChange={e => setClaimDeadlineDate(e.target.value)} style={inputStyle} />
              </label>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>Stake per person (USDC)</span>
              <input type="number" placeholder="10.00" min="0" step="0.01" value={stakeUsdc} onChange={e => setStakeUsdc(e.target.value)} style={inputStyle} />
            </label>

            {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem' }}>{error}</p>}

            <button onClick={handlePreview} style={ctaStyle}>
              {betType === 'open' ? 'Post to Lobby →' : opponent.trim() ? 'Preview →' : 'Get Invite Link →'}
            </button>
          </div>
        </main>
      </>
    )
  }

  // ── Invite link ───────────────────────────────────────────────────────────
  if (step === 'invite-link') {
    const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inviteId}`
    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 12 }}>Invite created!</h1>
          <p style={{ color: 'var(--color-pop-muted)', marginBottom: 32 }}>
            Share this link with your opponent. When they accept, come back here to create the bet on-chain.
          </p>

          <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 20, marginBottom: 16 }}>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: 'var(--color-pop-text)', wordBreak: 'break-all', marginBottom: 16 }}>
              {inviteUrl}
            </p>
            <button onClick={copyInviteLink} style={{ ...ctaStyle, padding: '10px 0' }}>
              {copied ? '✓ Copied!' : 'Copy invite link'}
            </button>
          </div>

          <button onClick={() => router.push(`/invite/${inviteId}`)} style={{ ...ctaStyle, background: 'var(--color-pop-surface)', color: 'var(--color-pop-text)', border: '1px solid var(--color-pop-surface-2)' }}>
            View invite page →
          </button>
        </main>
      </>
    )
  }

  // ── Confirm / approving / creating ────────────────────────────────────────
  if ((step === 'confirm' || (betType === 'private' && (step === 'approving' || step === 'creating'))) && template) {
    const definitionText = template.definition({ ...formValues })
    const definitionHash = keccak256(toHex(definitionText))
    const busy = step === 'approving' || step === 'creating'

    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          {!busy && <button onClick={() => setStep('form')} style={backBtnStyle}>← Back</button>}
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 32 }}>Confirm bet</h1>

          <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 24 }}>
            <p style={{ color: 'var(--color-pop-text)', lineHeight: 1.6, marginBottom: 16 }}>{definitionText}</p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-pop-muted)', wordBreak: 'break-all' }}>
              keccak256: {definitionHash}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <Row label="Stake each" value={`${stakeUsdc} USDC`} />
            <Row label="Pot" value={`${(parseFloat(stakeUsdc) * 2).toFixed(2)} USDC`} accent />
            <Row label="Opponent" value={`${opponent.slice(0, 6)}…${opponent.slice(-4)}`} mono />
          </div>

          {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', marginBottom: 16 }}>{error}</p>}

          {step === 'approving' && (
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              {approveLoading ? 'Approving USDC spend…' : 'Approval confirmed, creating bet…'}
            </p>
          )}
          {step === 'creating' && (
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              {createLoading ? 'Confirming on-chain…' : 'Saving bet…'}
            </p>
          )}

          <button onClick={handleCreate} disabled={busy} style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Processing…' : 'Approve & create bet'}
          </button>
        </main>
      </>
    )
  }

  // ── Confirm-open / approving / creating (open flow) ──────────────────────
  if ((step === 'confirm-open' || (betType === 'open' && (step === 'approving' || step === 'creating'))) && template) {
    const definitionText = template.definition({ ...formValues })
    const definitionHash = keccak256(toHex(definitionText))
    const busy = step === 'approving' || step === 'creating'

    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 560, margin: '0 auto', padding: '48px 24px' }}>
          {!busy && <button onClick={() => setStep('form')} style={backBtnStyle}>← Back</button>}
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 32 }}>Post to lobby</h1>

          <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 'var(--radius-card)', padding: 24, marginBottom: 24 }}>
            <p style={{ color: 'var(--color-pop-text)', lineHeight: 1.6, marginBottom: 16 }}>{definitionText}</p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: 'var(--color-pop-muted)', wordBreak: 'break-all' }}>
              keccak256: {definitionHash}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            <Row label="Stake each" value={`${stakeUsdc} USDC`} />
            <Row label="Pot" value={`${(parseFloat(stakeUsdc) * 2).toFixed(2)} USDC`} accent />
            <Row label="Claim deadline (UTC)" value={claimDeadlineDate ? asUTC(claimDeadlineDate).toUTCString().replace('GMT', 'UTC') : '—'} />
          </div>

          {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', marginBottom: 16 }}>{error}</p>}

          {step === 'approving' && (
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              {approveLoading ? 'Approving USDC spend…' : 'Approval confirmed, posting bet…'}
            </p>
          )}
          {step === 'creating' && (
            <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              {createLoading ? 'Confirming on-chain…' : 'Saving bet…'}
            </p>
          )}

          <button onClick={handleCreateOpen} disabled={busy} style={{ ...ctaStyle, opacity: busy ? 0.5 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}>
            {busy ? 'Processing…' : 'Approve & post to lobby'}
          </button>
        </main>
      </>
    )
  }

  return null
}

export default function NewBetPage() {
  return (
    <Suspense>
      <NewBetInner />
    </Suspense>
  )
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function Row({ label, value, accent, mono }: { label: string; value: string; accent?: boolean; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>{label}</span>
      <span style={{
        fontWeight: 600,
        color: accent ? 'var(--color-pop-accent)' : 'var(--color-pop-text)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        fontSize: mono ? '0.85rem' : undefined,
      }}>{value}</span>
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const backBtnStyle: React.CSSProperties = {
  color: 'var(--color-pop-muted)', background: 'none', border: 'none',
  cursor: 'pointer', marginBottom: 24, padding: 0, fontSize: '0.9rem',
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
  cursor: 'pointer',
  width: '100%',
}
