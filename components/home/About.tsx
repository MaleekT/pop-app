'use client'

import { useEffect, useRef, useState } from 'react'
import { Reveal } from '@/components/home/Reveal'
import { ProtocolCanvas } from '@/components/home/ProtocolCanvas'

// Every number here maps to a contract constant:
//   1h  -> Pop.sol:13            CHALLENGE_WINDOW = 1 hours   (1v1)
//   0   -> PredictMarket.sol:23  CHALLENGE_WINDOW = 0         (markets settle with no window)
//   10% -> Parlay.sol:45         HOUSE_MARGIN_NUM = 90        (the house keeps 10%)
// The old "0% house edge" card was a blanket claim that parlays made false, so it is gone.

const mono = 'var(--font-mono)'
const COUNT_MS = 1200

const STATS: { value: number; suffix: string; title: string; body: string }[] = [
  {
    value: 1,
    suffix: 'h',
    title: 'CHALLENGE WINDOW',
    body: 'Dispute a 1v1 result before the pot releases. Markets settle with no challenge window at all.',
  },
  {
    value: 100,
    suffix: '%',
    title: 'ON-CHAIN',
    body: 'Every stake, proof and payout is verifiable on Arc.',
  },
  {
    value: 10,
    suffix: '%',
    title: 'PARLAY HOUSE EDGE',
    body: 'The only house on POP. Markets and 1v1 bets take no cut.',
  },
]

// The resting value is the REAL number, not 0. These stats read "0h challenge window" and
// "0% parlay house edge" when zeroed, which are exactly the false claims this page exists to
// correct, so no-JS, no-observer and reduced-motion must all land on the truth. Zero is only ever
// shown as the starting frame of an animation that is already committed to running.
function CountUp({ target, suffix }: { target: number; suffix: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(target)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined' || matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let raf = 0
    const io = new IntersectionObserver(
      ([entry]) => {
        // Off screen: safe to wind back to 0 and wait, nobody can read it yet.
        if (!entry.isIntersecting) {
          setValue(0)
          return
        }
        io.unobserve(entry.target)
        setValue(0)
        const start = performance.now()
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / COUNT_MS)
          setValue(Math.round(target * (1 - Math.pow(1 - p, 3))))
          if (p < 1) raf = requestAnimationFrame(step)
        }
        raf = requestAnimationFrame(step)
      },
      { threshold: 0.5 },
    )
    io.observe(el)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [target])

  return (
    <div ref={ref} style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', color: 'var(--color-pop-accent)', lineHeight: 1, letterSpacing: '0.02em' }}>
      {value}{suffix}
    </div>
  )
}

export function About() {
  return (
    <section id="about" style={{ borderTop: '1px solid var(--color-pop-surface-2)', background: '#0E0E13' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
        <div className="about-grid">
          <Reveal>
            <div style={{ fontFamily: mono, color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 16 }}>ABOUT POP</div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 3.8vw, 3.25rem)', lineHeight: 0.95, letterSpacing: '0.02em', margin: '0 0 22px' }}>
              <span style={{ display: 'block', color: 'var(--color-pop-text)' }}>ANY OUTCOME.</span>
              <span style={{ display: 'block', color: 'var(--color-pop-accent)' }}>SETTLED BY CODE.</span>
            </h2>
            <p style={{ fontSize: '0.97rem', lineHeight: 1.7, color: 'var(--color-pop-muted)', margin: '0 0 16px' }}>
              POP started as a way to settle one bet with one friend. It now runs three games on the same rails: pooled prediction markets, 1v1 bets, and parlays. The belief behind all of them is the same. If the terms are agreed and the source is public, no third party should decide the result.
            </p>
            <p style={{ fontSize: '0.97rem', lineHeight: 1.7, color: 'var(--color-pop-muted)', margin: 0 }}>
              An agent reads the bound public source and proposes the outcome on-chain. No discretionary judgment, no editorial call. The resolver is open, auditable and deterministic, so anyone can check exactly how a result was reached.
            </p>
          </Reveal>

          <Reveal delay={120}>
            <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 20, overflow: 'hidden', border: '1px solid var(--color-pop-surface-2)' }}>
              <ProtocolCanvas />
              <div style={{ position: 'absolute', left: 16, bottom: 16, pointerEvents: 'none', fontFamily: mono, fontWeight: 700, fontSize: '0.62rem', letterSpacing: '0.08em', color: 'var(--color-pop-bg)', background: 'var(--color-pop-accent)', padding: '6px 11px', borderRadius: 20 }}>
                BUILT ON ARC
              </div>
            </div>
          </Reveal>
        </div>

        <div className="about-stats">
          {STATS.map((stat, i) => (
            <Reveal key={stat.title} delay={i * 120}>
              <div style={{ background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 16, padding: 26, height: '100%' }}>
                <CountUp target={stat.value} suffix={stat.suffix} />
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.08em', color: 'var(--color-pop-text)', marginTop: 12 }}>{stat.title}</div>
                <p style={{ fontSize: '0.82rem', lineHeight: 1.55, color: 'var(--color-pop-muted)', margin: '6px 0 0' }}>{stat.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
