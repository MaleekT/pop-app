'use client'

import { useEffect, useRef } from 'react'

// Interactive dot-field behind the hero. Ported from the design export. Governed for cost:
//  - never runs under prefers-reduced-motion (draws a single static rest frame)
//  - pauses itself (stops requesting frames) once the pointer has been idle and the field has
//    settled, and wakes on the next pointer move / press
// It is mounted by Hero on desktop only, so it never runs on phones.

const IDLE_STOP_MS = 1500

export function HeroCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    let w = 0, h = 0, dpr = 1
    const gap = 25, baseR = 1.4
    const R = 230, R2 = R * R
    const PUSH = 190, PUSH2 = PUSH * PUSH
    let cols = 0, rows = 0
    let px: number[] = [], py: number[] = []
    let en!: Float32Array, ox!: Float32Array, oy!: Float32Array, vx!: Float32Array, vy!: Float32Array

    const build = () => {
      cols = Math.ceil(w / gap) + 2; rows = Math.ceil(h / gap) + 2
      px = new Array(cols); py = new Array(rows)
      for (let i = 0; i < cols; i++) px[i] = i * gap
      for (let j = 0; j < rows; j++) py[j] = j * gap
      const n = cols * rows
      en = new Float32Array(n); ox = new Float32Array(n); oy = new Float32Array(n)
      vx = new Float32Array(n); vy = new Float32Array(n)
    }
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1)
      const r = cv.getBoundingClientRect()
      w = r.width; h = r.height
      cv.width = Math.max(1, w * dpr); cv.height = Math.max(1, h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      build()
    }
    resize()
    const ro = new ResizeObserver(resize); ro.observe(cv)

    const drawRest = () => {
      ctx.clearRect(0, 0, w, h)
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        ctx.beginPath(); ctx.arc(px[i], py[j], baseR, 0, 6.2832)
        ctx.fillStyle = 'rgba(215,255,30,0.07)'; ctx.fill()
      }
    }

    if (reduce) {
      drawRest()
      return () => ro.disconnect()
    }

    const mouse = { x: -9999, y: -9999, on: false, spd: 0 }
    let lastActive = -9999
    let running = true
    let raf = 0
    const shocks: { x: number; y: number; t: number }[] = []
    const host = cv.parentElement || cv
    let prevX = 0, prevY = 0, prevT = 0

    const kick = () => {
      lastActive = performance.now()
      if (!running) { running = true; raf = requestAnimationFrame(draw) }
    }
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const nx = e.clientX - r.left, ny = e.clientY - r.top
      const now = performance.now(), dt = Math.max(8, now - prevT)
      const inst = Math.hypot(nx - prevX, ny - prevY) / dt * 16
      mouse.spd = mouse.spd * 0.7 + Math.min(60, inst) * 0.3
      prevX = nx; prevY = ny; prevT = now
      mouse.x = nx; mouse.y = ny; mouse.on = true
      kick()
    }
    const onLeave = () => { mouse.on = false; mouse.spd = 0; mouse.x = -9999; mouse.y = -9999 }
    const onDown = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      shocks.push({ x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() })
      if (shocks.length > 4) shocks.shift()
      kick()
    }
    host.addEventListener('pointermove', onMove)
    host.addEventListener('pointerleave', onLeave)
    host.addEventListener('pointerdown', onDown)

    const SHOCK_SPD = 0.9
    const draw = (now: number) => {
      ctx.clearRect(0, 0, w, h)
      mouse.spd *= 0.92
      const gain = mouse.on ? 1 : 0
      const mx = mouse.x, my = mouse.y

      if (mouse.on && gain > 0) {
        const br = R * (0.85 + mouse.spd / 90)
        const bloom = ctx.createRadialGradient(mx, my, 0, mx, my, br)
        const peak = 0.05 + mouse.spd / 260
        bloom.addColorStop(0, 'rgba(215,255,30,' + peak.toFixed(3) + ')')
        bloom.addColorStop(0.5, 'rgba(215,255,30,' + (peak * 0.28).toFixed(3) + ')')
        bloom.addColorStop(1, 'rgba(215,255,30,0)')
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(mx, my, br, 0, 6.2832); ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }

      let maxEnergy = 0
      for (let i = 0; i < cols; i++) {
        const bx = px[i]
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j
          const by = py[j]
          let target = 0, ax = 0, ay = 0
          if (mouse.on && gain > 0) {
            const dx = bx - mx, dy = by - my, d2 = dx * dx + dy * dy
            if (d2 < R2) { const f = 1 - Math.sqrt(d2) / R; target = f * f }
            if (d2 < PUSH2 && d2 > 0.5) {
              const d = Math.sqrt(d2), f = 1 - d / PUSH
              const force = f * f * (14 + mouse.spd * 0.5)
              ax += (dx / d) * force; ay += (dy / d) * force
            }
          }
          for (let s = 0; s < shocks.length; s++) {
            const sh = shocks[s], age = now - sh.t, front = age * SHOCK_SPD
            const dx = bx - sh.x, dy = by - sh.y, d = Math.hypot(dx, dy) || 1
            const band = Math.abs(d - front)
            if (band < 46 && age < 900) {
              const p = (1 - band / 46) * (1 - age / 900) * 26
              ax += (dx / d) * p; ay += (dy / d) * p
              const boost = (1 - band / 46) * (1 - age / 900)
              if (boost > target) target = boost
            }
          }
          vx[idx] = (vx[idx] + ax * 0.16 - ox[idx] * 0.09) * 0.82
          vy[idx] = (vy[idx] + ay * 0.16 - oy[idx] * 0.09) * 0.82
          ox[idx] += vx[idx]; oy[idx] += vy[idx]
          const e = en[idx]
          const rate = target > e ? 0.16 : 0.05
          en[idx] = e + (target - e) * rate
          if (en[idx] > maxEnergy) maxEnergy = en[idx]
        }
      }

      const THR = 0.14
      ctx.lineWidth = 1
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j, e = en[idx]
          if (e < THR) continue
          const ax = px[i] + ox[idx], ay = py[j] + oy[idx]
          if (i + 1 < cols) { const n = (i + 1) * rows + j, e2 = en[n]
            if (e2 > THR) { const m = Math.min(e, e2)
              ctx.strokeStyle = 'rgba(215,255,30,' + (m * 0.5).toFixed(3) + ')'
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px[i + 1] + ox[n], py[j] + oy[n]); ctx.stroke() } }
          if (j + 1 < rows) { const n = i * rows + (j + 1), e2 = en[n]
            if (e2 > THR) { const m = Math.min(e, e2)
              ctx.strokeStyle = 'rgba(215,255,30,' + (m * 0.5).toFixed(3) + ')'
              ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px[i] + ox[n], py[j + 1] + oy[n]); ctx.stroke() } }
        }
      }

      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const idx = i * rows + j, v = en[idx]
          const cx = px[i] + ox[idx], cy = py[j] + oy[idx]
          const rr = baseR * (1 + v * 1.0) + v * v * 2.2
          if (v > 0.06) {
            ctx.shadowColor = 'rgba(215,255,30,0.95)'; ctx.shadowBlur = 6 + v * 22
            const g = 255, rC = (215 + v * 40) | 0, bC = (30 + v * v * 210) | 0
            ctx.fillStyle = 'rgba(' + rC + ',' + g + ',' + bC + ',' + (0.28 + v * 0.72).toFixed(3) + ')'
          } else {
            ctx.shadowBlur = 0
            ctx.fillStyle = 'rgba(215,255,30,' + (0.07 + v * 0.5).toFixed(3) + ')'
          }
          ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.2832); ctx.fill()
        }
      }
      ctx.shadowBlur = 0

      for (let s = shocks.length - 1; s >= 0; s--) {
        const sh = shocks[s], age = now - sh.t, p = age / 900
        if (p >= 1) { shocks.splice(s, 1); continue }
        ctx.beginPath(); ctx.arc(sh.x, sh.y, age * SHOCK_SPD, 0, 6.2832)
        ctx.strokeStyle = 'rgba(215,255,30,' + ((1 - p) * 0.4).toFixed(3) + ')'
        ctx.lineWidth = 2.2 * (1 - p); ctx.stroke()
      }

      if (mouse.on && gain > 0) {
        ctx.shadowColor = 'rgba(215,255,30,1)'; ctx.shadowBlur = 16
        ctx.fillStyle = 'rgba(240,255,180,' + (0.7 * gain).toFixed(3) + ')'
        ctx.beginPath(); ctx.arc(mx, my, 2.6, 0, 6.2832); ctx.fill()
        ctx.shadowBlur = 0
      }

      // Idle pause: once the pointer has been away and the field has relaxed, stop scheduling
      // frames and leave the static rest grid. A pointer move / press calls kick() to resume.
      const idleFor = now - lastActive
      if (!mouse.on && shocks.length === 0 && idleFor > IDLE_STOP_MS && maxEnergy < 0.02) {
        running = false
        drawRest()
        return
      }
      raf = requestAnimationFrame(draw)
    }

    raf = requestAnimationFrame(draw)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      host.removeEventListener('pointermove', onMove)
      host.removeEventListener('pointerleave', onLeave)
      host.removeEventListener('pointerdown', onDown)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', opacity: 0.9 }}
    />
  )
}
