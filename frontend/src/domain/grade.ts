/**
 * The General Public score: one letter for a site and period, the checks that
 * explain it, and a nearby place that would do better. It reuses the ranking's
 * visibility index with a fixed didactic scale independent of mission requirements.
 */
import type { SiteCoordinates } from '../api/types'
import type { SiteSummary } from '../state/store'
import { overallScore, RANK_COLORS, type Region } from './ranking'

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F'

/** Lower bound of the visibility index (0–100) for each letter. */
const BANDS: [Grade, number][] = [['A', 55], ['B', 42], ['C', 28], ['D', 15], ['F', 0]]

export function indexOf(s: SiteSummary, periodHours: number): number {
  return overallScore({ sunFraction: s.sun, earthFraction: s.earth, bothFraction: s.both, longestNightH: s.nightH, longestNoLinkH: s.earthOutageH, periodHours } as Region)
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
  id: 'sun' | 'earth' | 'night' | 'both' | 'radio'
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
    ? { id: 'sun', label: 'Plenty of sunlight', tone: 'good', reason: `The Sun is in view ${pct(s.sun)} of the time, giving solar panels opportunities to generate energy.` }
    : s.sun >= 0.45
      ? { id: 'sun', label: 'Some sunlight', tone: 'fair', reason: `The Sun is in view ${pct(s.sun)} of the time: power availability also depends on panels, batteries and demand.` }
      : { id: 'sun', label: 'Little sunlight', tone: 'poor', reason: `The Sun is in view only ${pct(s.sun)} of the time, long interruptions may require stored energy or another power source.` }
  const earth: GradeCheck = s.earth >= 0.5
    ? { id: 'earth', label: 'Earth in view', tone: 'good', reason: `Earth is above the horizon ${pct(s.earth)} of the time, making a direct link geometrically possible; radio performance needs separate checks.` }
    : s.earth > 0.05
      ? { id: 'earth', label: 'Earth comes and goes', tone: 'fair', reason: `Earth is in view ${pct(s.earth)} of the time; outside those windows a direct link is blocked; waiting or a relay may be needed.` }
      : { id: 'earth', label: 'Earth hidden', tone: 'poor', reason: `Earth is visible ${pct(s.earth)} of the time; direct communication opportunities are scarce.` }
  const night: GradeCheck = s.nightH <= 72
    ? { id: 'night', label: 'Short nights', tone: 'good', reason: `The longest dark stretch is ${days(s.nightH)}: stored energy would need to cover this interruption.` }
    : s.nightH <= 200
      ? { id: 'night', label: 'Long nights', tone: 'fair', reason: `The longest dark stretch is ${days(s.nightH)}: energy storage requirements depend on the equipment and its demand.` }
      : { id: 'night', label: 'Very long nights', tone: 'poor', reason: `The longest dark stretch is ${days(s.nightH)}: energy and thermal survival need separate assessment.` }
  const both: GradeCheck = {
    id: 'both', label: 'Light and Earth together',
    tone: s.both >= .45 ? 'good' : s.both > 0 ? 'fair' : 'poor',
    reason: `Sun and Earth are visible together ${pct(s.both)} of the time. Shared windows let solar generation and direct communication overlap.`,
  }
  const radio: GradeCheck[] = s.earthOutageH === undefined ? [] : [{
    id: 'radio', label: 'Longest interruption in Earth visibility',
    tone: s.earthOutageH <= 72 ? 'good' : s.earthOutageH <= 200 ? 'fair' : 'poor',
    reason: `Earth is out of view for up to ${days(s.earthOutageH)} continuously. A direct link is unavailable during that stretch; a relay or delayed communication may help.`,
  }]
  return [sun, earth, both, night, ...radio]
}

/** One line on the biggest problem, so the reader knows what to change. */
export function mainProblem(checks: GradeCheck[], latDeg: number): string {
  const worst = [...checks].sort((a, b) => rankTone(a.tone) - rankTone(b.tone))[0]
  if (worst.tone === 'good') return 'This is a strong choice: try another date to see whether it stays good all year.'
  if (worst.id === 'both') return 'Use the timeline to find when sunlight and Earth visibility overlap. Try another day at this spot and check whether that shared time grows.'
  if (worst.id === 'night' || worst.id === 'sun') {
    return latDeg > -80
      ? 'Most of the Moon gets two weeks of night. Near the south pole the Sun moves around a low horizon, so some ridges may have shorter dark stretches. Try a spot there and check its result.'
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
    .map((region) => ({ region, index: indexOf({ sun: region.sunFraction, earth: region.earthFraction, both: region.bothFraction, nightH: region.longestNightH, earthOutageH: region.longestNoLinkH }, region.periodHours) }))
    .filter((r) => r.index > index + 3 && gradeOf(r.index) !== here && distanceKm(from, r.region.center) > 1)
    .map((r) => ({ ...r, grade: gradeOf(r.index), km: distanceKm(from, r.region.center), direction: compassTo(from, r.region.center) }))
    .sort((a, b) => a.km - b.km)
  return better[0] ?? null
}
