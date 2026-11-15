/**
 * Ranking of candidate regions. Reads practice data from
 * public/mock/regions.json until the engine serves the same shape.
 */
import type { DataOrigin, SiteCoordinates } from '../api/types'

export type Area = 'south-pole' | 'equatorial'
export type AreaFilter = Area | 'all'
export type RankBy = 'overall' | 'sun' | 'earth' | 'both'

export interface Region {
  id: string
  name: string
  area: Area
  center: SiteCoordinates
  sunFraction: number
  earthFraction: number
  bothFraction: number
  longestNightH: number
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

/** Weights of the overall score. Shorter nights score higher. */
export const WEIGHTS = { sun: 0.4, both: 0.3, earth: 0.15, night: 0.15 }
const NIGHT_CAP_H = 354

export function overallScore(r: Region): number {
  const night = 1 - Math.min(r.longestNightH, NIGHT_CAP_H) / NIGHT_CAP_H
  return Math.round(100 * (WEIGHTS.sun * r.sunFraction + WEIGHTS.both * r.bothFraction + WEIGHTS.earth * r.earthFraction + WEIGHTS.night * night))
}

export function metric(r: Region, by: RankBy): number {
  if (by === 'sun') return r.sunFraction
  if (by === 'earth') return r.earthFraction
  if (by === 'both') return r.bothFraction
  return overallScore(r) / 100
}

export interface Ranked extends Region {
  rank: number
  score: number
  value: number
}

export function rank(regions: Region[], by: RankBy, area: AreaFilter): Ranked[] {
  return regions
    .filter((r) => area === 'all' || r.area === area)
    .map((r) => ({ ...r, score: overallScore(r), value: metric(r, by) }))
    .sort((a, b) => b.value - a.value || b.score - a.score)
    .map((r, i) => ({ ...r, rank: i + 1 }))
}

export const RANK_LABELS: Record<RankBy, { student: string; other: string }> = {
  overall: { student: 'Best overall', other: 'Overall score' },
  sun: { student: 'Sunniest', other: 'Sunlight' },
  earth: { student: 'Best for calling home', other: 'Earth in view' },
  both: { student: 'Light and radio together', other: 'Sun + Earth' },
}

let pending: Promise<RegionCatalog> | null = null

export function loadRegions(): Promise<RegionCatalog> {
  pending ??= fetch(`${import.meta.env.BASE_URL}mock/regions.json`).then((r) => {
    if (!r.ok) throw new Error(`Could not load the practice regions (${r.status}).`)
    return r.json() as Promise<RegionCatalog>
  })
  return pending
}
