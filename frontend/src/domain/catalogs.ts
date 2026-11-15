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

export function regionCatalog(value: unknown): RegionCatalog {
  return {
    origin: 'engine', note: 'NASA 2022 candidate regions via Moon Trek. Catalog order; scientific comparison unavailable.',
    period: { days: 0 }, regions: [],
    locations: features(value).map((row) => {
      const p = object(row.properties)
      const geometry = object(row.geometry)
      if (row.type !== 'Feature' || !['Polygon', 'MultiPolygon'].includes(String(geometry.type)) || !Array.isArray(geometry.coordinates) || typeof p.active !== 'boolean') throw new Error('Invalid region geometry or status.')
      return {
        id: `region:${text(p.id)}`, name: text(p.name), area: 'south-pole',
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
    }
  })
}
