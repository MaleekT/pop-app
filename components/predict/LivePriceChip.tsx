'use client'

import { useState, useEffect } from 'react'

interface LivePriceChipProps {
  coinId: string
}

// Live price chip for a CoinGecko coin id, via the app's /api/crypto/price route. A
// Predict-owned copy of the PvP bet form's widget (app/new).
export function LivePriceChip({ coinId }: LivePriceChipProps) {
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
        const data = (await res.json()) as { price?: number; fetchedAt?: string; error?: string }
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
      display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 8, padding: '6px 12px',
      background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
      borderRadius: 'var(--radius-pill)', fontSize: '0.8125rem',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      {status === 'loading' && <span style={{ color: 'var(--color-pop-muted)' }}>Fetching price…</span>}
      {status === 'ok' && price != null && (
        <>
          <span style={{ color: 'var(--color-pop-muted)' }}>Current price:</span>
          <span style={{ fontWeight: 700, color: 'var(--color-pop-text)' }}>
            ${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: price >= 1 ? 2 : 6 })}
          </span>
          {fetchedAt && (
            <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.7rem' }}>
              as of {new Date(fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </>
      )}
      {status === 'error' && <span style={{ color: 'var(--color-pop-muted)' }}>Price unavailable</span>}
    </div>
  )
}
