import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('recorded choices restore all inputs and remeasurements do not inflate the try count', async t => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
  t.after(() => server.close())
  const { getState, setState, recordAttempt, reopenAttempt } = await server.ssrLoadModule('/src/state/store.ts')
  const { makeAttempt } = await server.ssrLoadModule('/src/domain/publicDecision.ts')
  const location = globalThis.location, history = globalThis.history, window = globalThis.window
  globalThis.window = { scrollTo() {} }
  globalThis.location = { hash: '#/' }
  globalThis.history = { pushState: (_state, _title, hash) => { globalThis.location.hash = hash } }
  t.after(() => {
    if (window === undefined) delete globalThis.window
    else globalThis.window = window
    if (location === undefined) delete globalThis.location
    else globalThis.location = location
    if (history === undefined) delete globalThis.history
    else globalThis.history = history
  })
  const input = { site: { latDeg: -85, lonEastDeg: 11 }, siteName: null, selectionId: null, observerHeightM: 5, startMs: 1000 }
  const config = { durationDays: 10, stepMinutes: 30, azimuthStepDeg: 1, maxDistanceKm: 100,
    observerHeightM: 5, origin: 'engine', model: 'disc-fraction-c3', ephemerisVersion: 'v1',
    terrainVersion: 'v1', scoringVersion: 'visibility-learning-2' }
  const metrics = { sun: .5, earth: .6, both: .4, nightH: 20, earthOutageH: 30, jointWindowH: 50 }
  const saved = makeAttempt(input, config, metrics, 'first')
  recordAttempt(saved)
  recordAttempt(saved)
  assert.equal(getState().attempts.length, 1)
  recordAttempt({ ...saved, evaluationId: 'remeasured' })
  assert.equal(getState().attempts.length, 1)
  assert.equal(getState().attempts[0].evaluationId, 'remeasured')
  setState({ durationDays: 99, stepMinutes: 60, azimuthStepDeg: 2, maxDistanceKm: 50, cursorOffsetMs: 100 })
  reopenAttempt(saved.id)
  const s = getState()
  assert.deepEqual(s.scenarios.A.input, input)
  assert.equal(s.durationDays, 10)
  assert.equal(s.stepMinutes, 30)
  assert.equal(s.azimuthStepDeg, 1)
  assert.equal(s.maxDistanceKm, 100)
  assert.equal(s.cursorOffsetMs, 0)
  assert.equal(s.pointShown, true)
  assert.equal(s.screen, 'site')
  assert.equal(s.scenarios.A.run.phase, 'idle')
  reopenAttempt('missing')
  assert.deepEqual(getState().scenarios.A.input, input)
})
