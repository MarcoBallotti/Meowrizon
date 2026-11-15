/**
 * The General Public score: one letter for a site and period, the checks that
 * explain it, and a nearby place that would do better. It reuses the ranking's
 * visibility index so a grade never disagrees with the trade study.
 */
import type { SiteCoordinates } from '../api/types'
import type { SiteSummary } from '../state/store'
import { overallScore, RANK_COLORS, type Region } from './ranking'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/** Lower bound of the visibility index (0–100) for each letter. */
const BANDS: [Grade, number][] = [['A', 55], ['B', 42], ['C', 28], ['D', 15], ['F', 0]]

export function indexOf(s: SiteSummary, periodHours: number): number {
  return overallScore({ sunFraction: s.sun, earthFraction: s.earth, bothFraction: s.both, longestNightH: s.nightH, periodHours } as Region)
}

const GRADES: Grade[] = ['A', 'B', 'C', 'D', 'F']

/** Same green-to-red scale as the ranking badges. */
export function gradeColor(g: Grade): string {
  return RANK_COLORS[GRADES.indexOf(g)]
}

export function gradeOf(index: number): Grade {
  return BANDS.find(([, min]) => index >= min)![0]
}

export type CheckTone = 'good' | 'fair' | 'poor'

export interface GradeCheck {
  id: 'sun' | 'earth' | 'night'
  label: string
  tone: CheckTone
  /** One sentence in plain words: what this means for a lander. */
  reason: string
}

const pct = (v: number) => `${Math.round(v * 100)}%`
function days(h: number): string {
  return h < 36 ? `${Math.round(h)} hours` : `${(h / 24).toFixed(h < 240 ? 1 : 0)} days`
}

export function checksOf(s: SiteSummary): GradeCheck[] {
  const sun: GradeCheck = s.sun >= 0.6
    ? { id: 'sun', label: 'Plenty of sunlight', tone: 'good', reason: `The Sun is in view ${pct(s.sun)} of the time, so solar panels work most days.` }
    : s.sun >= 0.45
      ? { id: 'sun', label: 'Some sunlight', tone: 'fair', reason: `The Sun is in view ${pct(s.sun)} of the time: enough for power, with little to spare.` }
      : { id: 'sun', label: 'Little sunlight', tone: 'poor', reason: `The Sun is in view only ${pct(s.sun)} of the time, so the lander runs short of power.` }
  const earth: GradeCheck = s.earth >= 0.5
    ? { id: 'earth', label: 'Earth in view', tone: 'good', reason: `Earth is above the horizon ${pct(s.earth)} of the time, so you can call home directly.` }
    : s.earth > 0.05
      ? { id: 'earth', label: 'Earth comes and goes', tone: 'fair', reason: `Earth is in view ${pct(s.earth)} of the time; the rest of the time you need a relay satellite.` }
      : { id: 'earth', label: 'Earth hidden', tone: 'poor', reason: 'Earth never rises above the hills here, so you cannot talk to home without a relay.' }
  const night: GradeCheck = s.nightH <= 72
    ? { id: 'night', label: 'Short nights', tone: 'good', reason: `The longest dark stretch is ${days(s.nightH)}: batteries can cover it.` }
    : s.nightH <= 200
      ? { id: 'night', label: 'Long nights', tone: 'fair', reason: `The longest dark stretch is ${days(s.nightH)}: the lander needs big batteries.` }
      : { id: 'night', label: 'Very long nights', tone: 'poor', reason: `The longest dark stretch is ${days(s.nightH)}: it gets very cold and most landers would not survive.` }
  return [sun, earth, night]
}

/** One line on the biggest problem, so the reader knows what to change. */
export function mainProblem(checks: GradeCheck[], latDeg: number): string {
  const worst = [...checks].sort((a, b) => rankTone(a.tone) - rankTone(b.tone))[0]
  if (worst.tone === 'good') return 'This is a strong choice: try another date to see whether it stays good all year.'
  if (worst.id === 'night' || worst.id === 'sun') {
    return latDeg > -80
      ? 'Most of the Moon gets two weeks of night. Near the south pole the Sun circles the horizon instead of setting, so try a spot there.'
      : 'Near the pole the Sun stays low, so small differences in height decide how long it is in view. Try a higher ridge or crater rim.'
  }
  return latDeg < -80
    ? 'Earth sits very low from the south pole. A spot on the near side of a ridge, facing Earth, keeps it in view longer.'
    : 'Earth stays in about the same place in the sky. Pick a spot on the side of the Moon that faces Earth.'
}

function rankTone(t: CheckTone): number {
  return t === 'poor' ? 0 : t === 'fair' ? 1 : 2
}

const R_KM = 1737.4
export function distanceKm(a: SiteCoordinates, b: SiteCoordinates): number {
  const toRad = Math.PI / 180
  const dLat = (b.latDeg - a.latDeg) * toRad
  const dLon = (b.lonEastDeg - a.lonEastDeg) * toRad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latDeg * toRad) * Math.cos(b.latDeg * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

function compassTo(a: SiteCoordinates, b: SiteCoordinates): string {
  const toRad = Math.PI / 180
  const y = Math.sin((b.lonEastDeg - a.lonEastDeg) * toRad) * Math.cos(b.latDeg * toRad)
  const x = Math.cos(a.latDeg * toRad) * Math.sin(b.latDeg * toRad) - Math.sin(a.latDeg * toRad) * Math.cos(b.latDeg * toRad) * Math.cos((b.lonEastDeg - a.lonEastDeg) * toRad)
  const az = ((Math.atan2(y, x) / toRad) + 360) % 360
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(az / 45) % 8]
}

export interface Suggestion {
  region: Region
  index: number
  grade: Grade
  km: number
  direction: string
}

/**
 * The closest measured place that scores at least one letter better; if none
 * is better, nothing. Distances are along the surface.
 */
export function suggestBetter(from: SiteCoordinates, index: number, regions: Region[]): Suggestion | null {
  const here = gradeOf(index)
  const better = regions
    .map((region) => ({ region, index: overallScore(region) }))
    .filter((r) => r.index > index + 3 && gradeOf(r.index) !== here && distanceKm(from, r.region.center) > 1)
    .map((r) => ({ ...r, grade: gradeOf(r.index), km: distanceKm(from, r.region.center), direction: compassTo(from, r.region.center) }))
    .sort((a, b) => a.km - b.km)
  return better[0] ?? null
}
