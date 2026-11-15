import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'

const { makeAttempt, sameDecisionConfig, testedAlternatives, validDecisionMetrics, decisionChanges } = await load('../src/domain/publicDecision.ts')
const { indexOf, suggestBetter, checksOf } = await load('../src/domain/grade.ts')
const { overallScore } = await load('../src/domain/ranking.ts')
const config = { durationDays: 10, stepMinutes: 30, azimuthStepDeg: 1, maxDistanceKm: 100,
  observerHeightM: 2, origin: 'engine', model: 'disc-fraction-c3', ephemerisVersion: 'v1',
  terrainVersion: 'v1', scoringVersion: 'visibility-learning-2' }
const input = { site: { latDeg: -85, lonEastDeg: 0 }, siteName: null, selectionId: null, observerHeightM: 2, startMs: 1000 }
const poor = { sun: .3, earth: .4, both: .2, nightH: 100, earthOutageH: 150, jointWindowH: 10 }
const good = { sun: .8, earth: .9, both: .7, nightH: 20, earthOutageH: 10, jointWindowH: 80 }

const attempt = (metrics = poor, change = {}, settings = config) => makeAttempt({ ...input, ...change }, settings, metrics, 'evaluation')

test('chosen point and suggested alternative use the same index including radio interruptions', () => {
  const a = attempt(good)
  const alternative = attempt(good, { site: { latDeg: -84, lonEastDeg: 0 }, siteName: 'Ridge' })
  const regions = testedAlternatives([alternative], attempt())
  assert.equal(suggestBetter(input.site, indexOf(poor, 240), regions).index, a.index)
  assert.equal(a.index, overallScore(regions[0]))
  assert.ok(indexOf({ ...good, earthOutageH: 150 }, 240) < a.index)
})

test('suggestions reject old dates, different methods, durations and invalid measurements', () => {
  const now = attempt()
  const elsewhere = { site: { latDeg: -84, lonEastDeg: 0 } }
  const valid = attempt(good, elsewhere)
  const candidates = [valid, attempt(good, { ...elsewhere, startMs: 2000 }),
    attempt(good, elsewhere, { ...config, durationDays: 20 }),
    attempt(good, elsewhere, { ...config, origin: 'demo' }),
    attempt(good, elsewhere, { ...config, ephemerisVersion: 'v2' }),
    { ...valid, metrics: { ...good, both: NaN } }]
  assert.deepEqual(testedAlternatives(candidates, now).map(t => t.id), [valid.id])
})

test('attempts snapshot the configuration and measurements and distinguish changed settings', () => {
  const source = structuredClone(input), settings = { ...config }, metrics = { ...poor }
  const saved = makeAttempt(source, settings, metrics, 'e1')
  source.site.latDeg = 0
  settings.durationDays = 99
  metrics.sun = 1
  assert.equal(saved.input.site.latDeg, -85)
  assert.equal(saved.config.durationDays, 10)
  assert.equal(saved.metrics.sun, .3)
  assert.notEqual(saved.id, attempt(poor, {}, { ...config, stepMinutes: 60 }).id)
  assert.equal(sameDecisionConfig(saved.config, { ...config }), true)
  assert.equal(sameDecisionConfig(saved.config, { ...config, scoringVersion: 'other' }), false)
})

test('metric feedback exposes both improvements and regressions', () => {
  const changes = decisionChanges({ ...good, earth: .2, both: .1 }, poor)
  assert.equal(changes.find(c => c.key === 'sun').outcome, 'improved')
  assert.equal(changes.find(c => c.key === 'earth').outcome, 'worsened')
  assert.equal(changes.find(c => c.key === 'earthOutageH').outcome, 'improved')
  assert.equal(changes.find(c => c.key === 'nightH').delta, -80)
})

test('missing or contradictory measurements never become valid grades', () => {
  for (const metrics of [{ ...poor, earthOutageH: undefined }, { ...poor, both: .9 }, { ...poor, nightH: 241 }, { ...poor, sun: NaN }]) {
    assert.equal(validDecisionMetrics(metrics, 240), false)
    assert.throws(() => attempt(metrics), /cannot be graded/)
  }
  assert.equal(validDecisionMetrics(poor, 240), true)
  const scarce = checksOf({ ...poor, earth: .01 })
  assert.match(scarce.find(c => c.id === 'earth').reason, /1%/)
  assert.doesNotMatch(scarce.map(c => c.reason).join(' '), /never rises|batteries can cover|enough for power|would not survive/)
})


test('practice results use explicit centre visibility while engine results still require disc fractions', async () => {
  const { scenarioIssue } = await load('../src/domain/comparison.ts')
  const body = { azimuthDeg: [0, 0], elevationDeg: [1, 1], horizonDeg: [0, 0], centerVisible: [true, true] }
  const interval = [{ startMs: 0, endMs: 1000 }]
  const demo = { origin: 'demo', terrainAnalysisId: 'terrain', timeScale: 'UTC', visibilityModel: 'body-center',
    timesMs: [0, 1000], sun: body, earth: body, intervals: { sun: interval, earth: interval, both: interval } }
  assert.equal(scenarioIssue(demo, 'terrain', 0, 1000, 1000, true), null)
  assert.ok(scenarioIssue(demo, 'terrain', 0, 1000, 1000))
  assert.ok(scenarioIssue({ ...demo, origin: 'engine', visibilityModel: 'disc-fraction-c3' }, 'terrain', 0, 1000, 1000, true))
  assert.ok(scenarioIssue({ ...demo, sun: { ...body, centerVisible: [] } }, 'terrain', 0, 1000, 1000, true))
})
