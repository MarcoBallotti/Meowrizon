import type { AppState } from '../state/store'
import { assessMission, type RequirementCheck, type MissionProfile } from './mission'
import type { Region, Ranked } from './ranking'
import type { TimeInterval } from '../api/types'

export function requirementMargin(check: RequirementCheck): number | null {
  if (check.status === 'unknown' || check.value === null || !Number.isFinite(check.value)) return null
  return check.direction === 'min' ? check.value - check.limit : check.limit - check.value
}

export function candidateDifferences(a: Region, b: Region, mission?: MissionProfile) {
  const metrics = [
    ['Sunlight', a.sunFraction, b.sunFraction, 100, 'percentage points', true],
    ['Earth in view', a.earthFraction, b.earthFraction, 100, 'percentage points', true],
    ['Shared visibility', a.bothFraction, b.bothFraction, 100, 'percentage points', true],
    ['Longest darkness', a.longestNightH, b.longestNightH, 1, 'h', false],
    ['Longest Earth interruption', a.longestNoLinkH, b.longestNoLinkH, 1, 'h', false],
    ['Longest shared window', a.longestBothH, b.longestBothH, 1, 'h', true],
  ] as const
  const extra: [string, number | null | undefined, number | null | undefined, number, string, boolean][] = []
  if (mission?.maxSlopeDeg !== null && mission?.maxSlopeDeg !== undefined) extra.push(['Local slope', a.localTerrain?.status === 'ok' ? a.localTerrain.slopeDeg : undefined, b.localTerrain?.status === 'ok' ? b.localTerrain.slopeDeg : undefined, 1, '°', false])
  if (mission?.maxRoughnessM !== null && mission?.maxRoughnessM !== undefined) extra.push(['Surface residual RMS', a.localTerrain?.status === 'ok' ? a.localTerrain.roughnessRmsM : undefined, b.localTerrain?.status === 'ok' ? b.localTerrain.roughnessRmsM : undefined, 1, 'm', false])
  if (mission?.power.enabled) extra.push(['Minimum battery charge', assessMission(a, mission).power?.minBatteryWh, assessMission(b, mission).power?.minBatteryWh, 1, 'Wh', true])
  return [...metrics, ...extra].flatMap(([label, own, other, scale, unit, higher]) => {
    if (own == null || other == null || !Number.isFinite(own) || !Number.isFinite(other)) return []
    const delta = (own - other) * scale
    return [{ label, own: own * scale, other: other * scale, delta, unit,
      outcome: Math.abs(delta) < 1e-8 ? 'equal' : (delta > 0) === higher ? 'advantage' : 'trade-off' }]
  })
}

export function orderingReason(a: Ranked, b: Ranked): string {
  if (a.paretoFront !== b.paretoFront) return `The recommendation is in trade-off group ${a.paretoFront}; the alternative is in group ${b.paretoFront}. Groups take priority over the visibility index.`
  if (a.score !== b.score) return `Both are in trade-off group ${a.paretoFront}. The visibility index breaks the tie (${a.score.toFixed(2)} vs ${b.score.toFixed(2)}); this does not make one better on every measure.`
  return 'The group and visibility index are tied. Stable catalog identity determines display order; neither has a measured lead in that ordering.'
}

export function plannerContext(s: AppState): string {
  const a = s.scenarios.A.input
  return JSON.stringify([a.startMs, a.observerHeightM, s.durationDays, s.stepMinutes, s.azimuthStepDeg, s.maxDistanceKm, s.area, s.regions?.origin, (s.regions?.locations ?? s.regions?.regions ?? []).map(p => [p.id, p.center.latDeg, p.center.lonEastDeg]), s.sites.map(p => [p.id, p.latDeg, p.lonEastDeg])])
}

/** Visibility opportunities, not proof that a mission starting here is feasible. */
export function visibilityWindows(intervals: TimeInterval[], start: number, stop: number) {
  return intervals.map(iv => ({ ...iv, startMs: Math.max(start, iv.startMs), endMs: Math.min(stop, iv.endMs) }))
    .filter(iv => Number.isFinite(iv.startMs) && Number.isFinite(iv.endMs) && iv.endMs > iv.startMs)
    .sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs)).slice(0, 3)
}
