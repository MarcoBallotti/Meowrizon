/**
 * DEMO PROVIDER — synthetic data standing in for the numerical engine.
 *
 * Nothing here is scientific output. The horizon is procedural noise seeded by
 * the coordinates, and the Sun/Earth directions come from a crude analytic
 * model (mean synodic motion plus sinusoidal libration), with errors of
 * several degrees. Every object it returns has origin: 'demo', and the UI
 * labels it as such. It exists so the interface can be developed and
 * demonstrated before the Python engine is connected.
 */
import type {
  BodyTrack,
  CoverageCatalog,
  DataProvider,
  DemProduct,
  HorizonProfile,
  JobState,
  ScenarioEvaluation,
  ScenarioEvaluationRequest,
  TerrainAnalysis,
  TerrainAnalysisRequest,
  TimeInterval,
} from './types'
import { bestProductFor } from '../domain/coverage'
import { subEarthPoint, subSolarPoint } from '../domain/approxEphemeris'
import { topocentric } from '../domain/sky'

const DEG = Math.PI / 180
const MOON_RADIUS_KM = 1737.4

/** Real product descriptions; `available: false` because no engine is connected. */
export const DEM_CATALOG: DemProduct[] = [
  {
    id: 'lola-gdr-global',
    title: 'LOLA GDR global (e.g. LDEM_128)',
    pixelSizeM: 237,
    latMinDeg: -90,
    latMaxDeg: 90,
    source: 'NASA LRO / LOLA',
    url: 'https://imbrium.mit.edu/BROWSE/LOLA_GDR/',
    notes: 'Baseline coverage. PDS .IMG/.LBL or .JP2 formats still to normalise. Uneven measurement density.',
    available: false,
  },
  {
    id: 'sldem2015',
    title: 'SLDEM2015 (LOLA + Kaguya TC)',
    pixelSizeM: 59,
    latMinDeg: -60,
    latMaxDeg: 60,
    source: 'NASA GSFC PGDA',
    url: 'https://pgda.gsfc.nasa.gov/products/54',
    notes: '60°S–60°N band only.',
    available: false,
  },
  {
    id: 'LDEM_80S_20MPP_ADJ',
    title: 'LOLA south pole 20 m/pixel (LDEM_80S_20MPP_ADJ)',
    pixelSizeM: 20,
    latMinDeg: -90,
    latMaxDeg: -80,
    source: 'NASA GSFC PGDA',
    url: 'https://pgda.gsfc.nasa.gov/products/90',
    notes: 'COG/BigTIFF; HTTP Range access verified, content not decoded yet.',
    available: false,
  },
  {
    id: 'lola-sp-5mpp',
    title: 'LOLA south pole 5 m/pixel',
    pixelSizeM: 5,
    latMinDeg: -90,
    latMaxDeg: -87,
    source: 'NASA GSFC PGDA',
    url: 'https://pgda.gsfc.nasa.gov/products/81',
    notes: 'Listed for 87°–90°S; access not verified yet.',
    available: false,
  },
]


// ---------------------------------------------------------------- helpers

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seedFrom(lat: number, lon: number): number {
  // ~1 km quantisation keeps the demo terrain stable under tiny edits.
  const a = Math.round(lat * 30)
  const b = Math.round(lon * 30)
  return (Math.imul(a, 73856093) ^ Math.imul(b, 19349663)) >>> 0
}

function wrap360(x: number): number {
  return ((x % 360) + 360) % 360
}

function key(obj: unknown): string {
  return JSON.stringify(obj)
}

// ---------------------------------------------------------------- terrain

function syntheticHorizon(req: TerrainAnalysisRequest): HorizonProfile {
  const { latDeg, lonEastDeg } = req.site
  const rand = mulberry32(seedFrom(latDeg, lonEastDeg))
  const polar = Math.min(1, Math.max(0, (Math.abs(latDeg) - 70) / 18))
  // Tuned so polar demo sites alternate between light and shadow, as real rims do.
  const relief = 0.5 + 1.6 * polar + 0.8 * rand()

  const harmonics = Array.from({ length: 9 }, (_, i) => ({
    k: i + 1,
    amp: (relief / (i + 1) ** 0.9) * (0.4 + rand()),
    phase: rand() * 2 * Math.PI,
  }))
  const ridges = Array.from({ length: 2 + Math.floor(rand() * 3) }, () => ({
    center: rand() * 360,
    width: 6 + rand() * 25,
    height: relief * (0.5 + rand() * 1.2),
  }))

  const step = req.config.azimuthStepDeg
  const n = Math.round(360 / step)
  const azimuthDeg: number[] = []
  const elevationDeg: number[] = []
  // A taller mast sees slightly over the nearby terrain (purely illustrative).
  const heightDrop = Math.min(0.8, Math.sqrt(Math.max(0, req.observerHeightM)) * 0.08)
  const offset = -0.1 * relief - heightDrop

  for (let i = 0; i < n; i++) {
    const az = i * step
    let h = offset
    for (const { k, amp, phase } of harmonics) h += amp * 0.35 * Math.sin(k * az * DEG + phase)
    for (const r of ridges) {
      const d = Math.min(Math.abs(az - r.center), 360 - Math.abs(az - r.center))
      h += r.height * Math.exp(-((d / r.width) ** 2))
    }
    azimuthDeg.push(az)
    elevationDeg.push(Math.round(h * 1000) / 1000)
  }

  const product = bestProductFor(latDeg, DEM_CATALOG) ?? DEM_CATALOG[0]
  return {
    azimuthDeg,
    elevationDeg,
    observer: {
      site: { latDeg, lonEastDeg },
      surfaceHeightM: Math.round((rand() - 0.5) * 4000),
      heightAboveSurfaceM: req.observerHeightM,
      referenceRadiusKm: MOON_RADIUS_KM,
    },
    dem: { productIds: [product.id], effectivePixelSizeM: product.pixelSizeM, noDataFraction: 0 },
    params: { ...req.config },
    algorithmVersion: 'demo-procedural-0',
    warnings: ['Procedurally generated horizon: not derived from a DEM.'],
  }
}

// ---------------------------------------------------------------- ephemeris

function horizonAt(profile: HorizonProfile, az: number): number {
  const { azimuthDeg: azs, elevationDeg: hs } = profile
  const step = 360 / azs.length
  const x = wrap360(az) / step
  const i = Math.floor(x) % azs.length
  const j = (i + 1) % azs.length
  const f = x - Math.floor(x)
  return hs[i] * (1 - f) + hs[j] * f
}

function track(
  profile: HorizonProfile,
  times: number[],
  subPoint: (t: number) => [number, number],
): BodyTrack {
  const { latDeg, lonEastDeg } = profile.observer.site
  const out: BodyTrack = { azimuthDeg: [], elevationDeg: [], horizonDeg: [], centerVisible: [] }
  for (const t of times) {
    const [bl, bL] = subPoint(t)
    const [az, el] = topocentric(latDeg, lonEastDeg, bl, bL)
    const h = horizonAt(profile, az)
    out.azimuthDeg.push(az)
    out.elevationDeg.push(el)
    out.horizonDeg.push(h)
    out.centerVisible.push(el > h)
  }
  return out
}

/** Intervals from samples, with linear refinement of each crossing. */
function intervalsOf(times: number[], body: BodyTrack): TimeInterval[] {
  const margin = (i: number) => body.elevationDeg[i] - body.horizonDeg[i]
  const crossing = (i: number) => {
    const a = margin(i - 1)
    const b = margin(i)
    const f = a === b ? 0.5 : a / (a - b)
    return times[i - 1] + f * (times[i] - times[i - 1])
  }
  const out: TimeInterval[] = []
  let start: number | null = body.centerVisible[0] ? times[0] : null
  for (let i = 1; i < times.length; i++) {
    const was = body.centerVisible[i - 1]
    const is = body.centerVisible[i]
    if (!was && is) start = crossing(i)
    if (was && !is && start !== null) {
      out.push({ startMs: start, endMs: crossing(i) })
      start = null
    }
  }
  if (start !== null) out.push({ startMs: start, endMs: times[times.length - 1] })
  return out
}

function intersect(a: TimeInterval[], b: TimeInterval[]): TimeInterval[] {
  const out: TimeInterval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const s = Math.max(a[i].startMs, b[j].startMs)
    const e = Math.min(a[i].endMs, b[j].endMs)
    if (e > s) out.push({ startMs: s, endMs: e })
    if (a[i].endMs < b[j].endMs) i++
    else j++
  }
  return out
}

// ---------------------------------------------------------------- provider

interface DemoJob<T> {
  state: JobState<T>
  readyAt: number
  build: () => T
}

const MAX_SAMPLES = 20_000

export class DemoProvider implements DataProvider {
  readonly kind = 'demo' as const
  readonly label = 'Demo data'
  private jobs = new Map<string, DemoJob<unknown>>()
  private byKey = new Map<string, string>()
  private analyses = new Map<string, TerrainAnalysis>()
  private seq = 0

  /** Simulates the engine's queue: cache hit returns completed immediately. */
  private submit<T>(cacheKey: string, latencyMs: number, build: () => T): JobState<T> {
    const existing = this.byKey.get(cacheKey)
    if (existing) return this.advance<T>(existing)
    const id = `demo-${++this.seq}`
    const job: DemoJob<T> = { state: { id, status: 'queued', progress: 0 }, readyAt: Date.now() + latencyMs, build }
    this.jobs.set(id, job as DemoJob<unknown>)
    this.byKey.set(cacheKey, id)
    return { ...job.state }
  }

  private advance<T>(id: string): JobState<T> {
    const job = this.jobs.get(id) as DemoJob<T> | undefined
    if (!job) return { id, status: 'failed', error: { code: 'not_found', message: 'Job not found.' } }
    if (job.state.status !== 'completed') {
      const remaining = job.readyAt - Date.now()
      if (remaining <= 0) {
        job.state = { id, status: 'completed', progress: 1, result: job.build() }
      } else {
        job.state = { id, status: 'running', progress: Math.min(0.95, 1 - remaining / 1400) }
      }
    }
    return { ...job.state }
  }

  async getCoverage(): Promise<CoverageCatalog> {
    return { origin: 'demo', products: DEM_CATALOG }
  }

  async submitTerrainAnalysis(req: TerrainAnalysisRequest): Promise<JobState<TerrainAnalysis>> {
    return this.submit(`terrain:${key(req)}`, 900 + Math.random() * 500, () => {
      const id = `ta-${this.seq}-${Math.round(req.site.latDeg * 1e4)}-${Math.round(req.site.lonEastDeg * 1e4)}`
      const analysis: TerrainAnalysis = { id, origin: 'demo', preview: false, profile: syntheticHorizon(req) }
      this.analyses.set(id, analysis)
      return analysis
    })
  }

  async getTerrainAnalysis(id: string): Promise<JobState<TerrainAnalysis>> {
    return this.advance(id)
  }

  async submitScenarioEvaluation(req: ScenarioEvaluationRequest): Promise<JobState<ScenarioEvaluation>> {
    const analysis = this.analyses.get(req.terrainAnalysisId)
    if (!analysis) {
      return {
        id: 'invalid',
        status: 'failed',
        error: { code: 'unknown_analysis', message: 'Terrain analysis not found.' },
      }
    }
    const start = Date.parse(req.startUtc)
    const stop = Date.parse(req.stopUtc)
    const stepMs = req.stepMinutes * 60_000
    if (!(stop > start) || !(stepMs > 0) || (stop - start) / stepMs > MAX_SAMPLES) {
      return {
        id: 'invalid',
        status: 'failed',
        error: { code: 'invalid_range', message: `Invalid range or more than ${MAX_SAMPLES} samples.` },
      }
    }
    return this.submit(`eval:${key(req)}`, 350, () => {
      const times: number[] = []
      for (let t = start; t <= stop; t += stepMs) times.push(t)
      const sun = track(analysis.profile, times, subSolarPoint)
      const earth = track(analysis.profile, times, subEarthPoint)
      const sunI = intervalsOf(times, sun)
      const earthI = intervalsOf(times, earth)
      return {
        id: `se-${this.seq}`,
        origin: 'demo',
        terrainAnalysisId: req.terrainAnalysisId,
        timeScale: 'UTC',
        timesMs: times,
        sun,
        earth,
        intervals: { sun: sunI, earth: earthI, both: intersect(sunI, earthI) },
        visibilityModel: 'body-center',
        ephemeris: {
          source: 'Demo analytic model',
          version: 'demo-0',
          kernels: [],
          corrections: 'None (bodies at infinity, no parallax or aberration)',
        },
        approximations: [
          'Synthetic horizon, not computed from a DEM.',
          'Sun and Earth directions from mean synodic motion and sinusoidal libration: errors of several degrees.',
          'Visibility refers to the centre of the disc only.',
        ],
      }
    })
  }

  async getScenarioEvaluation(id: string): Promise<JobState<ScenarioEvaluation>> {
    return this.advance(id)
  }
}
