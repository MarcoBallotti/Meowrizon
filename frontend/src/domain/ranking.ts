/**
 * Ranking of evaluated candidate regions and practice data using the same
 * balance of sunlight, Earth visibility and simultaneous visibility.
 */
import type { DataOrigin, LocalTerrain, SiteCoordinates } from '../api/types'
import { assessMission, DEFAULT_MISSION, paretoFronts, type MissionAssessment, type MissionProfile, type PowerSeries } from './mission'

export type Area = 'south-pole' | 'equatorial' | 'other'
export type AreaFilter = Area | 'all'
export const MIN_SUN_FRACTION = 0.45

export interface Region {
  id: string
  name: string
  area: Area
  center: SiteCoordinates
  sunFraction: number
  earthFraction: number
  bothFraction: number
  warnings?: string[]
  pointKind?: 'region-center' | 'site'
  longestNightH: number
  /** Duration of the evaluated period, used to normalize outages. */
  periodHours: number
  /** Not supplied by the static practice catalog. */
  longestNoLinkH?: number
  longestBothH?: number
  localTerrain?: LocalTerrain
  demPixelM?: number
  powerSeries?: PowerSeries
  provenance?: { terrainId: string; evaluationId: string; startMs: number; stopMs: number; ephemeris: string; productIds: string[] }
  /** Same days one month earlier, for the comparison next to every number. */
  previous?: Pick<Region, 'sunFraction' | 'earthFraction' | 'bothFraction' | 'longestNightH'>
}

export interface RegionCatalog {
  origin: DataOrigin
  note: string
  period: { days: number }
  regions: Region[]
  /** Real catalog metadata, kept separate from calculated/demo rankings. */
  locations?: RegionLocation[]
}

export interface RegionLocation {
  id: string
  name: string
  area: Area
  center: SiteCoordinates
  active: boolean
  geometry: unknown
  properties: Record<string, unknown>
}

/**
 * Equal-weight harmonic mean of the three visibility fractions, on a 0–100
 * scale. Weak visibility pulls the score down; zero in any component gives
 * zero overall. Multiply by continuity: the geometric mean of the fractions
 * of the period outside the longest sunlight/radio outages. Static practice
 * data supplies only the sunlight outage. Keep full precision until display.
 */
export function overallScore(r: Region): number {
  const { sunFraction: sun, earthFraction: earth, bothFraction: both } = r
  if (sun === 0 || earth === 0 || both === 0) return 0
  const availability = 300 / (1 / sun + 1 / earth + 1 / both)
  const sunlightContinuity = Math.max(0, 1 - r.longestNightH / r.periodHours)
  const continuity = r.longestNoLinkH === undefined
    ? sunlightContinuity
    : Math.sqrt(sunlightContinuity * Math.max(0, 1 - r.longestNoLinkH / r.periodHours))
  return availability * continuity
}

export interface Ranked extends Region {
  rank: number
  /** Secondary visibility index; never overrides a failed requirement or Pareto front. */
  score: number
  paretoFront: number
  assessment: MissionAssessment
}

export function assessRegions(regions: Region[], area: AreaFilter, mission: MissionProfile = DEFAULT_MISSION) {
  return regions.filter(r => area === 'all' || r.area === area).map(region => ({ region, assessment: assessMission(region, mission) }))
}

export function rank(regions: Region[], area: AreaFilter, mission: MissionProfile = DEFAULT_MISSION): Ranked[] {
  const eligible = assessRegions(regions, area, mission).filter(r => r.assessment.status === 'eligible')
    .map(({ region, assessment }) => ({ ...region, score: overallScore(region), assessment }))
  const fronts = paretoFronts(eligible, [
    r => r.sunFraction, r => r.earthFraction, r => r.bothFraction,
    r => -r.longestNightH, r => -(r.longestNoLinkH ?? NaN), r => r.longestBothH ?? NaN,
    ...(mission.maxSlopeDeg !== null ? [(r: Region) => -(r.localTerrain?.slopeDeg ?? NaN)] : []),
    ...(mission.maxRoughnessM !== null ? [(r: Region) => -(r.localTerrain?.roughnessRmsM ?? NaN)] : []),
    ...(mission.power.enabled ? [(r: typeof eligible[number]) => r.assessment.power?.minBatteryWh ?? NaN] : []),
  ])
  return eligible.map(r => ({ ...r, paretoFront: fronts.get(r)! }))
    .sort((a, b) => a.paretoFront - b.paretoFront || b.score - a.score || a.id.localeCompare(b.id))
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

/**
 * Colour of a place in the ranking, from green (best) to red (worst), shared by
 * the result cards and the badges on the Moon. The number in the badge carries
 * the same information, so the order never depends on colour alone.
 */
export const RANK_COLORS = ['#2f9e6e', '#86c34a', '#f2c94c', '#f2994a', '#e0574f'] as const

export function rankColor(rank: number, total: number): string {
  if (total <= 1) return RANK_COLORS[0]
  const i = Math.round(((rank - 1) / (total - 1)) * (RANK_COLORS.length - 1))
  return RANK_COLORS[Math.min(RANK_COLORS.length - 1, Math.max(0, i))]
}

let pending: Promise<RegionCatalog> | null = null

export function loadRegions(): Promise<RegionCatalog> {
  pending ??= fetch(`${import.meta.env.BASE_URL}mock/regions.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load the practice regions (${r.status}).`)
    return r.json() as Promise<RegionCatalog>
  }).then((catalog) => {
    return { ...catalog, regions: catalog.regions.map((r) => ({ ...r, periodHours: catalog.period.days * 24 })) }
  })
  return pending
}

export function publicExplanation(r: Region): string {
  return `Sunlight is available for ${Math.round(r.sunFraction * 100)}% of the period, Earth is visible for ${Math.round(r.earthFraction * 100)}%, and both are visible together for ${Math.round(r.bothFraction * 100)}%. The longest stretch without sunlight is ${r.longestNightH.toFixed(1)} hours. More shared visibility and shorter interruptions improve the visibility index; a weak result in one visibility measure lowers it.`
}
