/**
 * Runs for the compare screen: terrain, then Sun and Earth, then the period
 * before, for up to four sites on the same period as scenario A. Each site
 * keeps its own run so a slow site never holds back the others; the engine
 * caches finished jobs, so reopening a comparison is immediate.
 */
import { provider } from '../api'
import { runJob } from '../api/jobs'
import type { HorizonProfile, SiteCoordinates, TerrainAnalysis } from '../api/types'
import { getState, setState, siteKey, type ScenarioRun } from './store'

const controllers = new Map<string, AbortController>()
let skylineController: AbortController | null = null

function describe(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error.'
}

/** Everything a compared run depends on: a change means it must run again. */
export function compareRunKey(site: SiteCoordinates): string {
  const s = getState()
  const A = s.scenarios.A.input
  return JSON.stringify([siteKey(site), A.startMs, A.observerHeightM, s.durationDays, s.stepMinutes, s.azimuthStepDeg, s.maxDistanceKm])
}

function patchRun(key: string, runKey: string, patch: Partial<ScenarioRun>): void {
  const cur = getState().compareRuns[key]
  if (cur && cur.runKey !== runKey) return
  setState((s) => ({
    compareRuns: { ...s.compareRuns, [key]: { ...(cur ?? { phase: 'idle', stale: true }), ...patch, runKey } },
  }))
}

export function rememberSkyline(site: SiteCoordinates, profile: HorizonProfile): void {
  const key = siteKey(site)
  if (getState().skylines[key]) return
  setState((s) => ({ skylines: { ...s.skylines, [key]: { azimuthDeg: profile.azimuthDeg, elevationDeg: profile.elevationDeg } } }))
}

function terrainFor(site: SiteCoordinates, signal: AbortSignal, onProgress?: (p?: number, message?: string) => void): Promise<TerrainAnalysis> {
  const s = getState()
  return runJob(
    () =>
      provider.submitTerrainAnalysis(
        { site, observerHeightM: s.scenarios.A.input.observerHeightM, config: { azimuthStepDeg: s.azimuthStepDeg, maxDistanceKm: s.maxDistanceKm } },
        signal,
      ),
    (id) => provider.getTerrainAnalysis(id, signal),
    (job) => onProgress?.(job.progress, job.message),
    signal,
  )
}

async function runSite(site: SiteCoordinates): Promise<void> {
  const key = siteKey(site)
  const runKey = compareRunKey(site)
  const existing = getState().compareRuns[key]
  if (existing?.runKey === runKey && existing.phase !== 'error') return

  controllers.get(key)?.abort()
  const controller = new AbortController()
  controllers.set(key, controller)
  const { signal } = controller
  const live = () => !signal.aborted && getState().compareRuns[key]?.runKey === runKey

  // The site already open in the site view: reuse its finished run.
  const s = getState()
  const A = s.scenarios.A
  if (siteKey(A.input.site) === key && A.run.phase === 'ready' && !A.run.stale && A.run.terrain && A.run.evaluation) {
    setState((st) => ({ compareRuns: { ...st.compareRuns, [key]: { ...A.run, runKey } } }))
    rememberSkyline(site, A.run.terrain.profile)
    controllers.delete(key)
    return
  }

  const startMs = A.input.startMs
  const span = s.durationDays * 86_400_000
  const evaluate = (terrainAnalysisId: string, from: number, onProgress?: (p?: number, m?: string) => void, includeContext?: boolean) =>
    runJob(
      () =>
        provider.submitScenarioEvaluation(
          { terrainAnalysisId, startUtc: new Date(from).toISOString(), stopUtc: new Date(from + span).toISOString(), stepMinutes: s.stepMinutes, includeContext },
          signal,
        ),
      (id) => provider.getScenarioEvaluation(id, signal),
      (job) => onProgress?.(job.progress, job.message),
      signal,
    )

  setState((st) => ({ compareRuns: { ...st.compareRuns, [key]: { phase: 'terrain', progress: 0, stale: true, runKey } } }))
  try {
    const terrain = await terrainFor(site, signal, (progress, message) => live() && patchRun(key, runKey, { progress, message }))
    if (!live()) return
    rememberSkyline(site, terrain.profile)
    patchRun(key, runKey, { phase: 'ephemeris', terrain, progress: 0, message: undefined })
    const evaluation = await evaluate(terrain.id, startMs, (progress, message) => live() && patchRun(key, runKey, { progress, message }))
    if (!live()) return
    patchRun(key, runKey, { phase: 'ready', evaluation, stale: false, message: undefined })
    // The period before, for "vs Oct" next to each number. Not blocking.
    const previous = await evaluate(terrain.id, startMs - span, undefined, false).catch(() => undefined)
    if (live() && previous) patchRun(key, runKey, { previous })
  } catch (err) {
    if (live()) patchRun(key, runKey, { phase: 'error', error: describe(err) })
  } finally {
    if (controllers.get(key) === controller) controllers.delete(key)
  }
}

/** Starts what the current compared sites need and drops runs for removed sites. */
export function syncCompareRuns(): void {
  const s = getState()
  const wanted = new Set(s.compareSites.map((c) => c.key))
  for (const [key, c] of controllers) {
    if (!wanted.has(key)) {
      c.abort()
      controllers.delete(key)
    }
  }
  const kept = Object.fromEntries(Object.entries(s.compareRuns).filter(([k]) => wanted.has(k)))
  if (Object.keys(kept).length !== Object.keys(s.compareRuns).length) setState({ compareRuns: kept })
  for (const c of s.compareSites) void runSite(c.site)
}

/** Forces one compared site to run again (after an error). */
export function retryCompareSite(site: SiteCoordinates): void {
  const key = siteKey(site)
  setState((s) => {
    const rest = { ...s.compareRuns }
    delete rest[key]
    return { compareRuns: rest }
  })
  void runSite(site)
}

/**
 * Fetches skylines for the picker previews, one site at a time, while the
 * picker is open. Closing the picker stops it.
 */
export async function loadSkylines(sites: SiteCoordinates[]): Promise<void> {
  skylineController?.abort()
  const controller = new AbortController()
  skylineController = controller
  for (const site of sites) {
    if (controller.signal.aborted) return
    if (getState().skylines[siteKey(site)]) continue
    try {
      const terrain = await terrainFor(site, controller.signal)
      if (!controller.signal.aborted) rememberSkyline(site, terrain.profile)
    } catch {
      if (controller.signal.aborted) return
      // A missing preview is not an error worth showing: the row stays usable.
    }
  }
}

export function stopSkylines(): void {
  skylineController?.abort()
  skylineController = null
}
