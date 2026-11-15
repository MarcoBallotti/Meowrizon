/**
 * Compact view from one compared site. Lighter than HorizonScene: no labels
 * or controls, because the compare screen drives every window from one clock
 * and one view switch.
 *
 * - 'circle': all 360° facing the same way, on a vertical scale shared by all
 *   windows, so a higher ridge really looks higher. Heights are stretched and
 *   the Sun and Earth are drawn larger than life.
 * - 'sun': each window faces its own Sun at true proportions.
 * The far ridge is the engine's terrain horizon H(az); nearer hills are
 * decoration kept below it, so they never hide what the engine says is seen.
 */
import { useMemo } from 'react'
import type { HorizonProfile, ScenarioEvaluation } from '../api/types'
import { compass } from '../domain/format'
import { bodyAt } from '../domain/sampling'
import { angularSeparation, azDelta, EARTH_DIAMETER_DEG, earthLitFraction, horizonAt, SUN_DIAMETER_DEG } from '../domain/sky'
import { useElementSize } from '../hooks'
import type { Audience, CompareView } from '../state/store'
import { phasePath } from '../ui'

const DEG = Math.PI / 180
const FOLLOW_FOV = 40

interface Props {
  profile: HorizonProfile
  evaluation: ScenarioEvaluation
  cursorMs: number
  audience: Audience
  view: CompareView
  /** Shared elevation range for the full-circle view. */
  scale: { lo: number; hi: number }
  /** Direction in the middle of the full-circle view, the same for every window. */
  facingAz: number
  /** Dots tracing the Sun and Earth over the period (full circle only). */
  trails?: boolean
}

function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeRelief(seed: number) {
  const rand = seeded(seed)
  const waves = Array.from({ length: 6 }, (_, i) => ({ k: 3 + i * 4 + Math.floor(rand() * 3), amp: 1 / (i + 1.4), ph: rand() * Math.PI * 2 }))
  const norm = waves.reduce((s, w) => s + w.amp, 0)
  return (az: number) => waves.reduce((s, w) => s + w.amp * Math.sin(w.k * az * DEG + w.ph), 0) / norm
}

function geometry(circle: boolean, w: number, h: number, scale: { lo: number; hi: number }, facingAz: number, sunAz: number, sunEl: number, profile: HorizonProfile) {
  if (circle) return { centerAz: facingAz, pxX: w / 360, pxY: h / (scale.hi - scale.lo), elTop: scale.hi }
  const pxX = w / FOLLOW_FOV
  const span = h / pxX
  const vals: number[] = []
  for (let i = 0; i <= 20; i++) vals.push(horizonAt(profile, sunAz - FOLLOW_FOV / 2 + (FOLLOW_FOV * i) / 20))
  vals.sort((a, b) => a - b)
  let elTop = vals[10] + span * 0.62
  if (sunEl > elTop - span * 0.12) elTop = sunEl + span * 0.2
  return { centerAz: sunAz, pxX, pxY: pxX, elTop }
}

export function CompareWindow({ profile, evaluation, cursorMs, audience, view, scale, facingAz, trails = audience === 'planner' }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const w = size.width
  const h = size.height
  const { latDeg, lonEastDeg } = profile.observer.site
  const seed = Math.round(latDeg * 1000) * 7919 + Math.round(lonEastDeg * 1000)
  const relief = useMemo(() => [makeRelief(seed), makeRelief(seed + 17)], [seed])
  const stars = useMemo(() => {
    const rand = seeded(seed ^ 0x9e3779b9)
    return Array.from({ length: 120 }, () => ({ az: rand() * 360, el: -2 + rand() * 60, r: 0.5 + rand() * 0.8, o: 0.2 + rand() * 0.4 }))
  }, [seed])

  const sun = bodyAt(evaluation, evaluation.sun, evaluation.intervals.sun, cursorMs)
  const earth = bodyAt(evaluation, evaluation.earth, evaluation.intervals.earth, cursorMs)
  const circle = view === 'circle'

  // ------------------------------------------------------------ geometry
  const { centerAz, pxX, pxY, elTop } = geometry(circle, w, h, scale, facingAz, sun.azimuthDeg, sun.elevationDeg, profile)
  const X = (az: number) => w / 2 + azDelta(az, centerAz) * pxX
  const Y = (el: number) => (elTop - el) * pxY

  const terrain = useMemo(() => {
    if (w <= 0 || h <= 0) return null
    const n = Math.ceil(w / 3)
    const far: [number, number][] = []
    let floor = 0
    for (let i = 0; i <= n; i++) {
      const px = (w * i) / n
      const py = (elTop - horizonAt(profile, centerAz + (px - w / 2) / pxX)) * pxY
      far.push([px, py])
      floor = Math.max(floor, py)
    }
    const room = Math.max(24, h - floor)
    const layer = (k: number, base: number, amp: number, above: [number, number][], gap: number) =>
      above.map(([px, py]) => [px, Math.max(py + gap, floor + room * base + room * amp * relief[k](centerAz + (px - w / 2) / pxX))] as [number, number])
    const mid = layer(0, 0.28, 0.1, far, 4)
    const near = layer(1, 0.62, 0.1, mid, 6)
    const line = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
    const area = (pts: [number, number][]) => `${line(pts)} L${w} ${h} L0 ${h} Z`
    return { farLine: line(far), farArea: area(far), midArea: area(mid), nearArea: area(near) }
  }, [profile, centerAz, pxX, pxY, elTop, w, h, relief])

  // The Sun's and Earth's paths over the period, as dots (full circle only).
  const [sunPath, earthPath] = useMemo(() => {
    if (!circle || !trails || w <= 0) return ['', '']
    const step = Math.max(1, Math.floor(evaluation.timesMs.length / 360))
    const trace = (az: number[], el: number[]) => {
      let d = ''
      for (let i = 0; i < evaluation.timesMs.length; i += step) {
        const x = w / 2 + azDelta(az[i], centerAz) * pxX
        const y = (elTop - el[i]) * pxY
        if (y > 0 && y < h) d += `M${x.toFixed(1)} ${y.toFixed(1)}h0.01`
      }
      return d
    }
    return [trace(evaluation.sun.azimuthDeg, evaluation.sun.elevationDeg), trace(evaluation.earth.azimuthDeg, evaluation.earth.elevationDeg)]
  }, [circle, trails, evaluation, centerAz, pxX, pxY, elTop, w, h])

  const sx = X(sun.azimuthDeg)
  const sy = Y(sun.elevationDeg)
  const ex = X(earth.azimuthDeg)
  const ey = Y(earth.elevationDeg)
  const sunR = circle ? 5 : Math.max(3, (sun.angularRadiusDeg ?? SUN_DIAMETER_DEG / 2) * pxY)
  const earthR = circle ? 7 : Math.max(4, (earth.angularRadiusDeg ?? EARTH_DIAMETER_DEG / 2) * pxY)
  const lit = earth.illuminatedFraction ?? earthLitFraction(angularSeparation(sun.azimuthDeg, sun.elevationDeg, earth.azimuthDeg, earth.elevationDeg))
  const litAngle = (Math.atan2(sy - ey, sx - ex) * 180) / Math.PI

  const marks = circle
    ? [0, 90, 180, 270]
    : [0, 45, 90, 135, 180, 225, 270, 315]
  const above = [
    { body: 'Sun', x: sx, y: sy, r: sunR, el: sun.elevationDeg, fill: 'var(--sun)' },
    { body: 'Earth', x: ex, y: ey, r: earthR, el: earth.elevationDeg, fill: 'var(--earth-sky)' },
  ].filter((b) => b.y < b.r + 4 && b.x > -b.r && b.x < w + b.r)

  return (
    <div className="hc-scene" ref={ref}>
      {w > 0 && h > 0 && terrain && (
        <svg width={w} height={h} aria-hidden="true">
          <rect width={w} height={h} fill="var(--space)" />
          {stars.map((s, i) => {
            const px = X(s.az)
            const py = Y(s.el)
            if (px < 0 || px > w || py < 0 || py > h) return null
            return <circle key={i} cx={px} cy={py} r={s.r} fill="#ffffff" opacity={s.o * (sun.visible ? 0.55 : 1)} />
          })}
          {sunPath && <path d={sunPath} className="hc-sun-path" />}
          {earthPath && <path d={earthPath} className="hc-earth-path" />}

          {/* Bodies before terrain, so the terrain hides them for real. */}
          <circle cx={sx} cy={sy} r={sunR} fill="var(--sun)" />
          <circle cx={ex} cy={ey} r={earthR} fill="var(--earth-night)" />
          <path d={phasePath(earthR, lit)} fill="var(--earth-sky)" transform={`translate(${ex} ${ey}) rotate(${litAngle})`} />

          <path d={terrain.farArea} fill="var(--rock-far-top)" />
          <path d={terrain.farLine} fill="none" stroke="var(--space-ink-2)" strokeOpacity={0.7} strokeWidth={1} strokeLinejoin="round" />
          <path d={terrain.midArea} fill="var(--rock-mid-top)" />
          <path d={terrain.nearArea} fill="var(--rock-near-top)" />

          {/* Hidden bodies: a faint outline where the terrain covers them. */}
          {!sun.visible && sy > 0 && sy < h && <circle cx={sx} cy={sy} r={Math.max(sunR, 5)} className="hc-ghost is-sun" />}
          {!earth.visible && ey > 0 && ey < h && <circle cx={ex} cy={ey} r={Math.max(earthR, 6)} className="hc-ghost is-earth" />}

          <g className="hc-compass">
            {marks.map((a) => {
              const px = X(a)
              if (px < 16 || px > w - 16) return null
              return (
                <text key={a} x={px} y={h - 8} textAnchor="middle">
                  {compass(a)}
                </text>
              )
            })}
          </g>

          {above.map((b) => {
            const x = Math.max(48, Math.min(w - 48, b.x))
            return (
              <g key={b.body} className="hc-above">
                <path d={`M${x} 6 L${x - 5} 14 L${x + 5} 14 Z`} fill={b.fill} />
                <text x={x} y={30} textAnchor="middle">
                  {b.body} {Math.round(b.el)}° up
                </text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
