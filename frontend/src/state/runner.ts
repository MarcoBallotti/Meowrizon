import { catalogApi, provider } from '../api'
import { runJob } from '../api/jobs'
import type { ScenarioEvaluation, SiteCoordinates } from '../api/types'
import { loadRegions, rank } from '../domain/ranking'
import { regionCatalog, siteCatalog } from '../domain/catalogs'
import { intervalStats } from '../domain/sampling'
import { getState, setState, updateScenario, type ScenarioKey, type SiteSummary } from './store'

const controllers: Partial<Record<ScenarioKey, AbortController>> = {}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Unknown error.'
}

/**
 * Runs terrain analysis then scenario evaluation for one scenario.
 * A newer call aborts the previous one, so changing the site mid-run never
 * lets an outdated result overwrite the current inputs.
 */
export async function runScenario(key: ScenarioKey): Promise<void> {
  controllers[key]?.abort()
  const controller = new AbortController()
  controllers[key] = controller
  const { signal } = controller

  const s = getState()
  const { input } = s.scenarios[key]
  const stopMs = input.startMs + s.durationDays * 86_400_000

  try {
    updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, phase: 'terrain', progress: 0, error: undefined } }))
    const terrain = await runJob(
      () =>
        provider.submitTerrainAnalysis(
          {
            site: input.site,
            observerHeightM: input.observerHeightM,
            config: { azimuthStepDeg: s.azimuthStepDeg, maxDistanceKm: s.maxDistanceKm },
          },
          signal,
        ),
      (id) => provider.getTerrainAnalysis(id, signal),
      (job) => {
        if (!signal.aborted) updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, progress: job.progress } }))
      },
      signal,
    )
    if (signal.aborted) return
    updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, phase: 'ephemeris', progress: 0 } }))

    const evaluation = await runJob(
      () =>
        provider.submitScenarioEvaluation(
          {
            terrainAnalysisId: terrain.id,
            startUtc: new Date(input.startMs).toISOString(),
            stopUtc: new Date(stopMs).toISOString(),
            stepMinutes: s.stepMinutes,
          },
          signal,
        ),
      (id) => provider.getScenarioEvaluation(id, signal),
      (job) => {
        if (!signal.aborted) updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, progress: job.progress } }))
      },
      signal,
    )
    if (signal.aborted) return
    // Inputs may have changed after submission (a rerun is then pending).
    updateScenario(key, (sc) => ({
      ...sc,
      run: { phase: 'ready', terrain, evaluation, stale: sc.input !== input || getState().durationDays !== s.durationDays },
    }))

    // The period before, for the comparison next to every number. Not blocking.
    const previous = await runJob(
      () =>
        provider.submitScenarioEvaluation(
          {
            terrainAnalysisId: terrain.id,
            startUtc: new Date(input.startMs - s.durationDays * 86_400_000).toISOString(),
            stopUtc: new Date(input.startMs).toISOString(),
            stepMinutes: s.stepMinutes,
          },
          signal,
        ),
      (id) => provider.getScenarioEvaluation(id, signal),
      () => undefined,
      signal,
    ).catch(() => undefined)
    if (signal.aborted || !previous) return
    updateScenario(key, (sc) => (sc.run.evaluation === evaluation ? { ...sc, run: { ...sc.run, previous } } : sc))
  } catch (err) {
    if (signal.aborted) return
    updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, phase: 'error', error: describe(err) } }))
  } finally {
    if (controllers[key] === controller) delete controllers[key]
  }
}

export function summarize(ev: ScenarioEvaluation, startMs: number, endMs: number): SiteSummary {
  return {
    sun: intervalStats(ev.intervals.sun, startMs, endMs).fraction,
    earth: intervalStats(ev.intervals.earth, startMs, endMs).fraction,
    both: intervalStats(ev.intervals.both, startMs, endMs).fraction,
    nightH: intervalStats(ev.intervals.sun, startMs, endMs).longestOffMs / 3_600_000,
  }
}

let comparisonController: AbortController | null = null

/**
 * Computes the top three regions of the ranking for the same period as
 * scenario A (and the period before), so the site can be compared fairly.
 */
export async function runComparison(): Promise<void> {
  if (provider.kind === 'api') return // No approved regional calculation endpoint yet.
  const s = getState()
  const catalog = s.regions
  const A = s.scenarios.A
  if (!catalog) return
  const own = catalog.regions.find((r) => r.name === A.input.siteName)
  const area = own ? own.area : s.area
  const picks = rank(catalog.regions, s.rankBy, area).filter((r) => r.name !== A.input.siteName).slice(0, 3)
  const key = JSON.stringify([picks.map((p) => p.id), A.input.startMs, A.input.observerHeightM, s.durationDays, s.stepMinutes])
  if (s.comparison?.key === key) return

  comparisonController?.abort()
  const controller = new AbortController()
  comparisonController = controller
  const { signal } = controller
  setState({ comparison: { key, busy: true, items: [] } })

  const span = s.durationDays * 86_400_000
  const start = A.input.startMs
  const evaluate = async (terrainAnalysisId: string, from: number) =>
    runJob(
      () =>
        provider.submitScenarioEvaluation(
          { terrainAnalysisId, startUtc: new Date(from).toISOString(), stopUtc: new Date(from + span).toISOString(), stepMinutes: s.stepMinutes },
          signal,
        ),
      (id) => provider.getScenarioEvaluation(id, signal),
      () => undefined,
      signal,
    )
  try {
    const items = await Promise.all(
      picks.map(async (r) => {
        const site: SiteCoordinates = r.center
        const terrain = await runJob(
          () => provider.submitTerrainAnalysis({ site, observerHeightM: A.input.observerHeightM, config: { azimuthStepDeg: s.azimuthStepDeg, maxDistanceKm: s.maxDistanceKm } }, signal),
          (id) => provider.getTerrainAnalysis(id, signal),
          () => undefined,
          signal,
        )
        const [now, before] = await Promise.all([evaluate(terrain.id, start), evaluate(terrain.id, start - span).catch(() => null)])
        return { name: r.name, now: summarize(now, start, start + span), prev: before ? summarize(before, start - span, start) : null }
      }),
    )
    if (!signal.aborted) setState({ comparison: { key, busy: false, items } })
  } catch {
    if (!signal.aborted) setState({ comparison: { key, busy: false, items: [] } })
  }
}

let regionRequest: ReturnType<typeof catalogApi.getRegions> | null = null
let siteRequest: ReturnType<typeof catalogApi.getSites> | null = null

export async function loadRegionCatalog(): Promise<void> {
  setState({ regionError: null })
  try {
    const catalog = provider.kind === 'api'
      ? regionCatalog(await (regionRequest ??= catalogApi.getRegions()))
      : await loadRegions()
    setState({ regions: catalog })
  } catch (err) {
    regionRequest = null
    setState({ regions: null, regionError: describe(err) })
  }
}

export async function loadSiteCatalog(): Promise<void> {
  if (provider.kind !== 'api') return
  setState({ siteError: null })
  try {
    const sites = siteCatalog(await (siteRequest ??= catalogApi.getSites()))
    setState({ sites })
  } catch (err) {
    siteRequest = null
    setState({ sites: [], siteError: describe(err) })
  }
}

export async function loadCoverage(): Promise<void> {
  try {
    setState({ coverage: await provider.getCoverage() })
  } catch {
    setState({ coverage: null })
  }
}
