import { useMemo, useRef, useState } from 'react'
import type { HorizonProfile } from '../api/types'
import { horizonAt } from '../domain/sky'

/** A panorama drawn only from sampled DEM horizon angles. No procedural relief. */
export function TerrainPanorama({ profile }: { profile: HorizonProfile }) {
  const [center, setCenter] = useState(180)
  const [wide, setWide] = useState(true)
  const drag = useRef<{ x: number; az: number } | null>(null)
  const span = wide ? 360 : 120
  const top = Math.max(8, ...profile.elevationDeg) + 2
  const bottom = Math.min(-8, ...profile.elevationDeg) - 2
  const y = (angle: number) => 400 * (top - angle) / (top - bottom)
  const path = useMemo(() => {
    const points = Array.from({ length: 1001 }, (_, i) => {
      const az = (center - span / 2 + i * span / 1000 + 720) % 360
      return `${i ? 'L' : 'M'}${i},${400 * (top - horizonAt(profile, az)) / (top - bottom)}`
    })
    return `${points.join(' ')} L1000,400 L0,400 Z`
  }, [profile, center, span, top, bottom])
  return <div className="terrain-panorama" data-testid="real-terrain-panorama">
    <div className="terrain-panorama-controls">
      <strong>PGDA LOLA · measured terrain</strong>
      <button type="button" onClick={() => setWide(v => !v)}>{wide ? 'Zoom to 120°' : 'View 360°'}</button>
    </div>
    <svg viewBox="0 0 1000 400" preserveAspectRatio="none" role="img" aria-label="Lunar terrain horizon calculated from PGDA elevations"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, az: center } }}
      onPointerMove={e => { if (drag.current) setCenter((drag.current.az - (e.clientX - drag.current.x) / e.currentTarget.getBoundingClientRect().width * span + 720) % 360) }}
      onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
      <defs><linearGradient id="real-ground" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#a09ba1" /><stop offset="1" stopColor="#292b38" /></linearGradient></defs>
      <rect width="1000" height="400" fill="#111622" />
      {[-10, -5, 0, 5, 10].filter(a => a > bottom && a < top).map(a => <g key={a}>
        <line x1="0" x2="1000" y1={y(a)} y2={y(a)} stroke="#536078" strokeDasharray={a === 0 ? undefined : '3 6'} opacity="0.5" />
        <text x="12" y={y(a) - 5} fill="#b9c6dc" fontSize="12">{a}°</text>
      </g>)}
      <path d={path} fill="url(#real-ground)" stroke="#d8d3d7" strokeWidth="1.5" />
      {Array.from({ length: 9 }, (_, i) => <text key={i} x={i * 120 + 20} y="385" fill="white" fontSize="12">{Math.round((center - span / 2 + (i * 120 + 20) / 1000 * span + 720) % 360)}°</text>)}
    </svg>
    <label>Look direction · {Math.round(center)}° <input type="range" min="0" max="359" value={center} onChange={e => setCenter(Number(e.target.value))} /></label>
    <div className="terrain-panorama-note">{profile.params.maxDistanceKm} km radius · {profile.azimuthDeg.length} directions · observer {profile.observer.heightAboveSurfaceM} m above the DEM. Elevation axis scaled to fit; terrain only, no Sun/Earth visibility calculation.</div>
    <details><summary>Source and resolution limits</summary>{profile.warnings.map(w => <p key={w}>{w}</p>)}<a href="https://pgda.gsfc.nasa.gov/products/90" target="_blank" rel="noreferrer">NASA PGDA LOLA source</a></details>
  </div>
}
