import { useSyncExternalStore } from 'react'
import type { CoverageCatalog, ScenarioEvaluation, SiteCoordinates, TerrainAnalysis } from '../api/types'
import { EXAMPLE_SITES } from '../domain/sites'

export type ScenarioKey = 'A' | 'B'

export interface ScenarioInput {
  site: SiteCoordinates
  /** Name of the example site when chosen from the list; null for free picks. */
  siteName: string | null
  observerHeightM: number
  startMs: number
}

export type RunPhase = 'idle' | 'terrain' | 'ephemeris' | 'ready' | 'error'

export interface ScenarioRun {
  phase: RunPhase
  progress?: number
  /** Results stay visible while a newer run is in progress. */
  terrain?: TerrainAnalysis
  evaluation?: ScenarioEvaluation
  /** True while the shown results no longer match the inputs. */
  stale: boolean
  error?: string
}

export interface Scenario {
  input: ScenarioInput
  run: ScenarioRun
}

export interface AppState {
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
  /** Incremented to ask the globe to fly to a scenario. */
  flyRequest: { key: ScenarioKey; nonce: number } | null
}

const startOfTodayUtc = (() => {
  const d = new Date()
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
})()

const first = EXAMPLE_SITES[0]
const second = EXAMPLE_SITES[2]

const initialState: AppState = {
  scenarios: {
    A: {
      input: { site: { latDeg: first.latDeg, lonEastDeg: first.lonEastDeg }, siteName: first.name, observerHeightM: 2, startMs: startOfTodayUtc },
      run: { phase: 'idle', stale: true },
    },
    B: {
      input: { site: { latDeg: second.latDeg, lonEastDeg: second.lonEastDeg }, siteName: second.name, observerHeightM: 2, startMs: startOfTodayUtc },
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
  updateScenario(key, (s) => ({ input: { ...s.input, ...patch }, run: { ...s.run, stale: true } }))
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
