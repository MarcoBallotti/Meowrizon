import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'
const { requirementMargin, candidateDifferences, orderingReason, visibilityWindows } = await load('../src/domain/planner.ts')
const { rankingRequest } = await load('../src/domain/rankingRequest.ts')

const region = { id: 'a', name: 'A', area: 'other', center: { latDeg: 0, lonEastDeg: 0 }, sunFraction: .8, earthFraction: .8, bothFraction: .6, longestNightH: 30, longestNoLinkH: 40, periodHours: 240 }

test('margins distinguish minimum, maximum, failure and missing evidence', () => {
  const check = { value: 68, limit: 72, direction: 'max', status: 'pass' }
  assert.equal(requirementMargin(check), 4)
  assert.equal(requirementMargin({ ...check, value: 80, status: 'fail' }), -8)
  assert.equal(requirementMargin({ ...check, direction: 'min', value: 80 }), 8)
  assert.equal(requirementMargin({ ...check, value: null, status: 'unknown' }), null)
  assert.equal(requirementMargin({ ...check, value: 72 }), 0)
})

test('recommendation evidence does not invent shorter outages from lower shared visibility', () => {
  const alternative = { ...region, id: 'b', bothFraction: .7, longestNightH: 20, longestNoLinkH: undefined }
  const differences = candidateDifferences(region, alternative)
  assert.equal(differences.find(d => d.label === 'Longest darkness').outcome, 'trade-off')
  assert.equal(differences.find(d => d.label === 'Shared visibility').outcome, 'trade-off')
  assert.equal(differences.some(d => d.label === 'Longest Earth interruption'), false)
  const tied = { ...region, paretoFront: 1, score: 50 }
  assert.match(orderingReason(tied, { ...tied, id: 'b' }), /neither has a measured lead/)
})

test('clickable visibility opportunities are clipped to the current period and ranked by duration', () => {
  const intervals = [{ startMs: -100, endMs: 20 }, { startMs: 30, endMs: 200 }, { startMs: 500, endMs: 600 }]
  const windows = visibilityWindows(intervals, 0, 100)
  assert.deepEqual(windows.map(w => [w.startMs, w.endMs]), [[30, 100], [0, 20]])
  assert.equal(intervals[0].startMs, -100)
})

test('measurements are invalidated by date and screening changes, not independent requirement edits', () => {
  const state = { sites: [{ id: 'a', name: 'A', latDeg: 0, lonEastDeg: 0 }], regions: null,
    scenarios: { A: { input: { site: region.center, siteName: 'A', startMs: 1000, observerHeightM: 2 } } },
    audience: 'planner', mission: { minSunFraction: .45 }, durationDays: 10, stepMinutes: 30, azimuthStepDeg: 1, maxDistanceKm: 100 }
  const key = rankingRequest(state).key
  assert.equal(rankingRequest({ ...state, mission: { ...state.mission, maxSunOutageH: 20 } }).key, key)
  assert.notEqual(rankingRequest({ ...state, mission: { minSunFraction: .6 } }).key, key)
  assert.notEqual(rankingRequest({ ...state, durationDays: 20 }).key, key)
  assert.equal(rankingRequest({ ...state, audience: 'educator' }).minSunFraction, 0)
})
