/**
 * First-person view of the sky from the site.
 *
 * - The far ridge is the engine's terrain horizon H(az), drawn exactly.
 * - Nearer hills are decoration and always stay below H(az), so they never
 *   hide anything the engine says is visible.
 * - Sun and Earth are drawn at their true apparent size on the same angular
 *   scale as the terrain. The 360° panorama stretches heights and says so.
 */
import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import type { HorizonProfile, ScenarioEvaluation } from '../api/types'
import { compass, compassWord, formatAngle, formatSignedAngle } from '../domain/format'
import { bodyAt, type BodyAtTime } from '../domain/sampling'
import { angularSeparation, azDelta, EARTH_DIAMETER_DEG, earthLitFraction, SUN_DIAMETER_DEG } from '../domain/sky'
import { useElementSize } from '../hooks'
import type { Audience } from '../state/store'
import { phasePath, Segmented, Toggle } from '../ui'

type Look = 'sun' | 'earth' | 'both' | 'free'
type Lens = 'eye' | 'wide' | 'panorama'

const LENS_FOV: Record<Lens, number> = { eye: 46, wide: 110, panorama: 360 }
const PANORAMA_STRETCH = 4
const DEG = Math.PI / 180

interface Props {
  profile: HorizonProfile
  evaluation: ScenarioEvaluation
  cursorMs: number
  audience: Audience
}

function horizonAt(profile: HorizonProfile, az: number): number {
  const { azimuthDeg: azs, elevationDeg: hs } = profile
  const step = 360 / azs.length
  const x = ((((az % 360) + 360) % 360) / step) % azs.length
  const i = Math.floor(x)
  const j = (i + 1) % azs.length
  const f = x - i
  return hs[i] * (1 - f) + hs[j] * f
}

/** Deterministic decorative relief, keyed by azimuth so it turns with the view. */
function makeRelief(seed: number) {
  let a = seed >>> 0
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const waves = Array.from({ length: 6 }, (_, i) => ({ k: 2 + i * 3 + Math.floor(rand() * 3), amp: 1 / (i + 1.4), ph: rand() * Math.PI * 2 }))
  const norm = waves.reduce((s, w) => s + w.amp, 0)
  return (az: number) => waves.reduce((s, w) => s + w.amp * Math.sin(w.k * az * DEG + w.ph), 0) / norm
}

function makeStars(seed: number) {
  let a = (seed ^ 0x9e3779b9) >>> 0
  const rand = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
  return Array.from({ length: 160 }, () => ({ az: rand() * 360, el: -2 + rand() * 70, r: 0.6 + rand() * 0.9, o: 0.18 + rand() * 0.4 }))
}

function niceStep(spanDeg: number): number {
  const raw = spanDeg / 6
  return [0.5, 1, 2, 5, 10, 15, 30].find((s) => s >= raw) ?? 30
}

interface View {
  w: number
  h: number
  centerAz: number
  pxX: number
  pxY: number
  elTop: number
  x: (az: number) => number
  y: (el: number) => number
}

export function HorizonScene({ profile, evaluation, cursorMs, audience }: Props) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const [look, setLook] = useState<Look>('sun')
  const [lens, setLens] = useState<Lens>('eye')
  const [freeAz, setFreeAz] = useState(0)
  const [showPaths, setShowPaths] = useState(true)
  const drag = useRef<{ x: number; az: number } | null>(null)

  const sun = bodyAt(evaluation, evaluation.sun, evaluation.intervals.sun, cursorMs)
  const earth = bodyAt(evaluation, evaluation.earth, evaluation.intervals.earth, cursorMs)

  const seed = Math.round(profile.observer.site.latDeg * 1000) * 7919 + Math.round(profile.observer.site.lonEastDeg * 1000)
  const relief = useMemo(() => [makeRelief(seed), makeRelief(seed + 17)], [seed])
  const stars = useMemo(() => makeStars(seed), [seed])

  // ------------------------------------------------------------ view geometry
  const w = size.width
  const h = size.height
  const panorama = lens === 'panorama'
  const sepAz = Math.abs(azDelta(earth.azimuthDeg, sun.azimuthDeg))
  let fov = LENS_FOV[lens]
  let centerAz: number
  if (panorama) {
    centerAz = look === 'free' ? freeAz : profile.observer.site.latDeg < 0 ? 0 : 180
  } else if (look === 'sun') centerAz = sun.azimuthDeg
  else if (look === 'earth') centerAz = earth.azimuthDeg
  else if (look === 'both') {
    centerAz = sun.azimuthDeg + azDelta(earth.azimuthDeg, sun.azimuthDeg) / 2
    fov = Math.min(170, Math.max(fov, sepAz + 36))
  } else centerAz = freeAz

  const pxX = w / fov
  const pxY = panorama ? pxX * PANORAMA_STRETCH : pxX

  // Place the median visible horizon at ~62% of the height, then make room
  // for the body we are following.
  const hRef = (() => {
    const vals: number[] = []
    for (let i = 0; i <= 40; i++) vals.push(horizonAt(profile, centerAz - fov / 2 + (fov * i) / 40))
    vals.sort((a, b) => a - b)
    return vals[20]
  })()
  const spanEl = h / pxY
  let elTop = hRef + spanEl * (panorama ? 0.72 : 0.62)
  const followed = look === 'sun' ? [sun] : look === 'earth' ? [earth] : look === 'both' ? [sun, earth] : []
  for (const b of followed) {
    if (b.elevationDeg > elTop - spanEl * 0.12) elTop = b.elevationDeg + spanEl * 0.2
  }

  const view: View = {
    w,
    h,
    centerAz,
    pxX,
    pxY,
    elTop,
    x: (az) => w / 2 + azDelta(az, centerAz) * pxX,
    y: (el) => (elTop - el) * pxY,
  }

  // ------------------------------------------------------------ terrain
  const terrain = useMemo(() => {
    if (w <= 0 || h <= 0) return null
    const n = Math.ceil(w / 3)
    const far: [number, number][] = []
    let floor = 0
    for (let i = 0; i <= n; i++) {
      const px = (w * i) / n
      const az = centerAz + (px - w / 2) / pxX
      const py = (elTop - horizonAt(profile, az)) * pxY
      far.push([px, py])
      floor = Math.max(floor, py)
    }
    const room = Math.max(40, h - floor)
    const layer = (k: number, base: number, amp: number, above: [number, number][], gap: number) =>
      above.map(([px, py]) => {
        const az = centerAz + (px - w / 2) / pxX
        const top = floor + room * base + room * amp * relief[k](az)
        return [px, Math.max(py + gap, top)] as [number, number]
      })
    const mid = layer(0, 0.24, 0.1, far, 6)
    const near = layer(1, 0.58, 0.12, mid, 8)
    const line = (pts: [number, number][]) => pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ')
    const area = (pts: [number, number][]) => `${line(pts)} L${w} ${h} L0 ${h} Z`
    return { farLine: line(far), farArea: area(far), midLine: line(mid), midArea: area(mid), nearLine: line(near), nearArea: area(near), floor }
  }, [profile, centerAz, pxX, pxY, elTop, w, h, relief])

  // ------------------------------------------------------------ paths over the period
  const paths = useMemo(() => {
    if (!showPaths || w <= 0) return null
    const build = (track: ScenarioEvaluation['sun']) => {
      const segs: string[] = []
      let cur: string[] = []
      let prevX: number | null = null
      for (let i = 0; i < evaluation.timesMs.length; i++) {
        const px = w / 2 + azDelta(track.azimuthDeg[i], centerAz) * pxX
        const py = (elTop - track.elevationDeg[i]) * pxY
        const out = px < -w * 0.2 || px > w * 1.2 || py < -h || py > h * 2
        if (out || (prevX !== null && Math.abs(px - prevX) > w / 2)) {
          if (cur.length > 1) segs.push(cur.join(' '))
          cur = []
          prevX = out ? null : px
          if (out) continue
        }
        cur.push(`${cur.length ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`)
        prevX = px
      }
      if (cur.length > 1) segs.push(cur.join(' '))
      return segs.join(' ')
    }
    return { sun: build(evaluation.sun), earth: build(evaluation.earth) }
  }, [showPaths, evaluation, centerAz, pxX, pxY, elTop, w, h])

  // ------------------------------------------------------------ interaction
  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, az: centerAz }
  }
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - drag.current.x
    if (Math.abs(dx) < 3 && look !== 'free') return
    setLook('free')
    setFreeAz((((drag.current.az - dx / pxX) % 360) + 360) % 360)
  }
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const step = (e.shiftKey ? 30 : 5) * (e.key === 'ArrowLeft' ? -1 : 1)
    setLook('free')
    setFreeAz((((centerAz + step) % 360) + 360) % 360)
  }

  // ------------------------------------------------------------ derived drawing values
  const sx = view.x(sun.azimuthDeg)
  const sy = view.y(sun.elevationDeg)
  const ex = view.x(earth.azimuthDeg)
  const ey = view.y(earth.elevationDeg)
  const sunR = Math.max(2.5, (SUN_DIAMETER_DEG / 2) * pxY)
  const earthR = Math.max(4, (EARTH_DIAMETER_DEG / 2) * pxY)
  const elongation = angularSeparation(sun.azimuthDeg, sun.elevationDeg, earth.azimuthDeg, earth.elevationDeg)
  const lit = earthLitFraction(elongation)
  const litAngle = (Math.atan2(sy - ey, sx - ex) * 180) / Math.PI
  const sunGlow = sun.visible ? 1 : Math.max(0, 1 + (sun.elevationDeg - sun.horizonDeg) / 2) * 0.6
  const rimWarm = sun.elevationDeg > -3 && Math.abs(sx - w / 2) < w * 0.9
  const spread = Math.max(80, 18 * pxX)
  const clamp01 = (v: number) => Math.max(0, Math.min(1, v))

  const grid = audience !== 'student'
  const yStep = niceStep(spanEl)
  const yTicks: number[] = []
  if (grid) for (let v = Math.ceil((elTop - spanEl) / yStep) * yStep; v <= elTop; v += yStep) yTicks.push(v)

  const azStep = audience === 'planner' ? (fov > 150 ? 30 : 10) : 45
  const azTicks: number[] = []
  for (let a = Math.ceil((centerAz - fov / 2) / azStep) * azStep; a <= centerAz + fov / 2; a += azStep) azTicks.push(a)

  const scaleNote = panorama
    ? `360° panorama · heights ×${PANORAMA_STRETCH}`
    : audience === 'student'
      ? 'Sun and Earth are drawn at their real size in the sky'
      : `True scale · 1° = ${pxX.toFixed(0)} px`

  const summary = `${profile.observer.site.latDeg.toFixed(2)}°, ${profile.observer.site.lonEastDeg.toFixed(2)}°. Sun ${sun.visible ? 'visible' : 'hidden by terrain'}, Earth ${earth.visible ? 'visible' : 'hidden by terrain'}.`

  return (
    <div className="scene" ref={ref}>
      {w > 0 && h > 0 && terrain && (
        <svg
          width={w}
          height={h}
          className="scene-svg"
          role="img"
          aria-label={`View from the site, looking ${compassWord(centerAz)}. ${summary} Drag or use the arrow keys to look around.`}
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onKeyDown={onKeyDown}
        >
          <defs>
            <radialGradient id="scene-sun-glow">
              <stop offset="0" stopColor="#FFE7A8" stopOpacity="0.55" />
              <stop offset="0.35" stopColor="#F5A300" stopOpacity="0.18" />
              <stop offset="1" stopColor="#F5A300" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="scene-far" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rock-far-top)" />
              <stop offset="1" stopColor="var(--rock-far-bottom)" />
            </linearGradient>
            <linearGradient id="scene-mid" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rock-mid-top)" />
              <stop offset="1" stopColor="var(--rock-mid-bottom)" />
            </linearGradient>
            <linearGradient id="scene-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--rock-near-top)" />
              <stop offset="1" stopColor="var(--rock-near-bottom)" />
            </linearGradient>
            <linearGradient id="scene-rim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={w} y2="0">
              {rimWarm ? (
                <>
                  <stop offset={clamp01((sx - spread * 3) / w)} stopColor="#7b7a96" />
                  <stop offset={clamp01((sx - spread) / w)} stopColor="#d9c7a0" />
                  <stop offset={clamp01(sx / w)} stopColor="#FFE3A3" />
                  <stop offset={clamp01((sx + spread) / w)} stopColor="#d9c7a0" />
                  <stop offset={clamp01((sx + spread * 3) / w)} stopColor="#7b7a96" />
                </>
              ) : (
                <stop offset="0" stopColor="#6f6e8a" />
              )}
            </linearGradient>
            <clipPath id="scene-earth-clip">
              <circle cx={ex} cy={ey} r={earthR} />
            </clipPath>
          </defs>

          <rect width={w} height={h} fill="var(--space)" />

          <g aria-hidden="true">
            {stars.map((s, i) => {
              const px = view.x(s.az)
              const py = view.y(s.el)
              if (px < 0 || px > w || py < 0 || py > terrain.floor) return null
              return <circle key={i} cx={px} cy={py} r={s.r} fill="#ffffff" opacity={s.o * (sun.visible ? 0.55 : 1)} />
            })}
          </g>

          {grid && (
            <g className="scene-grid" aria-hidden="true">
              {yTicks.map((v) => (
                <g key={v}>
                  <line x1={0} x2={w} y1={view.y(v)} y2={view.y(v)} className={v === 0 ? 'is-zero' : undefined} />
                  <text x={12} y={view.y(v) - 6} className="scene-grid-label">
                    {v === 0 ? 'Flat horizon 0°' : formatAngle(v, yStep < 1 ? 1 : 0)}
                  </text>
                </g>
              ))}
              {audience === 'planner' &&
                azTicks.map((a) => <line key={a} x1={view.x(a)} x2={view.x(a)} y1={0} y2={h} className="is-az" />)}
            </g>
          )}

          {paths && (
            <g aria-hidden="true">
              <path d={paths.earth} className="scene-path is-earth" />
              <path d={paths.sun} className="scene-path is-sun" />
            </g>
          )}

          {/* Bodies before terrain, so the terrain hides them for real. */}
          <g aria-hidden="true">
            <circle cx={sx} cy={sy} r={sunR * 9} fill="url(#scene-sun-glow)" opacity={sunGlow} />
            <circle cx={sx} cy={sy} r={sunR} fill="#FFF6DC" stroke="#FFC94D" strokeWidth={Math.min(2, sunR * 0.35)} />
            <g>
              <circle cx={ex} cy={ey} r={earthR} fill="var(--earth-night)" />
              <path d={phasePath(earthR, lit)} fill="var(--earth-sky)" transform={`translate(${ex} ${ey}) rotate(${litAngle})`} />
              <g clipPath="url(#scene-earth-clip)" opacity={0.45}>
                <path
                  d={`M${ex - earthR * 0.7} ${ey - earthR * 0.25} q ${earthR * 0.35} ${-earthR * 0.35} ${earthR * 0.7} ${-earthR * 0.1} t ${earthR * 0.6} ${earthR * 0.25}`}
                  stroke="#ffffff"
                  strokeWidth={Math.max(1, earthR * 0.12)}
                  fill="none"
                  strokeLinecap="round"
                />
              </g>
            </g>
          </g>

          <g aria-hidden="true">
            <path d={terrain.farArea} fill="url(#scene-far)" />
            <path d={terrain.farLine} fill="none" stroke="url(#scene-rim)" strokeWidth={2.5} strokeLinejoin="round" />
            <path d={terrain.midArea} fill="url(#scene-mid)" />
            <path d={terrain.midLine} fill="none" stroke="#8e8ca0" strokeOpacity={0.5} strokeWidth={2} />
            <path d={terrain.nearArea} fill="url(#scene-near)" />
            <path d={terrain.nearLine} fill="none" stroke="#b7b5c6" strokeOpacity={0.55} strokeWidth={2} />
          </g>

          {audience === 'planner' && (
            <g aria-hidden="true">
              <path d={terrain.farLine} fill="none" stroke="#ffffff" strokeWidth={1.25} strokeDasharray="6 4" opacity={0.9} />
              <text x={w - 14} y={Math.max(18, view.y(horizonAt(profile, centerAz + (w / 2 - 14) / pxX)) - 10)} textAnchor="end" className="scene-mono">
                Terrain horizon H(az)
              </text>
            </g>
          )}

          <BodyMark body="sun" at={sun} cx={sx} cy={sy} r={sunR} view={view} audience={audience} />
          <BodyMark body="earth" at={earth} cx={ex} cy={ey} r={earthR} view={view} audience={audience} lit={lit} />

          <g className="scene-compass" aria-hidden="true">
            {azTicks.map((a) => {
              const px = view.x(a)
              const norm = ((a % 360) + 360) % 360
              const cardinal = norm % 90 === 0
              const label =
                audience === 'planner' ? (cardinal ? `${compass(norm)} ${norm}°` : `${norm}°`) : audience === 'teacher' ? compassWord(norm) : cardinal ? compassWord(norm) : ''
              return (
                <g key={a}>
                  <line x1={px} x2={px} y1={h - 26} y2={h - (cardinal ? 12 : 18)} />
                  {label && (
                    <text x={px} y={h - 32} textAnchor="middle" className={cardinal ? 'is-cardinal' : undefined}>
                      {label}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        </svg>
      )}

      <div className="scene-controls">
        <Segmented<Look>
          label="Look at"
          tone="on-dark"
          size="s"
          value={look}
          onChange={setLook}
          options={[
            { value: 'sun', label: 'Sun' },
            { value: 'earth', label: 'Earth' },
            { value: 'both', label: 'Both' },
          ]}
        />
        {audience !== 'student' && (
          <Segmented<Lens>
            label="Lens"
            tone="on-dark"
            size="s"
            value={lens}
            onChange={setLens}
            options={[
              { value: 'eye', label: 'Eye', title: `${LENS_FOV.eye}° wide, true scale` },
              { value: 'wide', label: 'Wide', title: `${LENS_FOV.wide}° wide, true scale` },
              { value: 'panorama', label: '360°', title: 'All around, heights stretched' },
            ]}
          />
        )}
      </div>
      {audience !== 'student' && (
        <div className="scene-toggles">
          <Toggle checked={showPaths} onChange={setShowPaths} onDark>
            Paths this period
          </Toggle>
        </div>
      )}
      <span className="ui-space-caption scene-caption">{scaleNote}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ labels */

interface MarkProps {
  body: 'sun' | 'earth'
  at: BodyAtTime
  cx: number
  cy: number
  r: number
  view: View
  audience: Audience
  lit?: number
}

function BodyMark({ body, at, cx, cy, r, view, audience, lit }: MarkProps) {
  const name = body === 'sun' ? 'Sun' : 'Earth'
  const margin = at.elevationDeg - at.horizonDeg
  const { w, h } = view
  const off = cx < -r || cx > w + r || cy < -r || cy > h + r
  const tone = body === 'sun' ? 'is-sun' : 'is-earth'

  if (off) {
    const ax = Math.max(26, Math.min(w - 26, cx))
    const ay = Math.max(70, Math.min(h - 70, cy))
    const left = cx < 0
    const up = cy < 0 && !left && cx <= w
    const text = audience === 'student' ? name : `${name} ${formatAngle(at.elevationDeg)}`
    const tw = text.length * 9 + 34
    const bx = left ? ax : up ? ax - tw / 2 : ax - tw
    return (
      <g className={`scene-edge ${tone}`}>
        <rect x={bx} y={ay - 18} width={tw} height={36} rx={18} />
        <text x={left ? bx + 30 : up ? ax : bx + tw - 30} y={ay + 6} textAnchor={left ? 'start' : up ? 'middle' : 'end'}>
          {text}
        </text>
        {!up && (
          <path d={left ? `M${bx + 12} ${ay} l9 -7 v14 z` : `M${bx + tw - 12} ${ay} l-9 -7 v14 z`} />
        )}
      </g>
    )
  }

  const hidden = !at.visible
  const right = cx > w - 260
  const lx = right ? cx - r - 16 : cx + r + 16
  const ly = Math.max(34, cy - r - 26)

  if (audience === 'planner') {
    const b = Math.max(r + 6, 12)
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]
    const lines = [`${name.toUpperCase()}`, `AZ ${at.azimuthDeg.toFixed(1)}°  EL ${formatAngle(at.elevationDeg, 2)}`, `MARGIN ${formatSignedAngle(margin)}${body === 'earth' && lit !== undefined ? `  LIT ${Math.round(lit * 100)}%` : ''}`]
    const boxW = 236
    const bx = right ? cx - b - 12 - boxW : cx + b + 12
    const by = Math.max(8, Math.min(h - 84, cy - 36))
    return (
      <g className={`scene-hud ${tone}${hidden ? ' is-hidden' : ''}`}>
        {corners.map(([sx, sy]) => (
          <path key={`${sx}${sy}`} d={`M${cx + sx * b} ${cy + sy * b - sy * 7} V${cy + sy * b} H${cx + sx * b - sx * 7}`} />
        ))}
        {hidden && <circle cx={cx} cy={cy} r={r} className="scene-ghost" />}
        <rect x={bx} y={by} width={boxW} height={72} rx={10} />
        {lines.map((l, i) => (
          <text key={i} x={bx + 12} y={by + 22 + i * 20} className={i === 0 ? 'is-head' : undefined}>
            {l}
            {i === 0 && <tspan className="scene-hud-state">{hidden ? '  · HIDDEN' : '  · VISIBLE'}</tspan>}
          </text>
        ))}
      </g>
    )
  }

  const label =
    audience === 'student'
      ? hidden
        ? `${name} · behind the hills`
        : name
      : hidden
        ? `${name} · hidden, ${formatAngle(Math.abs(margin))} below the hills`
        : `${name} · ${formatAngle(margin)} above the hills`
  const tw = label.length * (audience === 'student' ? 12.5 : 10.4) + 36
  const bx = right ? lx - tw - 26 : lx + 26
  const by = ly - 50
  return (
    <g className={`scene-bubble ${tone}${hidden ? ' is-hidden' : ''}`}>
      {hidden && <circle cx={cx} cy={cy} r={Math.max(r, 6)} className="scene-ghost" />}
      <path d={`M${right ? cx - r - 4 : cx + r + 4} ${cy - 4} L${right ? bx + tw : bx} ${by + 26}`} className="scene-bubble-line" />
      <rect x={bx} y={by} width={tw} height={52} rx={18} />
      <text x={bx + 18} y={by + 34}>
        {label}
      </text>
    </g>
  )
}
