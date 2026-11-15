/**
 * "Terrain off" for the classroom: the same Sun and Earth positions over a
 * perfectly flat horizon. A body counts as in view whenever its centre is
 * above 0°, so the difference from the real result is what the hills do.
 * This is a teaching comparison, not an engine result.
 */
import type { BodyTrack, HorizonProfile, ScenarioEvaluation, TimeInterval } from '../api/types'

function intervalsOf(times: number[], up: boolean[]): TimeInterval[] {
  const out: TimeInterval[] = []
  let start: number | null = null
  for (let i = 0; i < times.length; i++) {
    if (up[i] && start === null) start = times[i]
    if (!up[i] && start !== null) {
      out.push({ startMs: start, endMs: times[i] })
      start = null
    }
  }
  if (start !== null) out.push({ startMs: start, endMs: times[times.length - 1], endTruncated: true })
  return out
}

function flatTrack(t: BodyTrack): BodyTrack {
  return {
    ...t,
    horizonDeg: t.elevationDeg.map(() => 0),
    centerVisible: t.elevationDeg.map((e) => e > 0),
    terrainVisibleFraction: undefined,
    visibleFraction: undefined,
  }
}

const cache = new WeakMap<ScenarioEvaluation, ScenarioEvaluation>()

export function flatEvaluation(ev: ScenarioEvaluation): ScenarioEvaluation {
  const hit = cache.get(ev)
  if (hit) return hit
  const sun = flatTrack(ev.sun)
  const earth = flatTrack(ev.earth)
  const both = sun.centerVisible.map((v, i) => v && earth.centerVisible[i])
  const out: ScenarioEvaluation = {
    ...ev,
    sun,
    earth,
    solarOccultedFraction: undefined,
    intervals: {
      ...ev.intervals,
      sun: intervalsOf(ev.timesMs, sun.centerVisible),
      earth: intervalsOf(ev.timesMs, earth.centerVisible),
      both: intervalsOf(ev.timesMs, both),
    },
  }
  cache.set(ev, out)
  return out
}

const profiles = new WeakMap<HorizonProfile, HorizonProfile>()

export function flatProfile(p: HorizonProfile): HorizonProfile {
  const hit = profiles.get(p)
  if (hit) return hit
  const out = { ...p, elevationDeg: p.elevationDeg.map(() => 0) }
  profiles.set(p, out)
  return out
}
