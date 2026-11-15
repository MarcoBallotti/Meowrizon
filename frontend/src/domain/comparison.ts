/** Admission checks for point comparisons: missing data must never become zero visibility. */
import type { TerrainAnalysis, ScenarioEvaluation } from '../api/types'

export function terrainIssue(terrain: TerrainAnalysis): string | null {
  if (terrain.origin !== 'engine' || terrain.preview) return 'Only completed, non-preview terrain analyses can be compared.'
  const p = terrain.profile
  if (!p || !p.dem || !p.observer || !p.params) return 'Terrain metadata is missing.'
  if (p.dem.noDataFraction !== 0) return 'The terrain contains missing or unquantified elevation data.'
  if (!Number.isFinite(p.observer.surfaceHeightM) || !p.dem.productIds?.length || (!Number.isFinite(p.dem.effectivePixelSizeM) || p.dem.effectivePixelSizeM <= 0)) return 'Terrain elevation or source information is missing.'
  const az = p.azimuthDeg, el = p.elevationDeg, step = p.params.azimuthStepDeg
  if (!Array.isArray(az) || !Array.isArray(el) || az.length < 3 || az.length !== el.length || !Number.isFinite(step) || step <= 0) return 'The horizon profile is incomplete.'
  if (Math.abs(az.length * step - 360) > 1e-6 || az.some((v, i) => !Number.isFinite(v) || Math.abs(v - i * step) > 1e-6) || el.some(v => !Number.isFinite(v))) return 'The horizon does not cover all directions with finite elevations.'
  return null
}

export function scenarioIssue(ev: ScenarioEvaluation, terrainId: string, start: number, stop: number, stepMs: number, allowDemo = false): string | null {
  if ((ev.origin !== 'engine' && !(allowDemo && ev.origin === 'demo')) || ev.terrainAnalysisId !== terrainId || ev.timeScale !== 'UTC' || (ev.visibilityModel !== 'disc-fraction-c3' && !(allowDemo && ev.origin === 'demo' && ev.visibilityModel === 'body-center'))) return 'The scenario does not use the requested terrain and visibility definition.'
  const t = ev.timesMs
  if (!Array.isArray(t) || t.length < 2 || t.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= t[i - 1]) || (i > 0 && v - t[i - 1] > stepMs + 1)) || t[0] > start || t[t.length - 1] < stop) return 'The ephemerides do not cover the requested period.'
  const demoCenter = allowDemo && ev.origin === 'demo' && ev.visibilityModel === 'body-center'
  for (const body of [ev.sun, ev.earth]) {
    if (!body) return 'Sun or Earth samples are incomplete.'
    const arrays = [body.azimuthDeg, body.elevationDeg, body.horizonDeg, ...(demoCenter ? [] : [body.visibleFraction])]
    if (arrays.some(a => !Array.isArray(a) || a.length !== t.length || a.some(v => !Number.isFinite(v)))) return 'Sun or Earth samples are incomplete.'
    if (demoCenter) {
      if (!Array.isArray(body.centerVisible) || body.centerVisible.length !== t.length || body.centerVisible.some(v => typeof v !== 'boolean')) return 'Demo visibility samples are incomplete.'
    } else if (body.visibleFraction!.some(v => v < 0 || v > 1)) return 'The visible-disc fractions are invalid.'
  }
  for (const intervals of [ev.intervals?.sun, ev.intervals?.earth, ev.intervals?.both]) {
    if (!Array.isArray(intervals)) return 'Visibility intervals are missing.'
    let previous = start
    for (const iv of intervals) {
      if (!Number.isFinite(iv.startMs) || !Number.isFinite(iv.endMs) || iv.startMs < previous || iv.endMs <= iv.startMs || iv.endMs > stop) return 'Visibility intervals are incomplete or inconsistent with the requested period.'
      previous = iv.endMs
    }
  }
  return null
}
