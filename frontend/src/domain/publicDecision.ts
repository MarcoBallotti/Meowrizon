import type { AppState, Attempt, ScenarioInput, SiteSummary } from '../state/store'
import type { Region } from './ranking'
import { gradeOf, indexOf } from './grade'

export const PUBLIC_SCORING_VERSION = 'visibility-learning-2'

export function decisionConfig(s: AppState): Attempt['config'] | null {
  const { terrain, evaluation } = s.scenarios.A.run
  if (!terrain?.profile?.algorithmVersion || !evaluation?.ephemeris?.version) return null
  return {
    durationDays: s.durationDays, stepMinutes: s.stepMinutes,
    azimuthStepDeg: s.azimuthStepDeg, maxDistanceKm: s.maxDistanceKm,
    observerHeightM: s.scenarios.A.input.observerHeightM,
    origin: evaluation.origin, model: evaluation.visibilityModel,
    ephemerisVersion: evaluation.ephemeris.version,
    terrainVersion: terrain.profile.algorithmVersion,
    scoringVersion: PUBLIC_SCORING_VERSION,
  }
}

export function validDecisionMetrics(m: SiteSummary, hours: number): boolean {
  return Number.isFinite(hours) && hours > 0
    && [m.sun, m.earth, m.both].every(v => Number.isFinite(v) && v >= 0 && v <= 1)
    && m.both <= Math.min(m.sun, m.earth) + 1e-9
    && [m.nightH, m.earthOutageH, m.jointWindowH].every(v => v !== undefined && Number.isFinite(v) && v >= 0 && v <= hours + 1e-9)
}

export function sameDecisionConfig(a: Attempt['config'], b: Attempt['config']): boolean {
  return (Object.keys(a) as (keyof Attempt['config'])[]).every(k => a[k] === b[k])
    && Object.keys(a).length === Object.keys(b).length
}

export function decisionId(input: ScenarioInput, config: Attempt['config']): string {
  return JSON.stringify([input.site.latDeg, input.site.lonEastDeg, input.startMs,
    config.durationDays, config.stepMinutes, config.azimuthStepDeg, config.maxDistanceKm,
    config.observerHeightM, config.origin, config.model, config.ephemerisVersion,
    config.terrainVersion, config.scoringVersion])
}

export function makeAttempt(input: ScenarioInput, config: Attempt['config'], metrics: SiteSummary, evaluationId: string): Attempt {
  if (!validDecisionMetrics(metrics, config.durationDays * 24)) throw new Error('Incomplete visibility measurements cannot be graded.')
  const index = indexOf(metrics, config.durationDays * 24)
  return {
    id: decisionId(input, config), input: structuredClone(input), config: { ...config },
    metrics: { ...metrics }, evaluationId, site: { ...input.site },
    name: input.siteName ?? 'Your spot', startMs: input.startMs, index, grade: gradeOf(index),
  }
}

/** Only actual learner measurements for this period and method can be suggested. */
export function testedAlternatives(attempts: Attempt[], current: Attempt): Region[] {
  return attempts.filter(t => t.id !== current.id && t.startMs === current.startMs
    && sameDecisionConfig(t.config, current.config)
    && validDecisionMetrics(t.metrics, t.config.durationDays * 24))
    .map(t => ({
      id: t.id, name: t.name, area: 'other', center: t.site,
      sunFraction: t.metrics.sun, earthFraction: t.metrics.earth, bothFraction: t.metrics.both,
      longestNightH: t.metrics.nightH, longestNoLinkH: t.metrics.earthOutageH,
      longestBothH: t.metrics.jointWindowH, periodHours: t.config.durationDays * 24,
    }))
}

export function decisionChanges(now: SiteSummary, before: SiteSummary) {
  const values = [
    ['sun', 'Sunlight', 100, 'percentage points', true],
    ['earth', 'Earth in view', 100, 'percentage points', true],
    ['both', 'Light and Earth together', 100, 'percentage points', true],
    ['nightH', 'Longest darkness', 1, 'hours', false],
    ['earthOutageH', 'Longest time without Earth in view', 1, 'hours', false],
    ['jointWindowH', 'Longest shared window', 1, 'hours', true],
  ] as const
  return values.flatMap(([key, label, scale, unit, higher]) => {
    const a = now[key], b = before[key]
    if (a === undefined || b === undefined || !Number.isFinite(a) || !Number.isFinite(b)) return []
    const delta = (a - b) * scale
    return [{ key, label, delta, unit, outcome: Math.abs(delta) < .05 ? 'unchanged' : (delta > 0) === higher ? 'improved' : 'worsened' }]
  })
}
