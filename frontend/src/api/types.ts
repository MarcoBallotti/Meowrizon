/**
 * Contract between the frontend and the numerical engine.
 *
 * Conventions (shared by every provider):
 * - Angles in degrees. Azimuth measured from local North, clockwise
 *   (N 0°, E 90°, S 180°, W 270°). Elevation relative to the local
 *   horizontal plane of the observer.
 * - Longitudes are planetocentric East longitudes normalised to [-180, 180).
 * - Times are UTC, transported as ISO 8601 strings in requests and as
 *   Unix epoch milliseconds in sampled series.
 * - Heights in metres unless the field name says otherwise.
 *
 * Every result carries `origin`: 'demo' results are synthetic and must never be
 * presented as scientific analysis; 'engine' results come from the backend.
 */

export type DataOrigin = 'demo' | 'engine'

export interface SiteCoordinates {
  latDeg: number
  lonEastDeg: number
}

// ---------------------------------------------------------------- coverage

export interface DemProduct {
  id: string
  title: string
  /** Declared pixel size. Not the same as the measured detail. */
  pixelSizeM: number
  /** Latitude band covered, inclusive. */
  latMinDeg: number
  latMaxDeg: number
  source: string
  url: string
  /** Free-text caveats about quality, interpolation, availability. */
  notes: string
  /** Whether the engine currently has this product prepared on disk. */
  available: boolean
}

export interface CoverageCatalog {
  origin: DataOrigin
  products: DemProduct[]
}

// ---------------------------------------------------------------- jobs

export type JobStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface JobState<T> {
  id: string
  status: JobStatus
  /** 0..1 when the engine can estimate it. */
  progress?: number
  message?: string
  result?: T
  error?: { code: string; message: string }
}

// ---------------------------------------------------------------- terrain

export interface TerrainAnalysisRequest {
  priority?: 'interactive' | 'background'
  site: SiteCoordinates
  /** Height of the observer (panel, antenna, camera) above the DEM surface. */
  observerHeightM: number
  /** Derive a local slope/roughness fit from the already loaded elevation window. */
  includeLocalTerrain?: boolean
  config: {
    azimuthStepDeg: number
    maxDistanceKm: number
  }
}

export interface HorizonProfile {
  /** Strictly increasing, covering [0, 360). */
  azimuthDeg: number[]
  /** Terrain horizon angle H(azimuth). Can be negative. */
  elevationDeg: number[]
  observer: {
    site: SiteCoordinates
    /** DEM surface height relative to the product reference. */
    surfaceHeightM: number | null
    heightAboveSurfaceM: number
    referenceRadiusKm: number
  }
  dem: {
    productIds: string[]
    effectivePixelSizeM: number
    noDataFraction: number
  }
  params: {
    azimuthStepDeg: number
    maxDistanceKm: number
  }
  algorithmVersion: string
  warnings: string[]
}

export interface TerrainAnalysis {
  id: string
  origin: DataOrigin
  /** True for a lower-resolution preview superseded by a later result. */
  preview: boolean
  profile: HorizonProfile
  localTerrain?: LocalTerrain
}

export interface LocalTerrain {
  status: 'ok' | 'unknown'
  reason: string | null
  slopeDeg: number | null
  roughnessRmsM: number | null
  supportDiameterM: number
  sourcePixelSizeM: number
  sampleCount: number
  validFraction: number | null
  productId: string
  sha256: string
}

// ---------------------------------------------------------------- scenario

export interface ScenarioEvaluationRequest {
  horizonMode?: 'terrain' | 'ideal'
  terrainAnalysisId: string
  startUtc: string
  stopUtc: string
  stepMinutes: number
  includeContext?: boolean
}

/** Ranking can end early without pretending to have evaluated Earth or overlap. */
export interface SkippedEvaluation {
  skipped: true
  origin: 'engine'
  terrainAnalysisId: string
  startMs: number
  stopMs: number
  reason: 'sunlight_below_threshold'
  minSunFraction: number
  sunFractionUpperBound: number
}

export type RankingEvaluation = ScenarioEvaluation | SkippedEvaluation

export interface BodyTrack {
  azimuthDeg: number[]
  elevationDeg: number[]
  /** Terrain horizon along the body azimuth at each sample. */
  horizonDeg: number[]
  /** Engine classification of the body centre: above the terrain horizon. */
  centerVisible: boolean[]
  visibleFraction?: number[]
  terrainVisibleFraction?: number[]
  angularRadiusDeg?: number[]
  distanceKm?: number[]
  illuminatedFraction?: number[]
}

export interface TimeInterval {
  startMs: number
  endMs: number
  startTruncated?: boolean
  endTruncated?: boolean
}

export type BodyId = 'sun' | 'earth'

export interface ScenarioEvaluation {
  horizonMode?: 'terrain' | 'ideal'
  id: string
  origin: DataOrigin
  terrainAnalysisId: string
  timeScale: 'UTC'
  timesMs: number[]
  sun: BodyTrack
  earth: BodyTrack
  /** Engine-refined intervals; the timeline draws these, not the samples. */
  intervals: {
    sun: TimeInterval[]
    earth: TimeInterval[]
    both: TimeInterval[]
    eclipse?: TimeInterval[]
  }
  /** Which geometric condition `centerVisible` and `intervals` describe. */
  visibilityModel: 'body-center' | 'disc-fraction-c3'
  solarOccultedFraction?: number[]
  eclipseCalendar?: { startMs: number; stopMs: number; source: string; events: import('../domain/eclipses').SiteEclipse[] }
  orbit?: { timesMs: number[]; sunKm: [number, number, number][]; moonKm: [number, number, number][]; frame: string; source: string }
  ephemeris: {
    source: string
    version: string
    kernels: string[]
    corrections: string
  }
  approximations: string[]
}

// ---------------------------------------------------------------- provider

export interface DataProvider {
  readonly kind: 'demo' | 'api'
  readonly label: string
  getCoverage(signal?: AbortSignal): Promise<CoverageCatalog>
  submitTerrainAnalysis(req: TerrainAnalysisRequest, signal?: AbortSignal): Promise<JobState<TerrainAnalysis>>
  getTerrainAnalysis(id: string, signal?: AbortSignal): Promise<JobState<TerrainAnalysis>>
  submitScenarioEvaluation(
    req: ScenarioEvaluationRequest,
    signal?: AbortSignal,
  ): Promise<JobState<ScenarioEvaluation>>
  getScenarioEvaluation(id: string, signal?: AbortSignal): Promise<JobState<ScenarioEvaluation>>
}
