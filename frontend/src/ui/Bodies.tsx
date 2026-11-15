/**
 * Sun, Earth and eclipse markers: Lucide line icons in the two muted data
 * tones. Shapes differ, so meaning never depends on colour alone.
 */
import { Earth, Sun, SunDim } from 'lucide-react'
import { phasePath } from './phase'

const STROKE = 1.75

export function SunIcon({ size = 18 }: { size?: number }) {
  return <Sun size={size} strokeWidth={STROKE} color="var(--sun)" aria-hidden="true" style={{ flex: 'none' }} />
}

export function EarthIcon({ size = 18 }: { size?: number }) {
  return <Earth size={size} strokeWidth={STROKE} color="var(--earth)" aria-hidden="true" style={{ flex: 'none' }} />
}

export function EclipseIcon({ size = 18 }: { size?: number }) {
  return <SunDim size={size} strokeWidth={STROKE} color="var(--red-ring)" aria-hidden="true" style={{ flex: 'none' }} />
}

export function BothIcon({ size = 18 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', flex: 'none' }} aria-hidden="true">
      <SunIcon size={size} />
      <EarthIcon size={size} />
    </span>
  )
}

/** Earth's phase as seen from the Moon (a data drawing, not an icon). */
export function EarthPhase({ size = 18, lit = 1, angle = 0 }: { size?: number; lit?: number; angle?: number }) {
  return (
    <svg viewBox="-12 -12 24 24" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <circle r="9" fill="var(--earth-night)" />
      <path d={phasePath(9, lit)} fill="var(--earth)" transform={`rotate(${angle})`} />
    </svg>
  )
}
