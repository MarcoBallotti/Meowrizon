/**
 * Geometry helpers for drawing the sky as seen from the site. Display only:
 * visibility always comes from the engine intervals.
 */
import type { TimeInterval } from '../api/types'
import { inIntervals } from './sampling'

const DEG = Math.PI / 180

/** Apparent diameters seen from the Moon (mean distances). */
export const SUN_DIAMETER_DEG = 0.533
export const EARTH_DIAMETER_DEG = 2 * Math.atan(6371 / 384_400) / DEG // ≈ 1.90°

/** Great-circle angle between two directions given as az/el, degrees. */
export function angularSeparation(az1: number, el1: number, az2: number, el2: number): number {
  const a = Math.sin(el1 * DEG) * Math.sin(el2 * DEG) + Math.cos(el1 * DEG) * Math.cos(el2 * DEG) * Math.cos((az1 - az2) * DEG)
  return Math.acos(Math.max(-1, Math.min(1, a))) / DEG
}

/**
 * Lit fraction of Earth's disc seen from the Moon. With the Sun and Earth
 * separated by `elongation` in the lunar sky, Earth's phase angle is about
 * 180° − elongation (Earth is "new" when it sits next to the Sun).
 */
export function earthLitFraction(elongationDeg: number): number {
  return (1 - Math.cos(elongationDeg * DEG)) / 2
}

/** Signed azimuth difference a − b in (−180, 180]. */
export function azDelta(a: number, b: number): number {
  let d = (((a - b) % 360) + 360) % 360
  if (d > 180) d -= 360
  return d
}

export interface Span {
  /** Whether the body is visible at t. */
  on: boolean
  /** When the current state ends (null: not within the period). */
  untilMs: number | null
  /** When the current state began (null: before the period). */
  sinceMs: number | null
}

/** Current state of a visibility series at t and when it changes. */
export function spanAt(intervals: TimeInterval[], t: number): Span {
  const on = inIntervals(intervals, t)
  if (on) {
    const iv = intervals.find((i) => i.startMs <= t && t < i.endMs)
    return { on, untilMs: iv?.endMs ?? null, sinceMs: iv?.startMs ?? null }
  }
  const next = intervals.find((i) => i.startMs > t)
  let prev: TimeInterval | undefined
  for (const i of intervals) if (i.endMs <= t) prev = i
  return { on, untilMs: next?.startMs ?? null, sinceMs: prev?.endMs ?? null }
}

/** Az/el of a body at infinity whose sub-point is (latB, lonB), seen from (lat, lon). */
export function topocentric(latDeg: number, lonDeg: number, latB: number, lonB: number): [number, number] {
  const phi = Math.max(-89.9999, Math.min(89.9999, latDeg)) * DEG
  const lam = lonDeg * DEG
  const pb = latB * DEG
  const lb = lonB * DEG
  const d = [Math.cos(pb) * Math.cos(lb), Math.cos(pb) * Math.sin(lb), Math.sin(pb)]
  const up = [Math.cos(phi) * Math.cos(lam), Math.cos(phi) * Math.sin(lam), Math.sin(phi)]
  const east = [-Math.sin(lam), Math.cos(lam), 0]
  const north = [-Math.sin(phi) * Math.cos(lam), -Math.sin(phi) * Math.sin(lam), Math.cos(phi)]
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
  const el = Math.asin(Math.max(-1, Math.min(1, dot(d, up)))) / DEG
  const az = ((((Math.atan2(dot(d, east), dot(d, north)) / DEG) % 360) + 360) % 360)
  return [az, el]
}

/** Terrain horizon angle at an azimuth, linearly interpolated. */
export function horizonAt(profile: { azimuthDeg: number[]; elevationDeg: number[] }, az: number): number {
  const { azimuthDeg: azs, elevationDeg: hs } = profile
  const step = 360 / azs.length
  const x = ((((az % 360) + 360) % 360) / step) % azs.length
  const i = Math.floor(x)
  const j = (i + 1) % azs.length
  const f = x - i
  return hs[i] * (1 - f) + hs[j] * f
}
