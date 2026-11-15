import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('what-if retains the original evidence and restores requirements, selected site and calculation settings', async t => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
  t.after(() => server.close())
  const { getState, setState, setMission, beginPlannerExperiment, restorePlannerExperiment } = await server.ssrLoadModule('/src/state/store.ts')
  const { assessMission } = await server.ssrLoadModule('/src/domain/mission.ts')
  const { plannerContext } = await server.ssrLoadModule('/src/domain/planner.ts')
  const oldWindow = globalThis.window
  globalThis.window = { scrollTo() {} }
  t.after(() => { if (oldWindow === undefined) delete globalThis.window; else globalThis.window = oldWindow })
  const original = structuredClone(getState())
  const baseline = { id: 'a', name: 'Original site', center: { latDeg: 0, lonEastDeg: 0 }, area: 'other', sunFraction: .5, earthFraction: .8, bothFraction: .4, longestNightH: 20, periodHours: 240 }
  beginPlannerExperiment(baseline)
  baseline.sunFraction = 0
  setMission({ ...getState().mission, minSunFraction: .7 })
  assert.equal(assessMission(getState().plannerExperiment.baseline, getState().mission).status, 'excluded')
  assert.equal(getState().plannerExperiment.baseline.sunFraction, .5)
  assert.equal(plannerContext(getState()), getState().plannerExperiment.context)
  setState({ durationDays: 90, maxDistanceKm: 50, cursorOffsetMs: 500 })
  assert.notEqual(plannerContext(getState()), getState().plannerExperiment.context)
  restorePlannerExperiment()
  assert.deepEqual(getState().mission, original.mission)
  assert.deepEqual(getState().scenarios.A.input, { ...original.scenarios.A.input, selectionId: original.scenarios.A.input.selectionId ?? null })
  assert.equal(getState().durationDays, original.durationDays)
  assert.equal(getState().maxDistanceKm, original.maxDistanceKm)
  assert.equal(getState().cursorOffsetMs, 0)
  assert.equal(getState().pointShown, original.pointShown)
  assert.equal(getState().plannerExperiment, null)
})
