import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion'
import { C, DISPLAY, f } from './theme'

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1)
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1)

/** Spring that starts at `beats` (scene-relative). */
export function useHit(beats: number, config = { damping: 13, stiffness: 190, mass: 0.6 }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return spring({ frame: frame - f(beats), fps, config })
}

/** Linear 0→1 ramp between two beat marks with easing. */
export function useRamp(from: number, to: number, ease = easeInOut) {
  const frame = useCurrentFrame()
  return interpolate(frame, [f(from), f(to)], [0, 1], { ...clamp, easing: ease })
}

/** A word that slams in on a beat. */
export function Word({ at, children, style, from = 'below' }: { at: number; children: ReactNode; style?: CSSProperties; from?: 'below' | 'zoom' }) {
  const s = useHit(at)
  const frame = useCurrentFrame()
  if (frame < f(at)) return <span style={{ ...style, opacity: 0, display: 'inline-block' }}>{children}</span>
  const t =
    from === 'zoom'
      ? `scale(${interpolate(s, [0, 1], [1.9, 1])})`
      : `translateY(${interpolate(s, [0, 1], [70, 0])}px) scale(${interpolate(s, [0, 1], [1.15, 1])})`
  return (
    <span
      style={{
        display: 'inline-block',
        opacity: interpolate(s, [0, 0.35], [0, 1], clamp),
        transform: t,
        filter: `blur(${interpolate(s, [0, 0.6], [12, 0], clamp)}px)`,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

export function Headline({ children, size = 104, color = C.spaceInk, style }: { children: ReactNode; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -0.02 * size, color, ...style }}>
      {children}
    </div>
  )
}

export function Stars({ count = 140, drift = 0.15, color = C.spaceInk }: { count?: number; drift?: number; color?: string }) {
  const frame = useCurrentFrame()
  return (
    <AbsoluteFill>
      <svg width={1920} height={1080}>
        {Array.from({ length: count }, (_, i) => {
          const x = (random(`x${i}`) * 1920 - frame * drift * (0.4 + random(`d${i}`))) % 1920
          const y = random(`y${i}`) * 1080
          const r = 0.6 + random(`r${i}`) * 1.4
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(frame / 18 + i))
          return <circle key={i} cx={(x + 1920) % 1920} cy={y} r={r} fill={color} opacity={tw * (0.25 + random(`o${i}`) * 0.6)} />
        })}
      </svg>
    </AbsoluteFill>
  )
}

/** Deterministic ridge profile across the frame. */
export function ridgePath(seed: string, base: number, amp: number, width = 1920, height = 1080, step = 12) {
  const pts: string[] = []
  const k = [random(seed + 'a'), random(seed + 'b'), random(seed + 'c'), random(seed + 'd')]
  for (let x = -40; x <= width + 40; x += step) {
    const u = x / width
    const y =
      base -
      amp *
        (0.55 * Math.sin(u * 5.1 + k[0] * 6) +
          0.3 * Math.sin(u * 11.7 + k[1] * 6) +
          0.15 * Math.sin(u * 27.3 + k[2] * 6) +
          0.08 * Math.sin(u * 61 + k[3] * 6))
    pts.push(`${x},${y.toFixed(1)}`)
  }
  return `M-40,${height} L${pts.join(' L')} L${width + 40},${height} Z`
}

/** A product screenshot in a rounded window with a straight dolly. */
export function Shot({
  src,
  x,
  y,
  w,
  h,
  zoom = [1, 1.08],
  origin = [0.5, 0.5],
  dur,
  radius = 24,
  style,
}: {
  src: string
  x: number
  y: number
  w: number
  h: number
  zoom?: [number, number]
  origin?: [number, number]
  dur: number
  radius?: number
  style?: CSSProperties
}) {
  const frame = useCurrentFrame()
  const z = interpolate(frame, [0, f(dur)], zoom, { ...clamp, easing: Easing.bezier(0.33, 0, 0.2, 1) })
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: radius,
        overflow: 'hidden',
        boxShadow: '0 48px 120px rgba(5,6,12,0.55)',
        outline: '1px solid rgba(236,238,244,0.10)',
        background: C.ground,
        ...style,
      }}
    >
      <Img
        src={staticFile(`shots/${src}.png`)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${z})`, transformOrigin: `${origin[0] * 100}% ${origin[1] * 100}%` }}
      />
    </div>
  )
}

export function Chip({ at, children, tone = 'dark' }: { at: number; children: ReactNode; tone?: 'dark' | 'light' }) {
  const s = useHit(at)
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 24px',
        borderRadius: 999,
        fontSize: 28,
        background: tone === 'dark' ? C.space2 : C.card,
        color: tone === 'dark' ? C.spaceInk2 : C.ink2,
        outline: tone === 'dark' ? `1px solid ${C.spaceLine}` : 'none',
        opacity: interpolate(s, [0, 0.4], [0, 1], clamp),
        transform: `translateY(${(1 - s) * 30}px)`,
      }}
    >
      {children}
    </div>
  )
}

export const Dot = ({ color }: { color: string }) => <span style={{ width: 14, height: 14, borderRadius: 7, background: color, display: 'inline-block' }} />
