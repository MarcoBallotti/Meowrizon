/**
 * Sun and Earth, the two meaning symbols. Shapes differ (rays vs. disc with
 * meridian) so state never depends on colour alone.
 */
import { phasePath } from './phase'

export function SunIcon({ size = 18 }: { size?: number }) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return <line key={i} x1={Math.cos(a) * 7.5} y1={Math.sin(a) * 7.5} x2={Math.cos(a) * 10.5} y2={Math.sin(a) * 10.5} />
  })
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <g stroke="var(--sun)" strokeWidth="2.2" strokeLinecap="round">
        {rays}
      </g>
      <circle r="5" fill="var(--sun)" />
    </svg>
  )
}

export function EarthIcon({ size = 18, lit = 1, angle = 0 }: { size?: number; lit?: number; angle?: number }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <circle r="9" fill="var(--earth-night)" />
      <path d={phasePath(9, lit)} fill="var(--earth)" transform={`rotate(${angle})`} />
      <circle r="9" fill="none" stroke="var(--earth)" strokeWidth="1.6" />
    </svg>
  )
}

export function BothIcon({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <circle cx="8.5" cy="12" r="6" fill="var(--sun)" />
      <circle cx="15.5" cy="12" r="6" fill="var(--earth)" fillOpacity="0.9" />
    </svg>
  )
}
