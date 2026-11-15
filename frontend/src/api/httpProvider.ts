import type {
  CoverageCatalog,
  DataProvider,
  JobState,
  RankingEvaluation,
  ScenarioEvaluation,
  ScenarioEvaluationRequest,
  TerrainAnalysis,
  TerrainAnalysisRequest,
} from './types'

export class HttpError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * Client for the Python engine. Endpoints follow docs/api-contract.md.
 * The engine owns caching and deduplication: a POST returns either a
 * completed job (cache hit) or a queued/running one to poll.
 */
export class HttpProvider implements DataProvider {
  readonly kind = 'api' as const
  readonly label = 'Numerical engine'
  private readonly base: string

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, '')
  }

  private async request<T>(path: string, init: RequestInit & { signal?: AbortSignal } = {}): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...init.headers },
    })
    if (!res.ok) {
      let detail = res.statusText
      try {
        const body = (await res.json()) as { detail?: unknown }
        if (typeof body.detail === 'string') detail = body.detail
      } catch {
        // Non-JSON error body: keep the status text.
      }
      throw new HttpError(res.status, `API ${res.status}: ${detail}`)
    }
    return (await res.json()) as T
  }

  getCoverage(signal?: AbortSignal): Promise<CoverageCatalog> {
    return this.request('/coverage', { signal })
  }

  getRegions(signal?: AbortSignal): Promise<unknown> {
    return this.request('/regions', { signal })
  }

  getSites(signal?: AbortSignal): Promise<unknown> {
    return this.request('/sites', { signal })
  }

  getSources(signal?: AbortSignal): Promise<Record<string, unknown[]>> { return this.request('/data/sources', { signal }) }
  getDatasets(signal?: AbortSignal): Promise<DataSetRecord[]> { return this.request('/data/datasets', { signal }) }
  collectSources(names?: string[], refresh = false): Promise<DataJob> {
    return this.request('/data/collect', { method: 'POST', body: JSON.stringify({ names, refresh }) })
  }
  getDataJob(id: string): Promise<DataJob> { return this.request(`/data/jobs/${encodeURIComponent(id)}`) }
  getSamples(id: string, startMs?: number, stopMs?: number): Promise<unknown> {
    const q = new URLSearchParams()
    if (startMs !== undefined) q.set('start_ms', String(startMs))
    if (stopMs !== undefined) q.set('stop_ms', String(stopMs))
    return this.request(`/data/datasets/${encodeURIComponent(id)}/samples${q.size ? `?${q}` : ''}`)
  }
  getProducts(id: string, title = ''): Promise<unknown> {
    return this.request(`/data/datasets/${encodeURIComponent(id)}/products?title_contains=${encodeURIComponent(title)}`)
  }
  getRegionsData(id: string): Promise<unknown> { return this.request(`/data/datasets/${encodeURIComponent(id)}/regions`) }

  submitTerrainAnalysis(req: TerrainAnalysisRequest, signal?: AbortSignal): Promise<JobState<TerrainAnalysis>> {
    return this.request('/terrain-analyses', { method: 'POST', body: JSON.stringify(req), signal })
  }

  getTerrainAnalysis(id: string, signal?: AbortSignal): Promise<JobState<TerrainAnalysis>> {
    return this.request(`/terrain-analyses/${encodeURIComponent(id)}`, { signal })
  }

  submitScenarioEvaluation(
    req: ScenarioEvaluationRequest,
    signal?: AbortSignal,
  ): Promise<JobState<ScenarioEvaluation>> {
    return this.request('/scenario-evaluations', { method: 'POST', body: JSON.stringify(req), signal })
  }

  getScenarioEvaluation(id: string, signal?: AbortSignal): Promise<JobState<ScenarioEvaluation>> {
    return this.request(`/scenario-evaluations/${encodeURIComponent(id)}`, { signal })
  }

  submitRankingEvaluation(req: ScenarioEvaluationRequest & { minSunFraction: number }, signal?: AbortSignal): Promise<JobState<RankingEvaluation>> {
    return this.request('/scenario-evaluations', { method: 'POST', body: JSON.stringify({ ...req, includeContext: false }), signal })
  }

  getRankingEvaluation(id: string, signal?: AbortSignal): Promise<JobState<RankingEvaluation>> {
    return this.request(`/scenario-evaluations/${encodeURIComponent(id)}`, { signal })
  }
}

export interface DataSetRecord { id: string; name: string; status: string; [key: string]: unknown }
export interface DataJob { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress?: number; error?: string; result?: unknown }
