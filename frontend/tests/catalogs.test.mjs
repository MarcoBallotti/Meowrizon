import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'

async function load(path) {
  const source = stripTypeScriptTypes(readFileSync(new URL(path, import.meta.url), 'utf8'))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}
const { regionCatalog, siteCatalog, comparisonCandidates } = await load('../src/domain/catalogs.ts')
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

test('all region lists and inactive regions remain available for point comparison', () => {
  const at = (id, lists) => ({ ...region, properties: { ...region.properties, id, lists, active: false } })
  const locations = regionCatalog(featureCollection([at('haworth', ['2022', '2024']), at('connecting-ridge', ['2022']), at('unlisted')])).locations
  assert.deepEqual(locations.map(r => r.id), ['region:haworth', 'region:connecting-ridge', 'region:unlisted'])
  const candidates = comparisonCandidates({ locations }, siteCatalog(featureCollection([site])))
  assert.equal(candidates.length, 4)
  assert.equal(candidates[3].area, 'equatorial')
  assert.equal(candidates[0].pointKind, 'region-center')
  assert.equal(candidates[3].pointKind, 'site')
  assert.equal(comparisonCandidates(null, siteCatalog(featureCollection([site]))).length, 1)
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

const { terrainIssue, scenarioIssue } = await load('../src/domain/comparison.ts')
const validTerrain = () => ({ id: 't', origin: 'engine', preview: false, profile: {
  azimuthDeg: [0, 90, 180, 270], elevationDeg: [0, 0, 0, 0],
  observer: { surfaceHeightM: 100 }, params: { azimuthStepDeg: 90 },
  dem: { productIds: ['LOLA'], effectivePixelSizeM: 240, noDataFraction: 0 },
} })
const validScenario = () => {
  const body = () => ({ azimuthDeg: [0, 1, 2], elevationDeg: [-1, -1, -1], horizonDeg: [0, 0, 0], visibleFraction: [0, 0, 0] })
  return { origin: 'engine', terrainAnalysisId: 't', timeScale: 'UTC', visibilityModel: 'disc-fraction-c3', timesMs: [0, 100, 200], sun: body(), earth: body(), intervals: { sun: [], earth: [], both: [] } }
}
test('coarse but complete global terrain is eligible; missing terrain is not', () => {
  assert.equal(terrainIssue(validTerrain()), null)
  for (const mutate of [t => { t.profile.dem.noDataFraction = .1 }, t => { t.profile.observer.surfaceHeightM = null }, t => { t.profile.elevationDeg[1] = null }, t => { t.preview = true }, t => { t.profile.azimuthDeg.pop() }]) {
    const t = validTerrain(); mutate(t); assert.equal(typeof terrainIssue(t), 'string')
  }
})
test('genuine zero visibility is valid, missing samples and incomplete time coverage are not', () => {
  assert.equal(scenarioIssue(validScenario(), 't', 0, 200, 100), null)
  for (const mutate of [e => { e.sun.visibleFraction[1] = null }, e => { e.timesMs[0] = 1 }, e => { e.timesMs = [0, 200] }, e => { e.intervals.earth = undefined }, e => { e.terrainAnalysisId = 'other' }, e => { e.intervals.sun = [{ startMs: 0, endMs: 300 }] }]) {
    const e = validScenario(); mutate(e); assert.equal(typeof scenarioIssue(e, 't', 0, 200, 100), 'string')
  }
})

const { rank } = await load('../src/domain/ranking.ts')
test('equal visibility uses stable identity instead of a hidden composite score', () => {
  const base = { area: 'equatorial', sunFraction: .5, bothFraction: 0, earthFraction: 0, longestNightH: 354 }
  const rows = [{ ...base, id: 'b', earthFraction: 1 }, { ...base, id: 'a' }]
  assert.deepEqual(rank(rows, 'sun', 'all').map(r => r.id), ['a', 'b'])
  assert.deepEqual(rank(rows, 'earth', 'all').map(r => r.id), ['b', 'a'])
})
