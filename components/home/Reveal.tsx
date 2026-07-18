'use client'

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react'

interface RevealProps {
  children: ReactNode
  /** Stagger, in ms, applied to the transition. */
  delay?: number
  className?: string
  style?: CSSProperties
}

// Scroll-reveal for the lower homepage sections. One-shot: once an element appears it stays.
//
// The hidden state is opt-in, applied by JS via data-armed, so the default is VISIBLE. Without
// JavaScript, without IntersectionObserver, or under prefers-reduced-motion, the content simply
// shows. Content that is invisible unless a script succeeds is the one failure mode worth designing
// out. Nothing here calls setState, so a scroll-reveal never triggers a React re-render.
export function Reveal({ children, delay = 0, className, style }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

    el.dataset.armed = 'true'
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.shown = 'true'
            io.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.15 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={className ? `home-reveal ${className}` : 'home-reveal'}
      style={{ ...style, ['--reveal-delay' as string]: `${delay}ms` }}
    >
      {children}
    </div>
  )
}
