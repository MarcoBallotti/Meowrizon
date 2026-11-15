/**
 * Loading state for a widget: the widget's shape fills with 16 px tiles as
 * the calculation advances, then the tiles fade and the content shows.
 * Tiles follow real progress; reduced motion shows a static fill.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface BuildingProps {
  /** True while the data behind this widget is being computed. */
  busy: boolean
  /** 0..1, real progress of the calculation. */
  progress: number
  /** What is being computed, in plain words. */
  phase?: string
  tone?: 'light' | 'dark'
  /** Height to hold while there is nothing to show yet. */
  minHeight?: number
  className?: string
  children?: ReactNode
}

const CELL = 16
const TILE = 14

export function Building({ busy, progress, phase, tone = 'light', minHeight = 160, className, children }: BuildingProps) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const target = useRef(progress)
  const [overlay, setOverlay] = useState(busy)
  const [fading, setFading] = useState(false)
  const empty = children === undefined || children === null || children === false

  useEffect(() => {
    target.current = progress
  }, [progress])

  // Keep the tiles a moment after the data arrives, so they can fade.
  useEffect(() => {
    if (busy) {
      setOverlay(true)
      setFading(false)
      return
    }
    setFading(true)
    const t = window.setTimeout(() => setOverlay(false), 260)
    return () => window.clearTimeout(t)
  }, [busy])

  useEffect(() => {
    if (!overlay) return
    const el = host.current
    const cv = canvas.current
    if (!el || !cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const color = tone === 'dark' ? '#2a2e3d' : '#e6e8ef'
    let thresholds: number[] = []
    let cols = 0
    let rows = 0
    let shown = reduced ? 1 : 0
    let raf = 0

    const layout = () => {
      const r = el.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      cv.style.width = `${r.width}px`
      cv.style.height = `${r.height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cols = Math.ceil(r.width / CELL)
      rows = Math.ceil(r.height / CELL)
      // Deterministic scatter so the pattern does not flicker on resize.
      thresholds = Array.from({ length: cols * rows }, (_, i) => {
        const x = Math.sin(i * 12.9898 + cols * 78.233) * 43758.5453
        return x - Math.floor(x)
      })
    }
    const draw = () => {
      const goal = reduced ? 1 : Math.max(0.04, Math.min(1, target.current))
      shown += (goal - shown) * 0.12
      ctx.clearRect(0, 0, cols * CELL, rows * CELL)
      ctx.fillStyle = color
      for (let i = 0; i < thresholds.length; i++) {
        if (thresholds[i] > shown) continue
        ctx.fillRect((i % cols) * CELL + 1, Math.floor(i / cols) * CELL + 1, TILE, TILE)
      }
      raf = requestAnimationFrame(draw)
    }
    layout()
    const ro = new ResizeObserver(layout)
    ro.observe(el)
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [overlay, tone])

  return (
    <div
      ref={host}
      className={['ui-building', `is-${tone}`, overlay && 'is-busy', empty && 'is-empty', className].filter(Boolean).join(' ')}
      style={empty ? { minHeight } : undefined}
      aria-busy={busy}
    >
      {!empty && <div className={`ui-building-content${overlay && !fading ? ' is-hidden' : ''}`}>{children}</div>}
      {overlay && (
        <div className={`ui-building-overlay${fading ? ' is-fading' : ''}`} aria-hidden={!busy}>
          <canvas ref={canvas} />
          {phase && busy && (
            <span className="ui-building-phase" role="status">
              {phase}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
