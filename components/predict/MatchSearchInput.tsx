'use client'

import { useState, useEffect, useRef } from 'react'
import { inputStyle } from '@/components/predict/ui'

export interface SportFixture {
  id: string
  homeTeam: string
  awayTeam: string
  league: string
  date: string
  isKnockout: boolean
}

interface MatchSearchInputProps {
  sport: string
  homeTeam: string
  awayTeam: string
  onChange: (fixture: SportFixture) => void
}

// Fixture search autocomplete (via /api/sports/search). A Predict-owned copy of the PvP
// bet form's widget (app/new) so the create form gets the same match picker.
export function MatchSearchInput({ sport, homeTeam, awayTeam, onChange }: MatchSearchInputProps) {
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
    if (q.length < 3) return
    setLoading(true)
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/sports/search?query=${encodeURIComponent(q)}&sport=${encodeURIComponent(sport)}`)
        const data = (await res.json()) as { fixtures: SportFixture[]; error?: string }
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
      return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    } catch {
      return dateStr
    }
  }

  function formatMatchDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
      })
    } catch {
      return dateStr
    }
  }

  const showDropdown = open && query.length >= 3 && (loading || searched)

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        placeholder={`e.g. ${sport === 'basketball' ? 'Los Angeles Lakers' : 'Spain, Brazil, Real Madrid'}`}
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => query.length >= 3 && searched && setOpen(true)}
        style={inputStyle}
      />
      {selectedDate && !open && (
        <p style={{ margin: '6px 0 0 2px', fontSize: '0.78rem', color: 'var(--color-pop-muted)', letterSpacing: '0.01em' }}>
          Match date: {formatMatchDate(selectedDate)}
        </p>
      )}
      {showDropdown && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
          borderRadius: 'var(--radius-card)', marginTop: 4, overflow: 'hidden',
        }}>
          {loading && <div style={{ padding: '10px 14px', color: 'var(--color-pop-muted)', fontSize: '0.85rem' }}>Searching…</div>}
          {!loading && results.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => select(f)}
              style={{
                width: '100%', textAlign: 'left', padding: '10px 14px',
                background: 'none', border: 'none', borderBottom: '1px solid var(--color-pop-surface-2)',
                cursor: 'pointer', color: 'var(--color-pop-text)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-pop-surface-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
            >
              <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>
                {f.homeTeam} <span style={{ color: 'var(--color-pop-muted)', fontWeight: 400 }}>vs</span> {f.awayTeam}
              </div>
              <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem' }}>{f.league} · {formatDate(f.date)}</div>
            </button>
          ))}
          {!loading && results.length === 0 && (
            <div style={{ padding: '10px 14px', fontSize: '0.85rem' }}>
              <span style={{ color: apiError ? '#f87171' : 'var(--color-pop-muted)' }}>{apiError ?? 'No upcoming fixtures found for this team'}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
