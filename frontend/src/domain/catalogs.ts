/** Adapters for the backend's native lunar GeoJSON; metadata has no ranking score. */
import type { RegionCatalog } from './ranking'
import type { ExampleSite } from './sites'

type ObjectValue = Record<string, unknown>
function object(value: unknown): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog object.')
  return value as ObjectValue
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Missing catalog identity or name.')
  return value
}
function number(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid lunar catalog coordinate.')
  return value
}
function features(value: unknown): ObjectValue[] {
  const collection = object(value)
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) throw new Error('Expected a GeoJSON FeatureCollection.')
  const rows = collection.features.map(object)
  const ids = rows.map((row) => text(object(row.properties).id))
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate catalog IDs.')
  return rows
}

export function areaOfLatitude(lat: number): 'south-pole' | 'equatorial' | 'other' {
  return lat < -80 ? 'south-pole' : Math.abs(lat) <= 35 ? 'equatorial' : 'other'
}

export interface ComparisonCandidate {
  id: string
  name: string
  center: { latDeg: number; lonEastDeg: number }
  area: 'south-pole' | 'equatorial' | 'other'
  pointKind: 'region-center' | 'site'
}

export function comparisonCandidates(catalog: RegionCatalog | null, sites: ExampleSite[]): ComparisonCandidate[] {
  const regions = (catalog?.locations ?? []).map(r => ({ id: r.id, name: r.name,
    center: r.center, area: areaOfLatitude(r.center.latDeg), pointKind: 'region-center' as const }))
  const points = sites.map(s => ({ id: s.id, name: s.name,
    center: { latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }, area: areaOfLatitude(s.latDeg), pointKind: 'site' as const }))
  return [...new Map([...regions, ...points].map(p => [p.id, p])).values()]
}

export function regionCatalog(value: unknown): RegionCatalog {
  return {
    origin: 'engine', note: 'All published region outlines in the backend catalog, via Moon Trek. Region centres are sample points, not regional assessments.',
    period: { days: 0 }, regions: [],
    locations: features(value).map((row) => {
      const p = object(row.properties)
      const geometry = object(row.geometry)
      if (row.type !== 'Feature' || !['Polygon', 'MultiPolygon'].includes(String(geometry.type)) || !Array.isArray(geometry.coordinates) || typeof p.active !== 'boolean') throw new Error('Invalid region geometry or status.')
      return {
        id: `region:${text(p.id)}`, name: text(p.name), area: areaOfLatitude(number(p.center_lat, -90, 90)),
        center: { latDeg: number(p.center_lat, -90, 90), lonEastDeg: number(p.center_lon, -180, 180) },
        active: p.active, geometry, properties: p,
      }
    }),
  }
}

export function siteCatalog(value: unknown): ExampleSite[] {
  return features(value).map((row) => {
    const p = object(row.properties)
    const geometry = object(row.geometry)
    if (row.type !== 'Feature' || geometry.type !== 'Point' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) throw new Error('Invalid site point geometry.')
    const latDeg = number(geometry.coordinates[1], -90, 90)
    return {
      id: `site:${text(p.id)}`, name: text(p.name), short: text(p.name).split(' · ')[0],
      latDeg, lonEastDeg: number(geometry.coordinates[0], -180, 180),
      region: latDeg < -80 ? 'South pole' : Math.abs(latDeg) <= 35 ? 'Equatorial band' : 'Other latitudes',
      source: text(p.source), properties: p,
      ...(typeof p.kind === 'string' ? { kind: p.kind } : {}),
    }
  })
}
