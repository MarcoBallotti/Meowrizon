import assert from 'node:assert/strict'
import { test } from 'node:test'
import { load } from './load-ts.mjs'

const { DEFAULT_MISSION, assessMission, missionIssue, simulatePower, paretoFronts } = await load('../src/domain/mission.ts')
const { rank } = await load('../src/domain/ranking.ts')
const profile = overrides => ({ ...structuredClone(DEFAULT_MISSION), ...overrides })
const candidate = overrides => ({ id: 'a', name: 'A', area: 'equatorial', center: { latDeg: 0, lonEastDeg: 0 },
  sunFraction: .8, earthFraction: .8, bothFraction: .7, periodHours: 100,
  longestNightH: 10, longestNoLinkH: 10, longestBothH: 30, ...overrides })
const power = overrides => ({ ...DEFAULT_MISSION.power, enabled: true, arrayPowerW: 100, loadW: 50, batteryWh: 100,
  initialCharge: 1, reserveCharge: .2, chargeEfficiency: 1, dischargeEfficiency: 1, ...overrides })
const series = (hours, fractions, distance = 149_597_870.7) => ({ timesMs: hours.map(h => h * 3600000), visibleFraction: fractions, distanceKm: hours.map(() => distance) })

test('sunlight screening short-circuits all later measurements and preserves the exact boundary', () => {
  const screen = profile({ minSunFraction: .45 })
  const rejected = { sunFraction: .449999, get earthFraction() { throw Error('must not read') } }
  assert.equal(assessMission(rejected, screen).status, 'excluded')
  assert.equal(assessMission({ sunFraction: .45 - Number.EPSILON }, screen).status, 'excluded')
  assert.equal(assessMission(candidate({ sunFraction: .45, bothFraction: .3 }), screen).status, 'eligible')
  assert.equal(assessMission(candidate({ sunFraction: NaN }), profile()).status, 'insufficient-data')
})

test('a higher visibility index cannot override a failed maximum outage', () => {
  const bright = candidate({ id: 'bright', sunFraction: .95, earthFraction: 1, bothFraction: .95, longestNightH: 30, periodHours: 720 })
  const survivable = candidate({ id: 'survivable', longestNightH: 6 })
  const mission = profile({ maxSunOutageH: 12 })
  assert.equal(assessMission(bright, mission).status, 'excluded')
  assert.deepEqual(rank([bright, survivable], 'all', mission).map(r => r.id), ['survivable'])
})

test('missing required measurements are unknown; optional absence never becomes zero', () => {
  const sparse = candidate({ longestNoLinkH: undefined, localTerrain: undefined })
  assert.equal(assessMission(sparse, profile()).status, 'eligible')
  const required = assessMission(sparse, profile({ maxEarthOutageH: 2, maxSlopeDeg: 8 }))
  assert.equal(required.status, 'insufficient-data')
  assert.deepEqual(required.checks.filter(c => c.status === 'unknown').map(c => c.value), [null, null])
})

test('configured time allowance tightens outage and operational window requirements', () => {
  const site = candidate({ longestNightH: 12, longestBothH: 6 })
  assert.equal(assessMission(site, profile({ maxSunOutageH: 12, minJointWindowH: 6 })).status, 'eligible')
  const result = assessMission(site, profile({ maxSunOutageH: 12, minJointWindowH: 6, eventMarginMinutes: 30 }))
  assert.deepEqual(result.checks.filter(c => c.status === 'fail').map(c => c.id), ['night', 'window'])
})

test('slope, roughness and resolution limits are independent and unknown terrain cannot pass', () => {
  const localTerrain = { status: 'ok', slopeDeg: 8, roughnessRmsM: .2 }
  const mission = profile({ maxSlopeDeg: 8, maxRoughnessM: .2, maxDemPixelM: 240 })
  assert.equal(assessMission(candidate({ localTerrain, demPixelM: 240 }), mission).status, 'eligible')
  assert.equal(assessMission(candidate({ localTerrain: { ...localTerrain, slopeDeg: 9 }, demPixelM: 240 }), mission).status, 'excluded')
  assert.equal(assessMission(candidate({ localTerrain: { ...localTerrain, status: 'unknown', reason: 'Unresolved' }, demPixelM: 240 }), mission).status, 'insufficient-data')
})

test('contradictory visibility fractions do not enter the recommendation', () => {
  assert.equal(assessMission(candidate({ bothFraction: .1 }), profile()).status, 'insufficient-data')
  assert.equal(assessMission(candidate({ bothFraction: .9 }), profile()).status, 'insufficient-data')
  assert.equal(assessMission(candidate({ periodHours: 0 }), profile()).status, 'insufficient-data')
})

test('Pareto fronts retain genuine trade-offs, demote dominated sites, and handle ties deterministically', () => {
  const a = { x: 1, y: .5 }, b = { x: .5, y: 1 }, c = { x: .4, y: .4 }, d = { x: .2, y: .2 }
  const fronts = paretoFronts([d, c, b, a], [r => r.x, r => r.y])
  assert.deepEqual([a, b, c, d].map(r => fronts.get(r)), [1, 1, 2, 3])
  const copies = [{ x: 1 }, { x: 1 }]
  assert.deepEqual([...paretoFronts(copies, [r => r.x]).values()], [1, 1])
  const ordered = rank([candidate({ id: 'b' }), candidate({ id: 'a' }), candidate({ id: 'c', sunFraction: .7, bothFraction: .6 })], 'all')
  assert.deepEqual(ordered.map(r => [r.id, r.paretoFront]), [['a', 1], ['b', 1], ['c', 2]])
})

test('unknown optional metrics are excluded from every candidate in a Pareto comparison', () => {
  const a = { x: 1, unknown: undefined }, b = { x: .5, unknown: 999 }
  const fronts = paretoFronts([a, b], [r => r.x, r => r.unknown])
  assert.equal(fronts.get(a), 1)
  assert.equal(fronts.get(b), 2)
})

test('battery discharge, reserve crossing and unmet demand match analytic constant-load results', () => {
  const result = simulatePower(series([0, 1, 2, 3], [0, 0, 0, 0]), power(), 3)
  assert.equal(result.minBatteryWh, 0)
  assert.equal(result.endBatteryWh, 0)
  assert.equal(result.unservedWh, 50)
  assert.ok(Math.abs(result.firstReserveBreachMs / 3600000 - 1.6) < 1e-8)
})

test('battery simulation handles saturation before a deficit inside the same sample interval', () => {
  // +50 W -> -50 W over two hours: 25 Wh surplus is spilled, then 25 Wh is lost.
  const result = simulatePower(series([0, 2], [1, 0]), power(), 2)
  assert.equal(result.generatedWh, 100)
  assert.equal(result.endBatteryWh, 75)
  assert.equal(result.minBatteryWh, 75)
  assert.equal(result.unservedWh, 0)
})

test('disc fractions, inverse-square distance, charge efficiency and discharge efficiency matter', () => {
  const initial = power({ initialCharge: .2, reserveCharge: 0, loadW: 10, chargeEfficiency: .5 })
  const result = simulatePower(series([0, 1], [1, 1], 2 * 149_597_870.7), initial, 1)
  assert.equal(result.generatedWh, 25)
  assert.equal(result.endBatteryWh, 27.5)
  assert.equal(simulatePower(series([0, 1], [.5, .5]), power(), 1).endBatteryWh, 100)
  assert.equal(simulatePower(series([0, 1], [0, 0]), power({ dischargeEfficiency: .5 }), 1).endBatteryWh, 0)
})

test('power checks reject insufficient reserve and never turn missing samples into darkness', () => {
  const mission = profile({ power: power() })
  const missing = assessMission(candidate(), mission)
  assert.equal(missing.status, 'insufficient-data')
  const dark = candidate({ periodHours: 3, powerSeries: series([0, 1, 2, 3], [0, 0, 0, 0]) })
  const assessment = assessMission(dark, mission)
  assert.equal(assessment.status, 'excluded')
  assert.deepEqual(assessment.checks.filter(c => c.status === 'fail').map(c => c.id), ['battery', 'supply'])
  for (const broken of [undefined, series([0, 0], [1, 1]), series([0, 1], [NaN, 1]), series([0, 1], [1, 1], 0)]) {
    assert.equal(simulatePower(broken, power(), 1), null)
  }
  assert.equal(simulatePower(series([0, 1], [1, 1]), power(), 2), null)
})

test('mission settings reject invalid limits before running an assessment', () => {
  assert.equal(missionIssue(profile()), null)
  for (const bad of [profile({ minSunFraction: -1 }), profile({ maxSlopeDeg: 91 }), profile({ maxSunOutageH: -1 }), profile({ eventMarginMinutes: NaN }), profile({ power: power({ batteryWh: 0 }) }), profile({ power: power({ chargeEfficiency: 0 }) })]) {
    assert.equal(typeof missionIssue(bad), 'string')
    assert.throws(() => assessMission(candidate(), bad))
  }
})
