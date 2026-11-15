import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

const until = async predicate => {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise(resolve => setImmediate(resolve))
  }
  assert.fail('Comparison did not settle')
}

test('paired runs keep distinct dates/models and obsolete results cannot replace new choices', async t => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom' })
  t.after(() => server.close())
  const { provider } = await server.ssrLoadModule('/src/api/index.ts')
  const { getState, setState } = await server.ssrLoadModule('/src/state/store.ts')
  const { syncCompareRuns } = await server.ssrLoadModule('/src/state/compareRunner.ts')
  const { changeLessonDate } = await server.ssrLoadModule('/src/features/experiments.ts')
  const { lessonSlots } = await server.ssrLoadModule('/src/domain/learning.ts')
  const start = Date.UTC(2026, 0, 1), hour = 3600000
  const selected = { key: 'ridge', name: 'Ridge', site: { latDeg: -85, lonEastDeg: 10 } }
  const terrain = { id: 'terrain', origin: 'engine', preview: false, profile: {
    azimuthDeg: [0, 90, 180, 270], elevationDeg: [0, 0, 0, 0], observer: { surfaceHeightM: 100 },
    params: { azimuthStepDeg: 90 }, dem: { noDataFraction: 0, productIds: ['fixture'], effectivePixelSizeM: 240 }, warnings: [],
  } }
  provider.submitTerrainAnalysis = async () => ({ id: 'terrain-job', status: 'completed', result: terrain })
  let releaseOld, holdOld = true
  const requests = []
  provider.submitScenarioEvaluation = async request => {
    requests.push(request)
    const from = Date.parse(request.startUtc), to = Date.parse(request.stopUtc)
    const body = { azimuthDeg: [0, 0, 0], elevationDeg: [1, 1, 1], horizonDeg: [0, 0, 0], visibleFraction: [1, 1, 1] }
    const interval = [{ startMs: from, endMs: to }]
    const receipt = { id: `job:${from}:${request.horizonMode}`, status: 'completed', result: {
      id: `evaluation:${from}:${request.horizonMode}`, origin: 'engine', terrainAnalysisId: 'terrain',
      timeScale: 'UTC', visibilityModel: 'disc-fraction-c3', horizonMode: request.horizonMode,
      timesMs: [from, from + hour / 2, to], sun: body, earth: body,
      intervals: { sun: interval, earth: interval, both: interval }, ephemeris: { source: 'fixture', version: 'v1' },
    } }
    if (holdOld && from === start + hour) return new Promise(resolve => { releaseOld = () => resolve(receipt) })
    return receipt
  }
  setState({ audience: 'educator', experiment: { id: 'dates', mode: 'dates', secondStartMs: start + hour, trails: true }, durationDays: 1 / 24, stepMinutes: 30,
    compareSites: lessonSlots('dates', selected, start, start + hour), compareRuns: {},
    scenarios: { ...getState().scenarios, A: { ...getState().scenarios.A, input: { ...getState().scenarios.A.input, startMs: start } } },
  })
  syncCompareRuns()
  await until(() => releaseOld && getState().compareRuns['lesson:A']?.phase === 'ready')
  setState({ compareSites: lessonSlots('dates', selected, start, start + 2 * hour) })
  syncCompareRuns()
  await until(() => getState().compareRuns['lesson:B']?.phase === 'ready')
  releaseOld()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(getState().compareRuns['lesson:B'].evaluation.timesMs[0], start + 2 * hour)
  assert.equal(getState().compareRuns['lesson:A'].evaluation.timesMs[0], start)
  assert.ok(requests.every(r => r.includeContext === false && r.minSunFraction === undefined))
  changeLessonDate('second', start + 3 * hour)
  assert.equal(getState().scenarios.A.input.startMs, start)
  assert.equal(getState().compareSites[1].startMs, start + 3 * hour)
  changeLessonDate('first', start + 4 * hour)
  assert.equal(getState().compareSites[0].startMs, start + 4 * hour)
  assert.equal(getState().compareSites[1].startMs, start + 3 * hour)
  assert.equal(getState().cursorOffsetMs, 0)
  holdOld = false
  setState({ compareSites: lessonSlots('terrain', selected, start, start), compareRuns: {} })
  syncCompareRuns()
  await until(() => ['lesson:A', 'lesson:B'].every(k => getState().compareRuns[k]?.phase === 'ready'))
  assert.equal(getState().compareRuns['lesson:A'].evaluation.horizonMode, 'terrain')
  assert.equal(getState().compareRuns['lesson:B'].evaluation.horizonMode, 'ideal')
})
