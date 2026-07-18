'use client'

import { useEffect, useRef } from 'react'

// The 1v1 protocol as a small network: both stakes flow into escrow, the resolver reads a public
// source, and the pot releases to the winner. Ported from the design export with two changes:
// the active node glow is steady rather than sinusoidal (no pulsing indicators), and the loop
// pauses whenever the canvas is off screen. Static single frame under reduced motion.

interface Node {
  x: number
  y: number
  r: number
  label: string
  sub: string
  color: string
}

const NODES: Node[] = [
  { x: 0.24, y: 0.15, r: 19, label: 'YOU', sub: '$250', color: '#D7FF1E' },
  { x: 0.76, y: 0.15, r: 19, label: 'FRIEND', sub: '$250', color: '#FF3DA1' },
  { x: 0.5, y: 0.44, r: 26, label: 'ESCROW', sub: '$500', color: '#D7FF1E' },
  { x: 0.5, y: 0.7, r: 19, label: 'RESOLVER', sub: 'agent', color: '#F5F5F7' },
  { x: 0.5, y: 0.9, r: 15, label: 'SOURCE', sub: 'public', color: '#8FB4FF' },
]

const EDGES: [number, number][] = [[0, 2], [1, 2], [4, 3], [3, 2]]
const CYCLE_MS = 6600

export function ProtocolCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const family = getComputedStyle(cv).getPropertyValue('--font-space').trim() || 'sans-serif'
    let w = 0
    let h = 0

    const size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = cv.getBoundingClientRect()
      w = r.width
      h = r.height
      cv.width = Math.max(1, w * dpr)
      cv.height = Math.max(1, h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    size()
    const ro = new ResizeObserver(size)
    ro.observe(cv)

    const mouse = { x: -999, y: -999 }
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      mouse.x = e.clientX - r.left
      mouse.y = e.clientY - r.top
    }
    const onLeave = () => { mouse.x = -999; mouse.y = -999 }
    cv.addEventListener('pointermove', onMove)
    cv.addEventListener('pointerleave', onLeave)

    const at = (n: Node) => ({ x: n.x * w, y: n.y * h })

    const packet = (a: number, b: number, progress: number) => {
      const pa = at(NODES[a])
      const pb = at(NODES[b])
      ctx.beginPath()
      ctx.arc(pa.x + (pb.x - pa.x) * progress, pa.y + (pb.y - pa.y) * progress, 4, 0, 6.2832)
      ctx.fillStyle = '#D7FF1E'
      ctx.shadowColor = '#D7FF1E'
      ctx.shadowBlur = 12
      ctx.fill()
      ctx.shadowBlur = 0
    }

    const draw = (now: number) => {
      const t = (now % CYCLE_MS) / CYCLE_MS
      ctx.clearRect(0, 0, w, h)

      for (const [a, b] of EDGES) {
        const pa = at(NODES[a])
        const pb = at(NODES[b])
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.strokeStyle = 'rgba(255,255,255,0.1)'
        ctx.lineWidth = 1.4
        ctx.stroke()
      }

      // Stakes in, source read, verdict to escrow, pot out to the winner.
      let active = -1
      if (t < 0.28) { const p = t / 0.28; packet(0, 2, p); packet(1, 2, p); active = 2 }
      else if (t < 0.42) { active = 2 }
      else if (t < 0.6) { packet(4, 3, (t - 0.42) / 0.18); active = 3 }
      else if (t < 0.8) { packet(3, 2, (t - 0.6) / 0.2); active = 2 }
      else { packet(2, 0, (t - 0.8) / 0.2); active = 0 }

      NODES.forEach((n, i) => {
        const p = at(n)
        const near = Math.max(0, 1 - Math.hypot(p.x - mouse.x, p.y - mouse.y) / 120)
        const glow = Math.max(near, i === active ? 0.75 : 0)

        ctx.beginPath()
        ctx.arc(p.x, p.y, n.r + glow * 5, 0, 6.2832)
        ctx.fillStyle = '#14161d'
        ctx.strokeStyle = n.color
        ctx.lineWidth = 1.4 + glow * 1.6
        ctx.shadowColor = n.color
        ctx.shadowBlur = glow * 18
        ctx.fill()
        ctx.stroke()
        ctx.shadowBlur = 0

        ctx.textAlign = 'center'
        ctx.fillStyle = n.color
        ctx.font = `700 9px ${family}, sans-serif`
        ctx.fillText(n.label, p.x, p.y - 1)
        ctx.fillStyle = 'rgba(245,245,247,0.6)'
        ctx.font = `600 8px ${family}, sans-serif`
        ctx.fillText(n.sub, p.x, p.y + 9)
      })
    }

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0)
      return () => {
        ro.disconnect()
        cv.removeEventListener('pointermove', onMove)
        cv.removeEventListener('pointerleave', onLeave)
      }
    }

    let raf = 0
    const loop = (now: number) => { draw(now); raf = requestAnimationFrame(loop) }

    // Only animate while visible.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!raf) raf = requestAnimationFrame(loop)
        } else if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      },
      { threshold: 0.1 },
    )
    io.observe(cv)

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      cv.removeEventListener('pointermove', onMove)
      cv.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', background: 'radial-gradient(120% 90% at 50% 0%, #141822, #0b0b0f)' }}
    />
  )
}
