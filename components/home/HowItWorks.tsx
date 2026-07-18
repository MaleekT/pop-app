'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Reveal } from '@/components/home/Reveal'
import { TargetIcon, LockIcon, EyeIcon, PayoutIcon } from '@/components/home/icons'

// The shared lifecycle, not the 1v1 lifecycle. Markets, 1v1 bets and parlays run the same four
// steps; only how you take a position and how the payout is worked out differ. Step 3 is byte for
// byte the same across all three, which is the actual thesis of the protocol, so it gets the
// emphasis. The earlier version framed this whole section as 1v1 and left the flagship product
// unexplained.
//
// Facts: 1 hour window Pop.sol:13 · markets have no window PredictMarket.sol:23 (= 0) ·
// parlay multiplier locked at buy and paid from the house pool Parlay.sol.

const mono = 'var(--font-mono)'

const MODE_TINT = {
  markets: 'var(--color-pop-accent)',
  duel: '#FF3DA1',
  parlay: '#60A5FA',
} as const

interface ModeLine {
  label: string
  tint: string
  text: string
}

interface Step {
  title: string
  shared: string
  icon: ReactNode
  modes?: ModeLine[]
  /** Step 3: the part that never changes, so it is called out instead of split three ways. */
  identical?: boolean
}

const STEPS: Step[] = [
  {
    title: 'Take a position',
    icon: <TargetIcon size={20} />,
    shared: 'Decide what you think happens, and how much USDC you want behind it.',
    modes: [
      { label: 'Markets', tint: MODE_TINT.markets, text: 'Back an outcome in an open pool.' },
      { label: '1v1', tint: MODE_TINT.duel, text: 'Send a friend a bet they have to accept.' },
      { label: 'Parlay', tint: MODE_TINT.parlay, text: 'Combine 2 to 5 open markets into one ticket.' },
    ],
  },
  {
    title: 'Your stake locks',
    icon: <LockIcon size={20} />,
    shared: 'The USDC moves into the contract and stops being yours to move.',
    modes: [
      { label: 'Markets', tint: MODE_TINT.markets, text: 'Joins the pool on the side you backed.' },
      { label: '1v1', tint: MODE_TINT.duel, text: 'Sits in escrow once your friend matches it.' },
      { label: 'Parlay', tint: MODE_TINT.parlay, text: 'Your multiplier is locked the moment you buy.' },
    ],
  },
  {
    title: 'The agent reads the source',
    icon: <EyeIcon size={20} />,
    shared: 'At the close time an automated agent reads the public source the market is bound to and proposes the outcome on-chain. Plain comparison code, no judgment.',
    identical: true,
  },
  {
    title: 'Settle and claim',
    icon: <PayoutIcon size={20} />,
    shared: 'The contract pays out. Nothing is released by a person.',
    modes: [
      { label: 'Markets', tint: MODE_TINT.markets, text: 'The winning side splits the whole pot. No challenge window.' },
      { label: '1v1', tint: MODE_TINT.duel, text: 'A 1 hour challenge window, then the winner takes both stakes.' },
      { label: 'Parlay', tint: MODE_TINT.parlay, text: 'Every leg must hit. The house pool pays your locked multiplier.' },
    ],
  },
]

function StepIcon({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 38,
        height: 38,
        borderRadius: 11,
        color: 'var(--color-pop-accent)',
        background: 'rgba(215,255,30,0.1)',
        border: '1px solid rgba(215,255,30,0.22)',
        flexShrink: 0,
        marginBottom: 14,
      }}
    >
      {children}
    </span>
  )
}

function ModeRows({ modes }: { modes: ModeLine[] }) {
  return (
    <ul className="hiw-modes">
      {modes.map((m) => (
        <li key={m.label} className="hiw-mode-row">
          <span className="hiw-mode-dot" style={{ background: m.tint }} aria-hidden="true" />
          <span>
            <span className="hiw-mode-label" style={{ color: m.tint }}>{m.label}</span>
            {m.text}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    const section = sectionRef.current
    if (!section) return

    // A collapsed (zero-height) section would divide by zero, so anything non-finite falls back to
    // fully lit rather than painting NaN. Nodes are only rewritten when the lit count actually
    // changes; the rail itself still tracks every frame so it stays smooth.
    let lastLit = -1
    const paint = (raw: number) => {
      const p = Number.isFinite(raw) ? Math.max(0, Math.min(1, raw)) : 1
      if (lineRef.current) lineRef.current.style.transform = `scaleX(${p.toFixed(3)})`

      const lit = Math.round(p * STEPS.length + 0.0001)
      if (lit === lastLit) return
      lastLit = lit
      nodeRefs.current.forEach((node, i) => {
        if (!node) return
        const on = i < Math.max(0, lit)
        node.style.background = on ? 'var(--color-pop-accent)' : 'var(--color-pop-surface-2)'
        node.style.color = on ? '#0b0b0f' : 'var(--color-pop-muted)'
      })
    }

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      paint(1)
      return
    }

    const measure = () => {
      const r = section.getBoundingClientRect()
      const span = r.height * 0.62
      paint(span > 0 ? (window.innerHeight * 0.82 - r.top) / span : 1)
    }

    // Driven by rAF while the section is on screen rather than by scroll events. Scroll events are
    // not emitted for every way a page can move (anchor jumps and programmatic scrolls among them),
    // and missing them would strand the rail at zero with every step dimmed. The observer pauses
    // the loop the moment the section leaves the viewport, so it costs nothing the rest of the time.
    measure()
    if (typeof IntersectionObserver === 'undefined') return

    let raf = 0
    const tick = () => {
      measure()
      raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(tick)
        } else if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { threshold: 0 },
    )
    io.observe(section)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
    }
  }, [])

  return (
    <section id="how-it-works" ref={sectionRef} style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
      <Reveal style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: mono, color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>HOW IT WORKS</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2rem, 4vw, 3.25rem)', margin: 0, letterSpacing: '0.02em', lineHeight: 0.98 }}>
            ONE LIFECYCLE, THREE GAMES
          </h2>
        </div>
        <p style={{ maxWidth: 360, fontSize: '0.9rem', lineHeight: 1.6, color: 'var(--color-pop-muted)', margin: 0 }}>
          Markets, 1v1 bets and parlays are different games running the same four steps on the same rails. Only how you take a position and how the payout is worked out change. Step three does not change at all.
        </p>
      </Reveal>

      <div className="hiw-track">
        <div className="hiw-rail" aria-hidden="true" />
        <div className="hiw-rail-fill" ref={lineRef} aria-hidden="true" />

        <div className="hiw-steps">
          {STEPS.map((step, i) => (
            <div className="hiw-step" key={step.title}>
              <div
                className="hiw-node"
                ref={(el) => { nodeRefs.current[i] = el }}
                aria-hidden="true"
              >
                {`0${i + 1}`}
              </div>
              <Reveal delay={i * 120} style={{ width: '100%', display: 'flex', flex: 1 }}>
                <div className={step.identical ? 'hiw-card hiw-card-shared' : 'hiw-card'}>
                  <StepIcon>{step.icon}</StepIcon>
                  <h3 style={{ margin: 0, fontFamily: 'var(--font-heading)', fontSize: '1.25rem', letterSpacing: '0.02em', color: 'var(--color-pop-text)' }}>{step.title}</h3>
                  <p className="hiw-shared">{step.shared}</p>

                  {step.modes && <ModeRows modes={step.modes} />}

                  {step.identical && (
                    <div className="hiw-identical">
                      <div style={{ fontFamily: mono, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--color-pop-accent)' }}>
                        SAME AGENT, SAME SOURCES, ALL THREE GAMES
                      </div>
                    </div>
                  )}
                </div>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
