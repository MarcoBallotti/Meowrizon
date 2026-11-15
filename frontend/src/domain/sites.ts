import type { SiteCoordinates } from '../api/types'

export type SiteRegion = 'South pole' | 'Equatorial band' | 'Other latitudes'

export interface ExampleSite extends SiteCoordinates {
  id: string
  name: string
  /** Short name for big buttons and labels on the globe. */
  short: string
  region: SiteRegion
  source?: string
  properties?: Record<string, unknown>
}

/**
 * Onboarding examples. Coordinates are approximate feature locations, not
 * certified landing sites; any other point can be chosen on the globe.
 */
export const EXAMPLE_SITES: ExampleSite[] = [
  { id: 'shackleton', name: 'Shackleton crater', short: 'Shackleton', region: 'South pole', latDeg: -89.67, lonEastDeg: 129.8 },
  { id: 'de-gerlache', name: 'de Gerlache crater', short: 'de Gerlache', region: 'South pole', latDeg: -88.5, lonEastDeg: -87.1 },
  { id: 'malapert', name: 'Malapert massif', short: 'Malapert', region: 'South pole', latDeg: -86.0, lonEastDeg: 2.9 },
  { id: 'sp-ref', name: 'Horizons reference point', short: 'Horizons ref.', region: 'South pole', latDeg: -89.5, lonEastDeg: 0 },
  { id: 'apollo11', name: 'Apollo 11 · Tranquility Base', short: 'Apollo 11', region: 'Equatorial band', latDeg: 0.6741, lonEastDeg: 23.473 },
  { id: 'apollo15', name: 'Apollo 15 · Hadley Rille', short: 'Apollo 15', region: 'Equatorial band', latDeg: 26.1322, lonEastDeg: 3.6339 },
]

export const CUSTOM_SITE_NAME = 'Custom point'

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function validateSite(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitude must be between −90° and 90°.'
  if (!Number.isFinite(lon)) return 'Longitude is not a number.'
  return null
}
