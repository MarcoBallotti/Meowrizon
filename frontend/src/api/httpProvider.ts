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

  private async submitJob<T>(path: string, body: unknown, priority: string, signal?: AbortSignal): Promise<JobState<T>> {
    signal?.throwIfAborted()
    const consumer = crypto.randomUUID()
    // Keep the submission alive until its ID arrives so an abort can release its lease.
    const job = await this.request<JobState<T>>(path, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'X-Job-Consumer': consumer, 'X-Job-Priority': priority },
    })
    if (job.status === 'queued' || job.status === 'running') {
      const cancel = () => {
        const remaining = this.cleanups.get(job.id)?.filter(fn => fn !== cleanup) ?? []
        if (remaining.length) this.cleanups.set(job.id, remaining)
        else this.cleanups.delete(job.id)
        void this.request(`${path}/${encodeURIComponent(job.id)}`, {
          method: 'DELETE', headers: { 'X-Job-Consumer': consumer },
        }).catch(() => undefined)
      }
      const cleanup = () => signal?.removeEventListener('abort', cancel)
      if (signal?.aborted) cancel()
      else if (signal) {
        signal.addEventListener('abort', cancel, { once: true })
        const cleanups = this.cleanups.get(job.id) ?? []
        cleanups.push(cleanup)
        this.cleanups.set(job.id, cleanups)
      }
    }
    signal?.throwIfAborted()
    return job
  }

  private cleanups = new Map<string, (() => void)[]>()

  private async pollJob<T>(path: string, id: string, signal?: AbortSignal): Promise<JobState<T>> {
    const job = await this.request<JobState<T>>(`${path}/${encodeURIComponent(id)}`, { signal })
    if (job.status === 'completed' || job.status === 'failed') {
      this.cleanups.get(id)?.forEach(cleanup => cleanup())
      this.cleanups.delete(id)
    }
    return job
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
    const { priority = 'interactive', ...body } = req
    return this.submitJob('/terrain-analyses', body, priority, signal)
  }

  getTerrainAnalysis(id: string, signal?: AbortSignal): Promise<JobState<TerrainAnalysis>> {
    return this.pollJob('/terrain-analyses', id, signal)
  }

  submitScenarioEvaluation(
    req: ScenarioEvaluationRequest,
    signal?: AbortSignal,
  ): Promise<JobState<ScenarioEvaluation>> {
    return this.submitJob('/scenario-evaluations', req, req.includeContext === false ? 'background' : 'interactive', signal)
  }

  getScenarioEvaluation(id: string, signal?: AbortSignal): Promise<JobState<ScenarioEvaluation>> {
    return this.pollJob('/scenario-evaluations', id, signal)
  }

  submitRankingEvaluation(req: ScenarioEvaluationRequest & { minSunFraction: number }, signal?: AbortSignal): Promise<JobState<RankingEvaluation>> {
    return this.submitJob('/scenario-evaluations', { ...req, includeContext: false }, 'background', signal)
  }

  getRankingEvaluation(id: string, signal?: AbortSignal): Promise<JobState<RankingEvaluation>> {
    return this.pollJob('/scenario-evaluations', id, signal)
  }
}

export interface DataSetRecord { id: string; name: string; status: string; [key: string]: unknown }
export interface DataJob { id: string; status: 'queued' | 'running' | 'completed' | 'failed'; progress?: number; error?: string; result?: unknown }
