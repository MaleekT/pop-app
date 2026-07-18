'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Reveal } from '@/components/home/Reveal'
import { UserIcon, LockIcon, ShieldIcon, CodeIcon, EyeIcon } from '@/components/home/icons'

// The claim is general (no human decides an outcome anywhere on POP); the stepper is one worked
// example, labelled as such, because an escrow with two named sides only exists in a 1v1.
//
// The markets half of the fairness story is the sponsor rule, and it is the strongest proof here:
// sponsor() adds to totalPot and sponsored[] only (PredictMarket.sol:136-137) and never touches
// pool[]/poolSum, which is what poolInfo() derives the odds from (:257-259). So the owner can seed a
// market without being able to move its odds or take a side.
//
// The old copy claimed "No house" for the whole product, which stopped being true when parlays
// shipped (Parlay.sol:45 HOUSE_MARGIN_NUM = 90, a 10% edge). That exception is stated outright.
// The challenge window is 1 hour: Pop.sol:13.

const mono = 'var(--font-mono)'
const LINE_TOP = 30
const STAGE_MS = 1600

const PILLS: { icon: ReactNode; label: string }[] = [
  { icon: <LockIcon size={16} />, label: 'USDC stakes' },
  { icon: <ShieldIcon size={16} />, label: 'Non-custodial' },
  { icon: <CodeIcon size={16} />, label: 'Deterministic' },
  { icon: <EyeIcon size={16} />, label: 'Auditable' },
]

const STAGE_COUNT = 4

export function Fairness() {
  // Defaults to every stage lit, so reduced motion, a missing observer and no JS at all each land on
  // the complete picture rather than a half-drawn one. The cycle only starts once it is on screen.
  const [stage, setStage] = useState(STAGE_COUNT - 1)
  const cardRef = useRef<HTMLDivElement>(null)
  const lineRef = useRef<HTMLDivElement>(null)
  const stageRefs = useRef<Array<HTMLDivElement | null>>([])

  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const card = cardRef.current
    if (!card || typeof IntersectionObserver === 'undefined') return

    let timer: ReturnType<typeof setInterval> | undefined
    const stop = () => { if (timer) { clearInterval(timer); timer = undefined } }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!timer) {
            setStage(0)
            timer = setInterval(() => setStage((s) => (s + 1) % STAGE_COUNT), STAGE_MS)
          }
        } else {
          stop()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(card)
    return () => { stop(); io.disconnect() }
  }, [])

  // Grow the rail to the middle of the active stage. Measured rather than guessed so it stays
  // correct when the stage blocks wrap to different heights on narrow screens.
  useEffect(() => {
    const card = cardRef.current
    const el = stageRefs.current[stage]
    const line = lineRef.current
    if (!card || !el || !line) return
    const y = el.getBoundingClientRect().top - card.getBoundingClientRect().top + el.offsetHeight / 2
    line.style.height = `${Math.max(0, y - LINE_TOP)}px`
  }, [stage])

  const stageStyle = (i: number) => ({
    position: 'relative' as const,
    zIndex: 2,
    opacity: i <= stage ? 1 : 0.4,
    transition: 'opacity 0.45s ease',
  })

  return (
    <section style={{ borderTop: '1px solid var(--color-pop-surface-2)' }}>
      <div className="fairness-grid" style={{ maxWidth: 1200, margin: '0 auto', padding: '96px 32px' }}>
        <Reveal>
          <div style={{ fontFamily: mono, color: 'var(--color-pop-accent)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', marginBottom: 14 }}>FAIRNESS BY DESIGN</div>
          <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(2.25rem, 4vw, 3.5rem)', lineHeight: 0.95, letterSpacing: '0.02em', margin: '0 0 20px' }}>
            <span style={{ display: 'block', color: 'var(--color-pop-text)' }}>NO REFEREE.</span>
            <span style={{ display: 'block', color: 'var(--color-pop-accent)' }}>JUST THE MATH.</span>
          </h2>
          <p style={{ fontSize: '0.95rem', lineHeight: 1.65, color: 'var(--color-pop-muted)', maxWidth: 460, margin: '0 0 18px' }}>
            Wherever your stake sits, it sits in a contract, never with us. A 1v1 can only release to one of the two participants. A market pays the winning side out of its own pool. No person decides any of it.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 460, marginBottom: 26 }}>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-pop-muted)', margin: 0, paddingLeft: 14, borderLeft: '2px solid var(--color-pop-surface-2)' }}>
              The owner can seed a market so there is something to bet against, but seeding only adds to the prize pot. It never touches the pools the odds are calculated from, so it cannot move the odds or take a side.
            </p>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--color-pop-muted)', margin: 0, paddingLeft: 14, borderLeft: '2px solid var(--color-pop-surface-2)' }}>
              Markets and 1v1 bets take no cut at all. The one exception is parlays, which pay from a house pool that keeps a 10% edge.
            </p>
          </div>

          <div className="fair-pills">
            {PILLS.map((pill) => (
              <span
                key={pill.label}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: mono, fontSize: '0.78rem', fontWeight: 600, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-pop-surface-2)', padding: '11px 14px', borderRadius: 10 }}
              >
                <span style={{ color: 'var(--color-pop-accent)', display: 'inline-flex' }}>{pill.icon}</span>
                {pill.label}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div ref={cardRef} style={{ position: 'relative', background: 'var(--color-pop-surface)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 20, padding: '28px 28px 28px 44px' }}>
            <div aria-hidden="true" style={{ position: 'absolute', left: 30, top: LINE_TOP, bottom: 30, width: 2, background: 'var(--color-pop-surface-2)', borderRadius: 2 }} />
            <div ref={lineRef} aria-hidden="true" style={{ position: 'absolute', left: 30, top: LINE_TOP, width: 2, height: 0, background: 'var(--color-pop-accent)', borderRadius: 2, transition: 'height 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }} />

            <div style={{ fontFamily: mono, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', color: 'var(--color-pop-muted)', marginBottom: 14, position: 'relative', zIndex: 2 }}>WORKED EXAMPLE · 1V1 ESCROW</div>

            <div ref={(el) => { stageRefs.current[0] = el }} style={{ ...stageStyle(0), display: 'flex', gap: 12 }}>
              {[{ tint: 'var(--color-pop-accent)', label: 'You' }, { tint: '#FF3DA1', label: 'Friend' }].map((side) => (
                <div key={side.label} style={{ flex: 1, background: 'var(--color-pop-bg)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 12, padding: 14, textAlign: 'center' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: '50%', marginBottom: 8, color: side.tint, background: `color-mix(in srgb, ${side.tint} 16%, transparent)` }}>
                    <UserIcon size={16} />
                  </span>
                  <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '0.95rem' }}>$250</div>
                  <div style={{ fontFamily: mono, fontSize: '0.58rem', letterSpacing: '0.08em', color: 'var(--color-pop-muted)' }}>{side.label.toUpperCase()} STAKES</div>
                </div>
              ))}
            </div>

            <div ref={(el) => { stageRefs.current[1] = el }} style={{ ...stageStyle(1), margin: '14px 0', background: 'var(--color-pop-bg)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.06em', color: 'var(--color-pop-accent)' }}>ESCROW · LOCKED</div>
                <div style={{ fontFamily: mono, fontSize: '0.62rem', color: 'var(--color-pop-muted)', marginTop: 3 }}>Neither side can withdraw</div>
              </div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '1.3rem' }}>$500</div>
            </div>

            <div ref={(el) => { stageRefs.current[2] = el }} style={{ ...stageStyle(2), margin: '14px 0', background: 'var(--color-pop-bg)', border: '1px solid var(--color-pop-surface-2)', borderRadius: 12, padding: '14px 16px' }}>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.06em', color: 'var(--color-pop-text)', marginBottom: 8 }}>RESOLVER</div>
              <div style={{ fontFamily: mono, fontSize: '0.64rem', lineHeight: 1.6, color: 'var(--color-pop-muted)' }}>
                Reads the bound public source, proposes a winner, then a 1 hour challenge window.
              </div>
            </div>

            <div ref={(el) => { stageRefs.current[3] = el }} style={{ ...stageStyle(3), background: 'rgba(215,255,30,0.08)', border: '1px solid rgba(215,255,30,0.3)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '0.68rem', letterSpacing: '0.06em', color: 'var(--color-pop-accent)' }}>WINNER CLAIMS</div>
                <div style={{ fontFamily: mono, fontSize: '0.62rem', color: 'var(--color-pop-muted)', marginTop: 3 }}>Full pot, no fees</div>
              </div>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: '1.3rem', color: 'var(--color-pop-accent)' }}>$500</div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
