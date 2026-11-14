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
