import { interpolate, useCurrentFrame } from 'remotion'
import { C, DISPLAY, f } from './theme'
import { clamp, easeOut, useHit } from './kit'

/** The dome-cat mark, built piece by piece starting at `at` (beats). */
export function DomeCat({ at = 0, size = 300, ink = C.spaceInk }: { at?: number; size?: number; ink?: string }) {
  const frame = useCurrentFrame()
  const line = interpolate(frame, [f(at), f(at + 0.75)], [0, 1], { ...clamp, easing: easeOut })
  const dome = useHit(at + 0.25, { damping: 11, stiffness: 150, mass: 0.7 })
  const earL = useHit(at + 0.75, { damping: 8, stiffness: 260, mass: 0.5 })
  const earR = useHit(at + 0.875, { damping: 8, stiffness: 260, mass: 0.5 })
  const sun1 = useHit(at + 1.25, { damping: 9, stiffness: 220, mass: 0.5 })
  const sun2 = useHit(at + 1.5, { damping: 9, stiffness: 220, mass: 0.5 })
  const id = `clip-${at}`
  const ear = (s: number, ox: number) => ({ transform: `scale(${s})`, transformOrigin: `${ox}px 31px` })
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} style={{ overflow: 'visible', flex: 'none' }}>
      <defs>
        <clipPath id={id}>
          <rect x={-10} y={-20} width={70} height={58} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id})`}>
        <g transform={`translate(0 ${(1 - dome) * 16})`}>
          <path d="M6.5 31 L7.5 18 L15 26.5 Z" fill={ink} style={ear(earL, 7)} />
          <path d="M25.5 31 L24.5 18 L17 26.5 Z" fill={ink} style={ear(earR, 25)} />
          <path d="M4 38 A12 12 0 0 1 28 38 Z" fill={ink} />
        </g>
      </g>
      <path d={`M24 38 H${24 - 21 * line}`} stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      <path d={`M24 38 H${24 + 21 * line}`} stroke={ink} strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={33} cy={14} r={4 * sun1} fill={C.sun} />
      <circle cx={40.5} cy={26.5} r={5 * sun2} fill={C.earthSky} />
    </svg>
  )
}

export function Wordmark({ at = 0, size = 180, color = C.spaceInk }: { at?: number; size?: number; color?: string }) {
  const frame = useCurrentFrame()
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, letterSpacing: -0.03 * size, color, display: 'flex', lineHeight: 1 }}>
      {'Moonrizon'.split('').map((ch, i) => {
        const t = interpolate(frame, [f(at) + i * 2, f(at) + i * 2 + 12], [0, 1], { ...clamp, easing: easeOut })
        return (
          <span key={i} style={{ display: 'inline-block', opacity: t, transform: `translateY(${(1 - t) * 0.5 * size}px)` }}>
            {ch}
          </span>
        )
      })}
    </div>
  )
}
