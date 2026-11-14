/**
 * Read-only helpers over engine results. They interpolate angles between
 * already-loaded samples for display, and read visibility from the
 * engine-provided intervals. They never classify visibility themselves.
 */
import type { BodyTrack, ScenarioEvaluation, TimeInterval } from '../api/types'

function lowerIndex(times: number[], t: number): number {
  let lo = 0
  let hi = times.length - 1
  if (t <= times[0]) return 0
  if (t >= times[hi]) return hi
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) lo = mid
    else hi = mid
  }
  return lo
}

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return (((a + d * f) % 360) + 360) % 360
}

export interface BodyAtTime {
  azimuthDeg: number
  elevationDeg: number
  horizonDeg: number
  visible: boolean
}

export function bodyAt(evaluation: ScenarioEvaluation, track: BodyTrack, intervals: TimeInterval[], t: number): BodyAtTime {
  const times = evaluation.timesMs
  const i = lowerIndex(times, t)
  const j = Math.min(i + 1, times.length - 1)
  const f = j === i ? 0 : Math.max(0, Math.min(1, (t - times[i]) / (times[j] - times[i])))
  return {
    azimuthDeg: lerpAngle(track.azimuthDeg[i], track.azimuthDeg[j], f),
    elevationDeg: track.elevationDeg[i] + (track.elevationDeg[j] - track.elevationDeg[i]) * f,
    horizonDeg: track.horizonDeg[i] + (track.horizonDeg[j] - track.horizonDeg[i]) * f,
    visible: inIntervals(intervals, t),
  }
}

export function inIntervals(intervals: TimeInterval[], t: number): boolean {
  let lo = 0
  let hi = intervals.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const iv = intervals[mid]
    if (t < iv.startMs) hi = mid - 1
    else if (t >= iv.endMs) lo = mid + 1
    else return true
  }
  return false
}

/** Next boundary after t (start or end of an interval), if any in range. */
export function nextTransition(intervals: TimeInterval[], t: number): { atMs: number; becomes: 'visible' | 'hidden' } | null {
  for (const iv of intervals) {
    if (iv.startMs > t) return { atMs: iv.startMs, becomes: 'visible' }
    if (iv.endMs > t) return { atMs: iv.endMs, becomes: 'hidden' }
  }
  return null
}

export interface IntervalStats {
  totalMs: number
  fraction: number
  longestOnMs: number
  longestOffMs: number
  count: number
}

export function intervalStats(intervals: TimeInterval[], startMs: number, endMs: number): IntervalStats {
  const span = Math.max(1, endMs - startMs)
  let total = 0
  let longestOn = 0
  let longestOff = 0
  let cursor = startMs
  for (const iv of intervals) {
    const d = iv.endMs - iv.startMs
    total += d
    longestOn = Math.max(longestOn, d)
    longestOff = Math.max(longestOff, iv.startMs - cursor)
    cursor = iv.endMs
  }
  longestOff = Math.max(longestOff, endMs - cursor)
  return { totalMs: total, fraction: total / span, longestOnMs: longestOn, longestOffMs: longestOff, count: intervals.length }
}
