'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { AppNav } from '@/components/AppNav'

const HANDLE_RE = /^[a-z0-9_]{3,20}$/

function safeAvatarUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
    return url
  } catch { return null }
}

export default function SettingsPage() {
  const { address, isConnected } = useAccount()

  const [handle, setHandle] = useState('')
  const [savedHandle, setSavedHandle] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [inputFocused, setInputFocused] = useState(false)

  useEffect(() => {
    if (!address) return
    setLoading(true)
    fetch(`/api/profile?address=${encodeURIComponent(address)}`)
      .then(r => r.ok ? r.json() : null)
      .then(profile => {
        if (profile?.handle) {
          setSavedHandle(profile.handle)
          setHandle(profile.handle)
        }
        if (profile?.avatar_url) setAvatarUrl(safeAvatarUrl(profile.avatar_url))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [address])

  function handleInput(v: string) {
    setHandle(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))
    setError('')
    setSuccess('')
  }

  const handleValid = handle === '' || HANDLE_RE.test(handle)

  async function save() {
    if (!address) return
    if (handle && !HANDLE_RE.test(handle)) {
      setError('Handle must be 3-20 characters: letters, numbers, underscores.')
      return
    }
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, handle: handle || null }),
      })
      const body = await res.json() as { error?: string }
      if (!res.ok) {
        setError(body.error ?? 'Failed to save.')
        return
      }
      setSavedHandle(handle || null)
      setSuccess('Saved.')
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!isConnected) {
    return (
      <>
        <AppNav />
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-pop-muted)' }}>Connect your wallet to manage your profile.</p>
          <ConnectButton />
        </main>
      </>
    )
  }

  return (
    <>
      <AppNav />

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '48px 24px' }}>
        <Link href="/my" style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', textDecoration: 'none', display: 'inline-block', marginBottom: 24 }}>
          ← My Bets
        </Link>
        <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, marginBottom: 8 }}>Settings</h1>
        <p style={{ color: 'var(--color-pop-muted)', marginBottom: 32, fontSize: '0.875rem' }}>
          {address?.slice(0, 6)}…{address?.slice(-4)}
        </p>

        {loading ? (
          <p style={{ color: 'var(--color-pop-muted)' }}>Loading…</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-pop-muted)' }}>
                Handle
                <span style={{ fontWeight: 400, marginLeft: 8 }}>
                  {savedHandle ? <span style={{ color: 'var(--color-pop-accent)' }}>@{savedHandle}</span> : 'Not set'}
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--color-pop-muted)', pointerEvents: 'none',
                }}>@</span>
                <input
                  type="text"
                  placeholder="yourhandle"
                  value={handle}
                  onChange={e => handleInput(e.target.value)}
                  maxLength={20}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  style={{
                    ...inputStyle,
                    paddingLeft: 28,
                    borderColor: !handleValid
                      ? 'var(--color-pop-danger)'
                      : inputFocused
                        ? 'var(--color-pop-accent)'
                        : 'var(--color-pop-surface-2)',
                  }}
                />
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-pop-muted)', margin: 0 }}>
                3-20 characters: lowercase letters, numbers, underscores. Leave blank to remove.
              </p>
            </div>

            {avatarUrl && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarUrl} alt="avatar" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-pop-surface-2)' }} />
                <span style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem' }}>Current avatar</span>
              </div>
            )}

            {error && <p style={{ color: 'var(--color-pop-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>}
            {success && <p style={{ color: 'var(--color-pop-win)', fontSize: '0.875rem', margin: 0 }}>{success}</p>}

            <button
              onClick={save}
              disabled={saving || !handleValid}
              style={{
                background: 'var(--color-pop-accent)', color: '#0B0B0F',
                fontWeight: 700, fontSize: '1rem', padding: '13px 0',
                borderRadius: 'var(--radius-cta)', border: 'none',
                cursor: saving || !handleValid ? 'not-allowed' : 'pointer',
                opacity: saving || !handleValid ? 0.5 : 1, width: '100%',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </main>
    </>
  )
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
