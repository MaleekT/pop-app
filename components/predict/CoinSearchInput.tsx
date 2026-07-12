'use client'

import { useState, useEffect, useRef } from 'react'
import { inputStyle } from '@/components/predict/ui'

interface CoinResult {
  id: string
  name: string
  symbol: string
  market_cap_rank: number | null
}

interface CoinSearchInputProps {
  value: string
  displayValue: string
  onChange: (id: string, display: string) => void
}

// CoinGecko search autocomplete. A Predict-owned copy of the PvP bet form's widget
// (app/new) so the create form gets the same coin picker without touching that file.
export function CoinSearchInput({ value, displayValue, onChange }: CoinSearchInputProps) {
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
        const data = (await res.json()) as { coins: CoinResult[] }
        setResults((data.coins ?? []).slice(0, 8))
      } catch {
        setResults([])
      }
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
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => query.length >= 2 && setOpen(true)}
        style={inputStyle}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)', marginTop: 4, overflow: 'hidden',
        }}>
          {results.map((coin) => (
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
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-pop-surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontWeight: 600 }}>
                {coin.name} <span style={{ color: 'var(--color-pop-muted)', fontWeight: 400 }}>({coin.symbol.toUpperCase()})</span>
              </span>
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
