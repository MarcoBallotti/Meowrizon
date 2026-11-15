/**
 * Earth covering the Sun, seen from the Moon (a lunar eclipse seen from Earth).
 *
 * Within a scenario the intervals are read from the Sun and Earth tracks the
 * provider returned. Outside it (the two-year calendar) dates come from the
 * low-precision model and are labelled as approximate.
 */
import type { HorizonProfile, ScenarioEvaluation, SiteCoordinates, TimeInterval } from '../api/types'
import { findEclipses, subSolarPoint, type SolarEclipseFromMoon } from './approxEphemeris'
import { angularSeparation, EARTH_DIAMETER_DEG, horizonAt, SUN_DIAMETER_DEG, topocentric } from './sky'

/** Centres closer than this: Earth's disc overlaps the Sun's. */
export const ECLIPSE_CONTACT_DEG = (EARTH_DIAMETER_DEG + SUN_DIAMETER_DEG) / 2
export const ECLIPSE_TOTAL_DEG = (EARTH_DIAMETER_DEG - SUN_DIAMETER_DEG) / 2

/** Share of the Sun's diameter hidden by Earth at a separation, 0..1. */
export function coverage(separationDeg: number): number {
  return Math.max(0, Math.min(1, (ECLIPSE_CONTACT_DEG - separationDeg) / SUN_DIAMETER_DEG))
}

export function eclipseIntervals(evaluation: ScenarioEvaluation): TimeInterval[] {
  if (evaluation.origin === 'engine') return evaluation.intervals.eclipse ?? []
  const { timesMs, sun, earth } = evaluation
  const out: TimeInterval[] = []
  let start: number | null = null
  for (let i = 0; i < timesMs.length; i++) {
    const sep = angularSeparation(sun.azimuthDeg[i], sun.elevationDeg[i], earth.azimuthDeg[i], earth.elevationDeg[i])
    const inside = sep < ECLIPSE_CONTACT_DEG
    if (inside && start === null) start = timesMs[i]
    if (!inside && start !== null) {
      out.push({ startMs: start, endMs: timesMs[i] })
      start = null
    }
  }
  if (start !== null) out.push({ startMs: start, endMs: timesMs[timesMs.length - 1] })
  return out
}

export interface SiteEclipse extends SolarEclipseFromMoon {
  /** Sun above the terrain horizon at greatest eclipse. */
  visible: boolean
  sunElevationDeg: number
}

const YEAR_MS = 365.25 * 86_400_000

/** Eclipses in the next two years and whether the site sees them. */
export function upcomingEclipses(fromMs: number, site: SiteCoordinates, profile: HorizonProfile | undefined, years = 2): SiteEclipse[] {
  return findEclipses(fromMs, fromMs + years * YEAR_MS).map((e) => {
    const [lat, lon] = subSolarPoint(e.maxMs)
    const [az, el] = topocentric(site.latDeg, site.lonEastDeg, lat, lon)
    const h = profile ? horizonAt(profile, az) : 0
    return { ...e, visible: el > h, sunElevationDeg: el }
  })
}

/** Start the scenario two days before greatest eclipse and park the cursor on it. */
export function scenarioStartFor(e: SolarEclipseFromMoon): { startMs: number; cursorOffsetMs: number } {
  const startMs = Math.floor((e.maxMs - 2 * 86_400_000) / 3_600_000) * 3_600_000
  return { startMs, cursorOffsetMs: e.maxMs - startMs }
}
