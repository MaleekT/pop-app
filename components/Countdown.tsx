'use client'

import { useEffect, useState } from 'react'

function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':')
}

export function Countdown({ targetMs, label }: { targetMs: number; label: string }) {
  const [remaining, setRemaining] = useState(targetMs - Date.now())

  useEffect(() => {
    const id = setInterval(() => setRemaining(targetMs - Date.now()), 1000)
    return () => clearInterval(id)
  }, [targetMs])

  const expired = remaining <= 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: expired ? 'var(--color-pop-muted)' : 'var(--color-pop-accent)',
          letterSpacing: '0.08em',
        }}
      >
        {expired ? 'EXPIRED' : formatDuration(remaining)}
      </span>
      <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem' }}>{label}</span>
    </div>
  )
}
