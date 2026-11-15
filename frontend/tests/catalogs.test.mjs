import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'
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

const { rank, overallScore, MIN_SUN_FRACTION } = await load('../src/domain/ranking.ts')
const candidate = (overrides = {}) => ({
  id: 'site', name: 'Candidate', area: 'equatorial', center: { latDeg: 0, lonEastDeg: 0 },
  sunFraction: .8, earthFraction: .8, bothFraction: .65, periodHours: 100,
  longestNightH: 10, longestNoLinkH: 10, longestBothH: 20, ...overrides,
})

test('balanced sunlight, Earth and overlap outrank a sun-heavy site', () => {
  const balanced = candidate({ id: 'balanced', sunFraction: .9, earthFraction: .9, bothFraction: .85, longestNightH: 5, longestNoLinkH: 5 })
  const sunny = candidate({ id: 'sunny', sunFraction: .95, earthFraction: .3, bothFraction: .25, longestNightH: 5, longestNoLinkH: 70 })
  assert.deepEqual(rank([sunny, balanced], 'all').map(r => r.id), ['balanced', 'sunny'])
  assert.equal(overallScore(balanced).toFixed(1), '83.9')
  assert.ok(overallScore(sunny) < 20)
})

test('equal averages favor balanced visibility and retain the real overlap', () => {
  const balanced = candidate({ sunFraction: .6, earthFraction: .6, bothFraction: .4 })
  const uneven = candidate({ sunFraction: .9, earthFraction: .4, bothFraction: .3 })
  assert.ok(overallScore(balanced) > overallScore(uneven))
  assert.ok(overallScore(candidate({ bothFraction: .7 })) > overallScore(candidate()))
  assert.equal(overallScore(uneven), overallScore({ ...uneven, sunFraction: .4, earthFraction: .9 }))
})

test('long sunlight and radio outages reduce the score for otherwise identical sites', () => {
  const base = candidate()
  assert.ok(overallScore(base) > overallScore({ ...base, longestNightH: 20 }))
  assert.ok(overallScore(base) > overallScore({ ...base, longestNoLinkH: 20 }))
  assert.equal(overallScore(base), overallScore({ ...base, periodHours: 200, longestNightH: 20, longestNoLinkH: 20 }))
  assert.equal(overallScore(base), overallScore({ ...base, longestBothH: 30 }))
  const practice = { ...base, longestNoLinkH: undefined }
  assert.equal(overallScore(base), overallScore(practice))
})

test('45 percent sunlight is inclusive and rejected sites skip all remaining scoring reads', () => {
  const rejected = { id: 'rejected', sunFraction: MIN_SUN_FRACTION - .000001,
    get earthFraction() { throw new Error('Earth must not be checked') },
    get area() { throw new Error('No other filtering is needed') },
  }
  const boundary = candidate({ id: 'boundary', sunFraction: MIN_SUN_FRACTION, earthFraction: .7, bothFraction: .4 })
  assert.deepEqual(rank([rejected, boundary], 'all').map(r => r.id), ['boundary'])
})

test('zero visibility scores zero and full visibility scores 100', () => {
  for (const field of ['sunFraction', 'earthFraction', 'bothFraction']) {
    assert.equal(overallScore(candidate({ [field]: 0 })), 0)
  }
  assert.equal(overallScore(candidate({ sunFraction: 1, earthFraction: 1, bothFraction: 1, longestNightH: 0, longestNoLinkH: 0 })), 100)
  assert.equal(overallScore(candidate({ longestNightH: 100 })), 0)
})

test('improving any visibility metric cannot lower a score', () => {
  for (const field of ['sunFraction', 'earthFraction', 'bothFraction']) {
    assert.ok(overallScore(candidate({ [field]: .85 })) > overallScore(candidate()))
  }
})

test('rounding for display does not change the order of close scores', () => {
  const lower = candidate({ id: 'a' })
  const higher = candidate({ id: 'z', sunFraction: .80001 })
  assert.equal(overallScore(lower).toFixed(1), overallScore(higher).toFixed(1))
  assert.deepEqual(rank([lower, higher], 'all').map(r => r.id), ['z', 'a'])
})

test('exact ties use stable identity, area filters rerank, and input is not mutated', () => {
  const rows = [candidate({ id: 'b' }), candidate({ id: 'c', area: 'south-pole' }), candidate({ id: 'a' })]
  const before = structuredClone(rows)
  assert.deepEqual(rank(rows, 'all').map(r => r.id), ['a', 'b', 'c'])
  assert.deepEqual(rank([...rows].reverse(), 'all').map(r => r.id), ['a', 'b', 'c'])
  assert.deepEqual(rank(rows, 'south-pole').map(r => [r.id, r.rank]), [['c', 1]])
  assert.deepEqual(rows, before)
  assert.deepEqual(rank(rows, 'other'), [])
  assert.deepEqual(rank([], 'all'), [])
})

const { HttpProvider } = await load('../src/api/httpProvider.ts')
test('only ranking requests enable sunlight screening and disable expensive context', async (t) => {
  const requests = []
  const result = { skipped: true, minSunFraction: .45, sunFractionUpperBound: .3 }
  t.mock.method(globalThis, 'fetch', async (path, init) => {
    requests.push({ path, body: init.body ? JSON.parse(init.body) : null })
    return { ok: true, json: async () => ({ id: 'job', status: 'completed', result }) }
  })
  const api = new HttpProvider('/api')
  const input = { terrainAnalysisId: 'terrain', startUtc: '2026-01-01T00:00:00Z', stopUtc: '2026-02-01T00:00:00Z', stepMinutes: 30 }
  const job = await api.submitRankingEvaluation({ ...input, minSunFraction: .45, includeContext: true })
  assert.deepEqual(requests[0], { path: '/api/scenario-evaluations', body: { ...input, minSunFraction: .45, includeContext: false } })
  assert.deepEqual(job.result, result)
  assert.deepEqual((await api.getRankingEvaluation('job')).result, result)
  assert.equal(requests[1].path, '/api/scenario-evaluations/job')
  await api.submitScenarioEvaluation(input)
  assert.deepEqual(requests[2].body, input)
})
