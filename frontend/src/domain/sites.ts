import type { SiteCoordinates } from '../api/types'

export interface ExampleSite extends SiteCoordinates {
  id: string
  name: string
  region: 'Polo Sud' | 'Fascia equatoriale'
}

/**
 * Onboarding examples. Coordinates are approximate feature locations, not
 * certified landing sites; any other point can be chosen on the globe.
 */
export const EXAMPLE_SITES: ExampleSite[] = [
  { id: 'shackleton', name: 'Cratere Shackleton', region: 'Polo Sud', latDeg: -89.67, lonEastDeg: 129.8 },
  { id: 'de-gerlache', name: 'Cratere de Gerlache', region: 'Polo Sud', latDeg: -88.5, lonEastDeg: -87.1 },
  { id: 'malapert', name: 'Massiccio Malapert', region: 'Polo Sud', latDeg: -86.0, lonEastDeg: 2.9 },
  { id: 'sp-ref', name: 'Punto di riferimento Horizons', region: 'Polo Sud', latDeg: -89.5, lonEastDeg: 0 },
  { id: 'apollo11', name: 'Apollo 11 · Mare Tranquillitatis', region: 'Fascia equatoriale', latDeg: 0.6741, lonEastDeg: 23.473 },
  { id: 'apollo15', name: 'Apollo 15 · Hadley Rille', region: 'Fascia equatoriale', latDeg: 26.1322, lonEastDeg: 3.6339 },
]

export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

export function validateSite(lat: number, lon: number): string | null {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) return 'Latitudine fuori intervallo (−90…90°).'
  if (!Number.isFinite(lon)) return 'Longitudine non valida.'
  return null
}
