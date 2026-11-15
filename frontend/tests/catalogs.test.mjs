import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

async function load(path) {
  const source = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { regionCatalog, siteCatalog } = await load('../src/domain/catalogs.ts')
const { bestProductFor } = await load('../src/domain/coverage.ts')
const featureCollection = (features) => ({ type: 'FeatureCollection', features })
const site = {
  type: 'Feature', geometry: { type: 'Point', coordinates: [23.47314, 0.67416] },
  properties: { id: 'apollo-11', name: 'Apollo 11', source: 'https://trek.nasa.gov/' },
}
const region = {
  type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, -89], [1, -89], [0, -88], [0, -89]]] },
  properties: { id: 'apollo-11', name: 'Apollo 11', center_lat: -88.5, center_lon: 0.5, active: true },
}

test('GeoJSON retains East longitude and canonical identity without joining names', () => {
  const [s] = siteCatalog(featureCollection([site]))
  const [r] = regionCatalog(featureCollection([region])).locations
  assert.equal(s.latDeg, 0.67416)
  assert.equal(s.lonEastDeg, 23.47314)
  assert.equal(s.source, site.properties.source)
  assert.equal(s.id, 'site:apollo-11')
  assert.equal(r.id, 'region:apollo-11')
  assert.deepEqual(r.geometry, region.geometry)
  assert.deepEqual(r.properties, region.properties)
})

test('metadata never becomes a calculated ranking or zero-valued assessment', () => {
  const catalog = regionCatalog(featureCollection([region]))
  assert.equal(catalog.origin, 'engine')
  assert.deepEqual(catalog.regions, [])
  assert.equal('sunFraction' in catalog.locations[0], false)
  assert.equal('score' in catalog.locations[0], false)
  assert.equal(catalog.locations[0].active, true)
})

test('only regions of the current NASA list (2024) are kept', () => {
  const at = (id, lists) => ({ ...region, properties: { ...region.properties, id, lists } })
  const ids = regionCatalog(featureCollection([at('haworth', ['2022', '2024']), at('connecting-ridge', ['2022']), at('unlisted')])).locations.map((r) => r.id)
  assert.deepEqual(ids, ['region:haworth', 'region:unlisted'])
})

test('planned and landed sites keep their catalog kind', () => {
  const [s] = siteCatalog(featureCollection([{ ...site, properties: { ...site.properties, kind: 'previsto' } }]))
  assert.equal(s.kind, 'previsto')
})

test('malformed, duplicate and out-of-range API data is rejected', () => {
  assert.throws(() => siteCatalog({ detail: 'Service unavailable' }))
  assert.throws(() => siteCatalog(featureCollection([site, site])))
  assert.throws(() => siteCatalog(featureCollection([{ ...site, geometry: { type: 'Point', coordinates: [0, 95] } }])))
  assert.throws(() => regionCatalog(featureCollection([{ ...region, properties: { ...region.properties, center_lat: '-88' } }])))
})

test('empty catalogs are valid and missing coverage has no fallback product', () => {
  assert.deepEqual(siteCatalog(featureCollection([])), [])
  assert.deepEqual(regionCatalog(featureCollection([])).locations, [])
  const p = { available: true, latMinDeg: -90, latMaxDeg: -80, pixelSizeM: 20 }
  assert.equal(bestProductFor(0, [p]), undefined)
  assert.equal(bestProductFor(-85, [{ ...p, available: false }]), undefined)
  assert.equal(bestProductFor(-85, [p]), p)
})
