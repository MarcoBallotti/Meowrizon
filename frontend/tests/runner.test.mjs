import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'vite'

test('mission edits reuse measurements, cutoff changes rescreen, and terrain evidence is requested', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' })
  try {
    const { provider, catalogApi } = await server.ssrLoadModule('/src/api/index.ts')
    const { getState, setState, setMission } = await server.ssrLoadModule('/src/state/store.ts')
    const { runRegionRanking } = await server.ssrLoadModule('/src/state/runner.ts')
    const { rank } = await server.ssrLoadModule('/src/domain/ranking.ts')
    const { DEFAULT_MISSION } = await server.ssrLoadModule('/src/domain/mission.ts')
    const start = Date.UTC(2026, 0, 1), stop = start + 3600000
    let terrainCalls = 0, evaluationCalls = 0
    const terrain = { id: 'terrain', origin: 'engine', preview: false, profile: {
      azimuthDeg: [0, 90, 180, 270], elevationDeg: [0, 0, 0, 0], observer: { surfaceHeightM: 100 },
      params: { azimuthStepDeg: 90 }, dem: { noDataFraction: 0, productIds: ['fixture'], effectivePixelSizeM: 240 }, warnings: [],
    } }
    provider.submitTerrainAnalysis = async request => {
      terrainCalls++
      assert.equal(request.includeLocalTerrain, true)
      return { id: 't', status: 'completed', result: terrain }
    }
    catalogApi.submitRankingEvaluation = async request => {
      evaluationCalls++
      if (request.minSunFraction > .5) return { id: 's', status: 'completed', result: {
        skipped: true, origin: 'engine', terrainAnalysisId: 'terrain', startMs: start, stopMs: stop,
        reason: 'sunlight_below_threshold', minSunFraction: request.minSunFraction, sunFractionUpperBound: .5,
      } }
      const body = { azimuthDeg: [0, 0, 0], elevationDeg: [1, 1, 1], horizonDeg: [0, 0, 0], visibleFraction: [1, 1, 0], distanceKm: [149597870.7, 149597870.7, 149597870.7] }
      return { id: 's', status: 'completed', result: {
        id: 'evaluation', origin: 'engine', terrainAnalysisId: 'terrain', timeScale: 'UTC', visibilityModel: 'disc-fraction-c3',
        timesMs: [start, start + 1800000, stop], sun: body, earth: body,
        intervals: { sun: [{ startMs: start, endMs: start + 1800000 }], earth: [{ startMs: start, endMs: stop }], both: [{ startMs: start, endMs: start + 1800000 }] },
        ephemeris: { source: 'fixture' }, approximations: [],
      } }
    }
    setState({ ranking: null, regions: { locations: [], regions: [] }, sitesLoaded: true,
      sites: [{ id: 'site:a', name: 'A', latDeg: 0, lonEastDeg: 0 }], durationDays: 1 / 24,
      audience: 'planner', stepMinutes: 30, mission: structuredClone(DEFAULT_MISSION),
      scenarios: { ...getState().scenarios, A: { ...getState().scenarios.A, input: { ...getState().scenarios.A.input, startMs: start } } },
    })
    await runRegionRanking()
    assert.equal(getState().ranking.regions.length, 1)
    assert.equal(getState().ranking.regions[0].powerSeries.timesMs.length, 3)
    assert.equal(rank(getState().ranking.regions, 'all', getState().mission).length, 1)
    setMission({ ...getState().mission, maxSunOutageH: .25 })
    await runRegionRanking()
    assert.equal(rank(getState().ranking.regions, 'all', getState().mission).length, 0)
    assert.equal(terrainCalls, 1)
    assert.equal(evaluationCalls, 1)
    setMission({ ...getState().mission, minSunFraction: .6 })
    await runRegionRanking()
    assert.equal(evaluationCalls, 2)
    assert.equal(getState().ranking.skipped.length, 1)
    assert.equal(getState().ranking.regions.length, 0)
    assert.equal(getState().ranking.busy, false)
    assert.deepEqual(getState().ranking.failed, [])

    // Switching to Educator must replace the screened result with full evidence.
    setState({ audience: 'educator' })
    await runRegionRanking()
    assert.equal(evaluationCalls, 3)
    assert.deepEqual(getState().ranking.skipped, [])
    assert.equal(getState().ranking.regions.length, 1)
    assert.equal(getState().ranking.regions[0].earthFraction, 1)
    assert.equal(getState().ranking.regions[0].bothFraction, .5)
    assert.equal(rank(getState().ranking.regions, 'all', getState().mission).length, 0)

    // Requirements still apply, but changing them needs no new educator measurements.
    setMission({ ...getState().mission, minSunFraction: .7 })
    await runRegionRanking()
    assert.equal(evaluationCalls, 3)
    setState({ audience: 'planner' })
    await runRegionRanking()
    assert.equal(evaluationCalls, 4)
    assert.equal(getState().ranking.skipped.length, 1)
  } finally {
    await server.close()
  }
})
