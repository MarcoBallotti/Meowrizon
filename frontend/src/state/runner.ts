import { provider } from '../api'
import { runJob } from '../api/jobs'
import { getState, setState, updateScenario, type ScenarioKey } from './store'

const controllers: Partial<Record<ScenarioKey, AbortController>> = {}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'Errore sconosciuto.'
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
  } catch (err) {
    if (signal.aborted) return
    updateScenario(key, (sc) => ({ ...sc, run: { ...sc.run, phase: 'error', error: describe(err) } }))
  } finally {
    if (controllers[key] === controller) delete controllers[key]
  }
}

export async function loadCoverage(): Promise<void> {
  try {
    setState({ coverage: await provider.getCoverage() })
  } catch {
    setState({ coverage: null })
  }
}
