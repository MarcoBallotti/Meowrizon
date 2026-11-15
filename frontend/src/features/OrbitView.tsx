/**
 * Sun, Earth and Moon seen from outside, in sync with the timeline.
 * Positions come from the low-precision model in approxEphemeris; sizes are
 * enlarged and the enlargement is written on screen.
 */
import { useMemo, useRef, useState, type PointerEvent } from 'react'
import { eclipseGeometry, eclipseMagnitude, geocentric, orbitState, type Vec3 } from '../domain/approxEphemeris'
import { useElementSize } from '../hooks'
import type { Audience } from '../state/store'
import { Segmented } from '../ui'

type Frame = 'earth-moon' | 'system'

const DEG = Math.PI / 180
const DAY = 86_400_000
const MOON_ORBIT_KM = 384_400

interface Camera {
  yaw: number
  pitch: number
}

function project(v: Vec3, cam: Camera): { x: number; y: number; z: number } {
  const cy = Math.cos(cam.yaw * DEG)
  const sy = Math.sin(cam.yaw * DEG)
  const x1 = v[0] * cy - v[1] * sy
  const y1 = v[0] * sy + v[1] * cy
  const cp = Math.cos(cam.pitch * DEG)
  const sp = Math.sin(cam.pitch * DEG)
  const y2 = y1 * cp - v[2] * sp
  const z2 = y1 * sp + v[2] * cp
  return { x: x1, y: -y2, z: z2 }
}

function ring(radius: number, cam: Camera, cx: number, cy: number, center: Vec3 = [0, 0, 0]): string {
  const pts: string[] = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * 2 * Math.PI
    const p = project([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a), center[2]], cam)
    pts.push(`${i ? 'L' : 'M'}${(cx + p.x).toFixed(1)} ${(cy + p.y).toFixed(1)}`)
  }
  return pts.join(' ')
}

/** Disc lit on the side facing `toward` (screen direction). */
function Body({ x, y, r, fill, night, toward }: { x: number; y: number; r: number; fill: string; night: string; toward: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={night} />
      <path d={`M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} Z`} fill={fill} transform={`translate(${x} ${y}) rotate(${toward})`} />
    </g>
  )
}

export function OrbitView({ cursorMs, audience, compact = false }: { cursorMs: number; audience: Audience; compact?: boolean }) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const [frame, setFrame] = useState<Frame>('earth-moon')
  const [cam, setCam] = useState<Camera>({ yaw: 0, pitch: 58 })
  const drag = useRef<{ x: number; y: number; cam: Camera } | null>(null)
  const w = size.width
  const h = size.height
  const cx = w / 2
  const cy = h / 2 + 10
  const unit = Math.max(compact ? 24 : 40, Math.min(w, h) * (compact ? 0.4 : 0.36))

  const g = geocentric(cursorMs)
  const sunDir: Vec3 = (() => {
    const n = Math.hypot(g.sun[0], g.sun[1], g.sun[2])
    return [g.sun[0] / n, g.sun[1] / n, g.sun[2] / n]
  })()
  // Spin the view with the Sun so the layout stays readable over the year.
  const sunLon = Math.atan2(sunDir[1], sunDir[0]) / DEG
  const view: Camera = { yaw: cam.yaw - sunLon + 90, pitch: cam.pitch }

  // One lunar month around the cursor, recomputed every 6 hours of model time.
  const bucket = Math.floor(cursorMs / (6 * 3_600_000))
  const moonPath = useMemo(() => {
    const base = bucket * 6 * 3_600_000
    const pts: Vec3[] = []
    for (let d = -14; d <= 14; d += 0.5) pts.push(geocentric(base + d * DAY).moon)
    return pts
  }, [bucket])

  const ecl = eclipseGeometry(cursorMs)
  const magnitude = eclipseMagnitude(ecl)
  const moonLat = Math.asin(g.moon[2] / Math.hypot(g.moon[0], g.moon[1], g.moon[2])) / DEG

  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, cam }
  }
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !e.currentTarget.hasPointerCapture(e.pointerId)) return
    const dx = e.clientX - drag.current.x
    const dy = e.clientY - drag.current.y
    setCam({ yaw: drag.current.cam.yaw + dx * 0.4, pitch: Math.max(0, Math.min(88, drag.current.cam.pitch + dy * 0.3)) })
  }

  let content = null
  let note = ''
  if (w > 0 && h > 0) {
    if (frame === 'earth-moon') {
      const k = unit / MOON_ORBIT_KM
      const enlarge = 4
      const earthR = Math.max(6, 6371 * k * enlarge)
      const moonR = Math.max(3, 1737 * k * enlarge)
      const m = project(g.moon, view)
      const s = project([sunDir[0] * unit * 1.45, sunDir[1] * unit * 1.45, sunDir[2] * unit * 1.45], view)
      const shadow = project([-sunDir[0] * unit * 1.3, -sunDir[1] * unit * 1.3, -sunDir[2] * unit * 1.3], view)
      const toSunAngle = (Math.atan2(s.y, s.x) * 180) / Math.PI
      const path = moonPath.map((p, i) => {
        const q = project(p, view)
        return `${i ? 'L' : 'M'}${(cx + q.x * k).toFixed(1)} ${(cy + q.y * k).toFixed(1)}`
      })
      const moonBehind = m.z * k < 0
      note = `Distances to scale · Earth and Moon drawn ×${enlarge}`
      content = (
        <>
          <path d={ring(unit * 1.15, view, cx, cy)} className="orbit-plane" />
          <line x1={cx} y1={cy} x2={cx + shadow.x} y2={cy + shadow.y} className="orbit-shadow" />
          <path d={path.join(' ')} className="orbit-path" />
          {moonBehind && <Body x={cx + m.x * k} y={cy + m.y * k} r={moonR} fill="#d9d8e2" night="#4a4a58" toward={toSunAngle} />}
          <Body x={cx} y={cy} r={earthR} fill="var(--earth-sky)" night="var(--earth-night)" toward={toSunAngle} />
          {!moonBehind && <Body x={cx + m.x * k} y={cy + m.y * k} r={moonR} fill="#d9d8e2" night="#4a4a58" toward={toSunAngle} />}
          <line x1={cx} y1={cy} x2={cx + s.x * 0.86} y2={cy + s.y * 0.86} className="orbit-sunline" />
          <circle cx={cx + s.x} cy={cy + s.y} r={compact ? 5 : 8} fill="var(--sun)" />
          <g className="orbit-labels" display={compact ? 'none' : undefined}>
            <text x={cx + s.x} y={cy + s.y - 18} textAnchor="middle">
              Sun
            </text>
            {audience !== 'student' && (
              <text x={cx + s.x} y={cy + s.y + 26} textAnchor="middle" className="is-dim">
                150 million km
              </text>
            )}
            <text x={cx} y={cy + earthR + 18} textAnchor="middle">
              Earth
            </text>
            <text x={cx + m.x * k} y={cy + m.y * k - moonR - 8} textAnchor="middle">
              Moon
            </text>
            <text x={cx + shadow.x} y={cy + shadow.y + 16} textAnchor="middle" className="is-dim">
              {audience === 'student' ? "Earth's shadow" : "Earth's shadow axis"}
            </text>
          </g>
        </>
      )
    } else {
      const k = unit
      const e = orbitState(cursorMs)
      const ep = project(e.earthAu, view)
      const ex = cx + ep.x * k
      const ey = cy + ep.y * k
      const stretch = 60
      const mk = (unit / 149_597_870.7) * stretch
      const m = project(e.moonKm, view)
      const toSunAngle = (Math.atan2(cy - ey, cx - ex) * 180) / Math.PI
      note = `Moon's distance ×${stretch} · sizes not to scale`
      content = (
        <>
          <path d={ring(k, view, cx, cy)} className="orbit-path" />
          <circle cx={cx} cy={cy} r={22} fill="var(--sun)" />
          <path d={ring(384_400 * mk, view, ex, ey)} className="orbit-plane" />
          <Body x={ex} y={ey} r={9} fill="var(--earth-sky)" night="var(--earth-night)" toward={toSunAngle} />
          <Body x={ex + m.x * mk} y={ey + m.y * mk} r={4.5} fill="#d9d8e2" night="#4a4a58" toward={toSunAngle} />
          <g className="orbit-labels" display={compact ? 'none' : undefined}>
            <text x={cx} y={cy + 40} textAnchor="middle">
              Sun
            </text>
            <text x={ex} y={ey + 26} textAnchor="middle">
              Earth + Moon
            </text>
          </g>
        </>
      )
    }
  }

  const status =
    magnitude > 0
      ? `Eclipse: Earth covers ${magnitude >= 1 ? 'all' : `${Math.round(magnitude * 100)}%`} of the Sun`
      : audience === 'student'
        ? Math.abs(moonLat) > 1.5
          ? `The Moon is ${moonLat > 0 ? 'above' : 'below'} Earth's orbit, so Earth's shadow misses it`
          : 'The Moon is close to the plane of Earth\'s orbit'
        : `Moon ${Math.abs(moonLat).toFixed(1)}° ${moonLat >= 0 ? 'north' : 'south'} of the ecliptic · Sun–Earth gap seen from the Moon ${ecl.separationDeg.toFixed(1)}°`

  return (
    <div className="orbit" ref={ref}>
      {w > 0 && h > 0 && (
        <svg
          width={w}
          height={h}
          className="orbit-svg"
          role="img"
          aria-label={`Sun, Earth and Moon seen from outside. ${status}. Drag to turn the view.`}
          onPointerDown={compact ? undefined : onDown}
          onPointerMove={compact ? undefined : onMove}
          onPointerUp={compact ? undefined : () => (drag.current = null)}
        >
          <rect width={w} height={h} fill="var(--space)" />
          {content}
        </svg>
      )}
      {!compact && (
        <>
      <div className="orbit-controls">
        <Segmented<Frame>
          label="Orbit view"
          tone="on-dark"
          size="s"
          value={frame}
          onChange={setFrame}
          options={[
            { value: 'earth-moon', label: 'Earth & Moon' },
            { value: 'system', label: 'With the Sun' },
          ]}
        />
      </div>
      <p className={`orbit-status${magnitude > 0 ? ' is-eclipse' : ''}`}>{status}</p>
      <span className="scene-legend orbit-caption">{note}</span>
        </>
      )}
    </div>
  )
}
