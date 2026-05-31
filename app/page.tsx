'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWatchContractEvent } from 'wagmi'
import { formatUnits } from 'viem'
import { motion } from 'framer-motion'
import { POP_CONTRACT, popAbi } from '@/lib/contracts'
import { PopCelebration } from '@/components/pop-celebration'
import { Logo } from '@/components/Logo'

// ── Countdown — initialised client-side only to avoid SSR mismatch ───────────
function useHeroCountdown() {
  const targetRef = useRef(0)
  const [display, setDisplay] = useState('...')

  useEffect(() => {
    targetRef.current = Date.now() + 2 * 3_600_000 + 45 * 60_000 + 18_000
    const tick = () => {
      const rem = Math.max(0, targetRef.current - Date.now())
      const h = Math.floor(rem / 3_600_000)
      const m = Math.floor((rem % 3_600_000) / 60_000)
      const s = Math.floor((rem % 60_000) / 1_000)
      setDisplay(`${h}h ${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  return display
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const router = useRouter()
  const { address } = useAccount()
  const countdown = useHeroCountdown()

  const [totalBets, setTotalBets] = useState(0)
  const [totalVolume, setTotalVolume] = useState(0n)
  const seenIds = useRef(new Set<string>())
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useWatchContractEvent({
    address: POP_CONTRACT,
    abi: popAbi,
    eventName: 'BetResolved',
    onLogs(logs) {
      for (const log of logs) {
        const { id, pot } = log.args as { id: bigint; pot: bigint }
        const key = id.toString()
        if (seenIds.current.has(key)) continue
        seenIds.current.add(key)
        setTotalBets(n => n + 1)
        setTotalVolume(v => v + pot)
      }
    },
  })

  const settledVolume = totalVolume > 0n
    ? `$${parseFloat(formatUnits(totalVolume, 6)).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
    : '—'
  const activeBetsDisplay = totalBets > 0 ? totalBets.toLocaleString() : '—'

  return (
    <>
      <PopCelebration userAddress={address} />

      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 32px',
        background: 'rgba(11,11,15,0.88)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-pop-surface-2)',
      }}>
        <Logo size="md" />

        <div className="nav-links" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
          {NAV_LINKS.map(({ label, href }) => (
            <a
              key={href}
              href={href}
              style={{ color: 'var(--color-pop-muted)', textDecoration: 'none', fontSize: '0.9375rem', fontWeight: 500 }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-pop-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-pop-muted)')}
            >
              {label}
            </a>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Link href="/my" className="my-bets-link">My Bets</Link>
          <ConnectButton />
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section style={{
        padding: '80px 32px 96px', maxWidth: 1200, margin: '0 auto',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.038) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
      }}>
        <div className="hero-grid">

          {/* Left column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, width: 'fit-content',
              background: 'rgba(215,255,30,0.07)', border: '1px solid rgba(215,255,30,0.2)',
              borderRadius: 'var(--radius-pill)', padding: '6px 14px',
              fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.12em', color: 'var(--color-pop-accent)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-pop-accent)', display: 'inline-block' }} />
              PRIVATE BETS. AUTOMATED SETTLEMENT.
            </span>

            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(3.5rem, 6vw, 6rem)', lineHeight: 0.95, letterSpacing: '0.02em', margin: 0 }}>
              <span style={{ color: 'var(--color-pop-text)', display: 'block' }}>SETTLE BETS.</span>
              <span style={{ color: 'var(--color-pop-accent)', display: 'block' }}>WITHOUT DOUBT.</span>
            </h1>

            <p style={{ color: 'var(--color-pop-muted)', fontSize: 'clamp(1rem, 1.5vw, 1.125rem)', lineHeight: 1.7, maxWidth: 440, margin: 0 }}>
              One-on-one bets between friends, settled automatically by an agent using public data. Stake USDC, agree on terms, and collect instantly. No trust required.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link href="/new" style={{
                background: 'var(--color-pop-accent)', color: '#0a0a0a',
                borderRadius: 'var(--radius-cta)', padding: '12px 24px',
                textDecoration: 'none', fontWeight: 700, fontSize: '0.9375rem',
              }}>Make a bet ↗</Link>
              <Link href="/demo" style={{
                background: 'transparent', color: 'var(--color-pop-text)',
                border: '1px solid var(--color-pop-surface-2)',
                borderRadius: 'var(--radius-cta)', padding: '12px 24px',
                textDecoration: 'none', fontWeight: 600, fontSize: '0.9375rem',
              }}>Try demo ↗</Link>
            </div>

            <div className="stats-bar" style={{ paddingTop: 8 }}>
              {[
                { label: 'Settled today', value: settledVolume },
                { label: 'Active bets', value: activeBetsDisplay },
                { label: 'Avg. settlement', value: '~3s' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.625rem', color: 'var(--color-pop-accent)', lineHeight: 1 }}>{value}</div>
                  <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.75rem', marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — floating live bet card */}
          <div className="relative flex items-center justify-center" style={{ minHeight: 520 }}>
            {/* Orbit rings */}
            <div className="pointer-events-none absolute h-[420px] w-[420px] rounded-full border border-lime-400/20 rotate-[20deg]" />
            <div className="pointer-events-none absolute h-[300px] w-[300px] rounded-full border border-lime-400/10 rotate-[-15deg]" />

            {/* Soft ambient glow — premium, not aggressive */}
            <div className="pointer-events-none absolute h-[260px] w-[260px] rounded-full bg-lime-400/[0.15] blur-[100px]" />

            {/* Floating card */}
            <motion.div
              initial={{ rotate: -6 }}
              animate={{ y: [-6, 6, -6], rotate: -6, boxShadow: '0 0 60px rgba(190,242,100,0.22)' }}
              whileHover={{ rotate: 0, scale: 1.02, boxShadow: '0 0 80px rgba(190,242,100,0.38)' }}
              transition={{
                y: { duration: 8, repeat: Infinity, ease: 'easeInOut' },
                boxShadow: { duration: 0.5, ease: 'easeOut' },
                rotate: { duration: 0.5, ease: 'easeOut' },
                scale: { duration: 0.5, ease: 'easeOut' },
              }}
              className="relative w-[320px] rounded-[32px] border border-lime-400/40 bg-[#070707]/90 backdrop-blur-xl p-8"
            >
              {/* Live label */}
              <div className="mb-8 flex items-center gap-2 text-[12px] uppercase tracking-[0.25em] text-lime-300">
                <div className="h-2 w-2 animate-pulse rounded-full bg-lime-400" />
                Live Bet
              </div>

              {/* Header */}
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-orange-500 text-[1.625rem] font-bold text-white shadow-lg">
                  ₿
                </div>
                <div>
                  <h3 className="text-[1.75rem] font-semibold leading-tight text-white">BTC Price</h3>
                  <p className="mt-2 text-[0.95rem] text-white/60">Over $70,000 this month?</p>
                </div>
              </div>

              {/* Divider */}
              <div className="my-7 h-px bg-white/10" />

              {/* YES / VS / NO */}
              <div className="grid grid-cols-3 items-center text-center">
                <div>
                  <p className="text-xl font-bold uppercase tracking-wide text-lime-400">Yes</p>
                  <p className="mt-2 text-[2rem] font-semibold text-white">$250</p>
                </div>
                <div className="text-base font-medium text-white/30">VS</div>
                <div>
                  <p className="text-xl font-bold uppercase tracking-wide text-white/40">No</p>
                  <p className="mt-2 text-[2rem] font-semibold text-white/65">$250</p>
                </div>
              </div>

              {/* Divider */}
              <div className="my-7 h-px bg-white/10" />

              {/* Source + Countdown */}
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Source</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[1.05rem] font-medium text-white">CoinGecko</span>
                    <div className="h-2 w-2 rounded-full bg-lime-400" />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">Settles In</p>
                  <p className="mt-2 text-[1.2rem] font-medium tabular-nums text-white">{countdown}</p>
                </div>
              </div>

              {/* Inner border glow overlay */}
              <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-lime-300/20" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section id="how-it-works" style={{ padding: '0 32px 96px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 56 }}>
          <div style={{ color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>HOW IT WORKS</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3.5rem)', margin: 0, letterSpacing: '0.02em' }}>
            FOUR STEPS TO SETTLE ANYTHING
          </h2>
        </div>

        <div className="hiw-grid">
          {HOW_IT_WORKS.map((step, i) => (
            <div key={i} style={{
              padding: '32px 28px',
              borderLeft: i > 0 ? '1px solid var(--color-pop-surface-2)' : undefined,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: '50%',
                border: '2px solid var(--color-pop-surface-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem',
              }}>{step.icon}</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '0.9rem', color: 'var(--color-pop-accent)', letterSpacing: '0.12em' }}>
                0{i + 1}
              </div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{step.title}</div>
              <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.875rem', lineHeight: 1.65 }}>{step.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── POPULAR MARKETS ─────────────────────────────────────────────── */}
      <section style={{ padding: '0 32px 96px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 40 }}>
          <div style={{ color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>POPULAR MARKETS</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0, letterSpacing: '0.02em' }}>
            WHAT DO YOU WANT TO BET ON?
          </h2>
        </div>

        <div className="markets-grid">
          {MARKETS.map((market) => (
            <button
              key={market.title}
              onClick={market.href !== null ? () => router.push(market.href as string) : undefined}
              style={{
                background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)',
                borderRadius: 'var(--radius-card)', padding: '24px 22px',
                cursor: market.href !== null ? 'pointer' : 'default',
                textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 14,
                color: 'var(--color-pop-text)', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => { if (market.href) e.currentTarget.style.borderColor = 'rgba(215,255,30,0.4)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--color-pop-surface-2)' }}
            >
              <div style={{ fontSize: '1.75rem' }}>{market.icon}</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>{market.title}</div>
                <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.8125rem', lineHeight: 1.55 }}>{market.description}</div>
              </div>
              <div style={{ marginTop: 'auto', color: market.href ? 'var(--color-pop-accent)' : 'var(--color-pop-muted)', fontSize: '1.125rem' }}>→</div>
            </button>
          ))}
        </div>
      </section>

      {/* ── BUILT FOR FAIR BETS ──────────────────────────────────────────── */}
      <section style={{ padding: '0 32px 96px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 20, padding: '56px 48px' }}>
          <div className="fair-grid">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.5rem, 4vw, 4rem)', lineHeight: 0.95, margin: 0, letterSpacing: '0.02em' }}>
                <span style={{ display: 'block', color: 'var(--color-pop-text)' }}>BUILT FOR</span>
                <span style={{ display: 'block', color: 'var(--color-pop-accent)' }}>FAIR BETS</span>
              </h2>
              <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.9375rem', lineHeight: 1.7, margin: 0, maxWidth: 400 }}>
                No house. No middlemen. Your money is locked in a contract that can only release it to one of the two participants. It can never go anywhere else.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {FEATURES.map(f => (
                  <span key={f.label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(215,255,30,0.05)', border: '1px solid rgba(215,255,30,0.15)',
                    borderRadius: 'var(--radius-pill)', padding: '6px 14px',
                    fontSize: '0.8125rem', fontWeight: 500,
                  }}>
                    {f.icon} {f.label}
                  </span>
                ))}
              </div>
            </div>

            {/* CSS-only glowing coin */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{
                width: 200, height: 200, borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 33%, #b8f530 0%, #6bcf00 38%, #1e4d00 70%, #0B0B0F 100%)',
                boxShadow: '0 0 64px rgba(107,207,0,0.45), 0 0 128px rgba(107,207,0,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: 138, height: 138, borderRadius: '50%',
                  background: 'radial-gradient(circle at 38% 33%, #d7ff1e 0%, #9bdf00 50%, #2e6600 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2.5rem', fontWeight: 700, color: '#0a1a00',
                }}>$</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── ABOUT ───────────────────────────────────────────────────────── */}
      <section id="about" style={{ padding: '0 32px 96px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>ABOUT</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0, letterSpacing: '0.02em' }}>
            WHAT IS POP?
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {ABOUT_PARAGRAPHS.map((p, i) => (
            <p key={i} style={{ color: 'var(--color-pop-muted)', fontSize: '0.9375rem', lineHeight: 1.8, margin: 0 }}>{p}</p>
          ))}
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────────────────── */}
      <section id="faq" style={{ padding: '0 32px 96px', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ marginBottom: 48 }}>
          <div style={{ color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>FAQ</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3rem)', margin: 0, letterSpacing: '0.02em' }}>
            COMMON QUESTIONS
          </h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {FAQS.map((faq, i) => (
            <div key={i} style={{ borderBottom: '1px solid var(--color-pop-surface-2)' }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '22px 0', background: 'transparent', border: 'none',
                  color: 'var(--color-pop-text)', cursor: 'pointer', textAlign: 'left',
                  fontSize: '0.9375rem', fontWeight: 600, gap: 16,
                }}
              >
                {faq.q}
                <span style={{
                  color: 'var(--color-pop-accent)', fontSize: '1.375rem', flexShrink: 0,
                  display: 'inline-block',
                  transform: openFaq === i ? 'rotate(45deg)' : 'rotate(0deg)',
                  transition: 'transform 0.2s',
                }}>+</span>
              </button>
              {openFaq === i && (
                <div style={{ color: 'var(--color-pop-muted)', fontSize: '0.9rem', lineHeight: 1.75, paddingBottom: 22 }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--color-pop-surface-2)', padding: '32px 32px', maxWidth: 1200, margin: '0 auto' }}>
        <div className="footer-flex">
          <Logo size="lg" />
          <p style={{ color: 'var(--color-pop-muted)', fontSize: '0.8125rem', margin: 0 }}>
            © 2024 POP Protocol. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
            <a
              href="https://discord.gg/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              style={{ color: 'var(--color-pop-muted)', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-pop-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-pop-muted)')}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.03.054a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
              </svg>
            </a>
            <a
              href="https://x.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="X (Twitter)"
              style={{ color: 'var(--color-pop-muted)', transition: 'color 0.15s' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-pop-text)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-pop-muted)')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.747l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </>
  )
}

// ── Static data ───────────────────────────────────────────────────────────────

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '#about' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Lobby', href: '/lobby' },
]

const HOW_IT_WORKS = [
  {
    icon: '➕',
    title: 'Create a bet',
    body: 'Pick a template (crypto price, YouTube milestone, sports result). Set your terms and stake USDC.',
  },
  {
    icon: '👥',
    title: 'Your friend accepts',
    body: 'They see the exact same terms, stake the same amount. Both sides are locked in and neither can touch the funds.',
  },
  {
    icon: '🛡️',
    title: 'Agent resolves',
    body: 'At the agreed time, an automated agent fetches proof from the bound public source. No human judgment involved.',
  },
  {
    icon: '💸',
    title: 'Winner gets paid',
    body: 'After a 3-hour challenge window, the winner claims the full pot instantly. No fees, no delays.',
  },
]

const MARKETS: Array<{ icon: string; title: string; description: string; href: string | null }> = [
  {
    icon: '₿',
    title: 'Crypto',
    description: 'Bet on token prices, market caps, and milestones using live CoinGecko data.',
    href: '/new',
  },
  {
    icon: '⚽',
    title: 'Sports',
    description: 'Football and basketball match outcomes settled automatically via api-sports.io.',
    href: '/new',
  },
  {
    icon: '📱',
    title: 'Socials',
    description: 'YouTube views, subscriber counts, and social media milestones verified on-chain.',
    href: '/new',
  },
  {
    icon: '🌍',
    title: 'Global Events',
    description: 'Real-world outcomes like elections, awards, and records, verified by public sources.',
    href: null, // TODO: add global events template
  },
]

const FEATURES = [
  { icon: '🔒', label: 'USDC Stakes' },
  { icon: '🏦', label: 'Non-custodial' },
  { icon: '👁️', label: 'Transparent' },
  { icon: '⚡', label: 'Automated' },
]

const FAQS = [
  {
    q: 'What is POP?',
    a: 'POP is a peer-to-peer betting protocol. Two people agree on a bet, stake USDC, and an automated agent settles the result using public data. No house, no middlemen.',
  },
  {
    q: 'How are bets settled?',
    a: 'At the agreed resolution time, an agent fetches data from the bound public source (e.g. CoinGecko for crypto prices). It compares the result to the bet terms using plain comparison code, not AI judgment, then proposes a winner on-chain.',
  },
  {
    q: 'Is my money safe? Is this custodial?',
    a: 'Yes, your funds are fully protected. They are locked in a contract that can only pay out to one of the two participants. The resolver cannot take fees or redirect funds to any other address.',
  },
  {
    q: 'What happens if I disagree with the result?',
    a: 'You have a 3-hour challenge window after the agent proposes a winner. If you challenge, the bet enters a dispute state where both sides vote. If unresolved, both parties are fully refunded.',
  },
  {
    q: 'Which networks and tokens are supported?',
    a: 'POP currently runs on Arc Testnet and settles in USDC. Mainnet and additional token support are planned.',
  },
]

const ABOUT_PARAGRAPHS = [
  'POP is a protocol for private peer-to-peer bets, settled automatically. It was built around a simple belief: if two people agree on the terms and a public source of truth, no third party should be needed to call the result.',
  'Every bet on POP is a direct agreement between two wallets. The stakes are locked until an automated agent fetches verifiable data from a bound public source and proposes a winner. There is no house edge, no intermediary profit, and no discretionary judgment. Just code running against public data.',
  'POP runs on Arc Testnet. The resolver is open, auditable, and deterministic. Anyone can verify exactly how a bet was called.',
]
