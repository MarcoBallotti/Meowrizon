import { useSyncExternalStore } from 'react'
import type { CoverageCatalog, ScenarioEvaluation, SiteCoordinates, TerrainAnalysis } from '../api/types'
import type { AreaFilter, RankBy, Region, RegionCatalog } from '../domain/ranking'
import { EXAMPLE_SITES } from '../domain/sites'
import type { ExampleSite } from '../domain/sites'
import { provider } from '../api'

export type ScenarioKey = 'A' | 'B'

/** Who is reading: the whole tool adapts its copy, density and data. */
export type Audience = 'student' | 'teacher' | 'planner'
export const AUDIENCES: { id: Audience; label: string; hint: string }[] = [
  // Most technical first. The id stays `planner`; the label says who it is for.
  { id: 'planner', label: 'Engineer', hint: 'For mission engineers: full technical data, exact times, A/B comparison.' },
  { id: 'teacher', label: 'Teacher', hint: 'Numbers with explanations and prompts for the class.' },
  { id: 'student', label: 'Student', hint: 'Plain words, big pictures, no jargon.' },
]

export type Screen = 'moon' | 'explore' | 'site' | 'kit'

/** Period summary used to compare sites. Fractions 0..1, night in hours. */
export interface SiteSummary {
  sun: number
  earth: number
  both: number
  nightH: number
}

export interface Comparison {
  key: string
  busy: boolean
  items: { name: string; now: SiteSummary; prev: SiteSummary | null }[]
}

/**
 * Candidate regions measured for the chosen period, so they can be ranked
 * best to worst. Filled one region at a time as the engine answers.
 */
export interface RegionRanking {
  key: string
  busy: boolean
  /** Regions to measure, in catalog order. */
  total: number
  /** Measured regions (Sun, Earth, both, longest night). */
  regions: Region[]
  /** Names of the regions the engine could not measure. */
  failed: string[]
  /** Name of the region being measured now. */
  current: string | null
}

export interface ScenarioInput {
  site: SiteCoordinates
  /** Name of the example site when chosen from the list; null for free picks. */
  siteName: string | null
  selectionId?: string | null
  observerHeightM: number
  startMs: number
}

export type RunPhase = 'idle' | 'terrain' | 'ephemeris' | 'ready' | 'error'

export interface ScenarioRun {
  phase: RunPhase
  progress?: number
  /** Terrain becomes available independently of the subsequent scenario evaluation. */
  terrain?: TerrainAnalysis
  evaluation?: ScenarioEvaluation
  /** Same length of time just before the start, for "vs last month". */
  previous?: ScenarioEvaluation
  /** True while the shown results no longer match the inputs. */
  stale: boolean
  error?: string
  message?: string
}

export interface Scenario {
  input: ScenarioInput
  run: ScenarioRun
}

export interface AppState {
  screen: Screen
  audience: Audience
  scenarios: Record<ScenarioKey, Scenario>
  active: ScenarioKey
  compare: boolean
  durationDays: number
  stepMinutes: number
  azimuthStepDeg: number
  maxDistanceKm: number
  cursorOffsetMs: number
  playing: boolean
  /** Simulated hours per real second during playback. */
  speed: number
  coverage: CoverageCatalog | null
  regions: RegionCatalog | null
  sites: ExampleSite[]
  regionError: string | null
  siteError: string | null
  /** Top regions of the ranking, computed for the same period as scenario A. */
  comparison: Comparison | null
  /** Candidate regions measured for scenario A's period (engine only). */
  ranking: RegionRanking | null
  rankBy: RankBy
  area: AreaFilter
  /** Incremented to ask the globe to fly to a scenario. */
  flyRequest: { key: ScenarioKey; nonce: number } | null
}

const startOfTodayUtc = (() => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
})()

const first = EXAMPLE_SITES[0]
const second = EXAMPLE_SITES[2]

function storedAudience(): Audience {
  try {
    const v = localStorage.getItem('meowrizon.audience')
    if (v === 'student' || v === 'teacher' || v === 'planner') return v
  } catch {
    // Storage unavailable (private mode, blocked site data): use the default.
  }
  return 'student'
}

export function screenFromHash(hash: string): Screen {
  if (hash.startsWith('#/site')) return 'site'
  if (hash.startsWith('#/kit')) return 'kit'
  if (hash.startsWith('#/explore')) return 'explore'
  return 'moon'
}

const initialState: AppState = {
  screen: screenFromHash(typeof location === 'undefined' ? '' : location.hash),
  audience: storedAudience(),
  scenarios: {
    A: {
      input: { site: { latDeg: first.latDeg, lonEastDeg: first.lonEastDeg }, siteName: provider.kind === 'demo' ? first.name : null, observerHeightM: 2, startMs: startOfTodayUtc },
      run: { phase: 'idle', stale: true },
    },
    B: {
      input: { site: { latDeg: second.latDeg, lonEastDeg: second.lonEastDeg }, siteName: provider.kind === 'demo' ? second.name : null, observerHeightM: 2, startMs: startOfTodayUtc },
      run: { phase: 'idle', stale: true },
    },
  },
  active: 'A',
  compare: false,
  durationDays: 30,
  stepMinutes: 30,
  azimuthStepDeg: 0.5,
  maxDistanceKm: 150,
  cursorOffsetMs: 0,
  playing: false,
  speed: 12,
  coverage: null,
  regions: null,
  sites: provider.kind === 'demo' ? EXAMPLE_SITES : [],
  regionError: null,
  siteError: null,
  comparison: null,
  ranking: null,
  rankBy: 'overall',
  area: 'all',
  flyRequest: null,
}

type Listener = () => void

let state = initialState
const listeners = new Set<Listener>()

export function getState(): AppState {
  return state
}

export function setState(update: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const patch = typeof update === 'function' ? update(state) : update
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

export function updateScenario(key: ScenarioKey, fn: (s: Scenario) => Scenario): void {
  setState((s) => ({ scenarios: { ...s.scenarios, [key]: fn(s.scenarios[key]) } }))
}

export function setScenarioInput(key: ScenarioKey, patch: Partial<ScenarioInput>): void {
  if (patch.site && !('selectionId' in patch)) patch = { ...patch, selectionId: null }
  updateScenario(key, (s) => ({ input: { ...s.input, ...patch }, run: { phase: 'idle', stale: true } }))
}

export function setAudience(audience: Audience): void {
  try {
    localStorage.setItem('meowrizon.audience', audience)
  } catch {
    // Not persisted; the choice still applies to this visit.
  }
  setState({ audience })
}

export function goTo(screen: Screen): void {
  const hash = screen === 'moon' ? '#/' : `#/${screen}`
  if (location.hash !== hash) history.pushState(null, '', hash)
  // Plan and results share one layout and one Moon window: no transition to run.
  setState({ screen, playing: false })
  window.scrollTo(0, 0)
}

function subscribe(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Selectors must return stable references (primitives or stored objects). */
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state))
}

export function durationMs(s: AppState): number {
  return s.durationDays * 86_400_000
}
