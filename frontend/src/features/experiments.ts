/** Educator experiments: pairs of sites that make one difficulty visible. */
import type { SiteCoordinates } from '../api/types'
import { lessonSlots } from '../domain/learning'
import { goTo, getState, setState, siteKey, type CompareSite } from '../state/store'

export interface Experiment {
  id: string
  title: string
  /** What the class should look for while the month plays. */
  notice: string
  /** Question to ask before pressing play. */
  ask: string
  sites: { name: string; site: SiteCoordinates }[]
}

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'dates', title: 'One site, two dates',
    ask: 'Will this place have the same light and communication windows at two different dates?',
    notice: 'Keep the site and duration fixed. Follow the same elapsed day in each period and compare sunlight, Earth visibility and interruptions. Use the observations to test your prediction.',
    sites: [],
  },
  {
    id: 'terrain', title: 'One site, with and without terrain',
    ask: 'What changes when only the terrain horizon is replaced by a flat horizon?',
    notice: 'The observer, dates, apparent discs and eclipses remain the same. Only the terrain horizon changes. Look for the moments where a ridge blocks a body; a zero-degree horizon is an idealized comparison, not a real site.',
    sites: [],
  },
  {
    id: 'pole-equator',
    title: 'South pole or equator?',
    ask: 'Where will the Sun stay up longer: at the pole or at the equator?',
    notice: 'At the pole the Sun circles low around the horizon and hills can hide it. At the equator it climbs high for two weeks, then sets for two weeks.',
    sites: [
      { name: 'Peak Near Shackleton', site: { latDeg: -88.811, lonEastDeg: 123.69 } },
      { name: 'Apollo 11 · Tranquility Base', site: { latDeg: 0.6741, lonEastDeg: 23.473 } },
    ],
  },
  {
    id: 'peak-crater',
    title: 'Peak or crater floor?',
    ask: 'These two places are about 30 km apart. Will they get the same sunlight?',
    notice: 'Compare when the ridge and crater floor lose sight of the Sun. Do their dark intervals coincide? The answer depends on the selected period and the resolved terrain; neither name guarantees continuous light or permanent darkness.',
    sites: [
      { name: 'Peak Near Shackleton', site: { latDeg: -88.811, lonEastDeg: 123.69 } },
      { name: 'Shackleton crater floor', site: { latDeg: -89.67, lonEastDeg: 129.8 } },
    ],
  },
  {
    id: 'near-far',
    title: 'Near side or far side?',
    ask: 'Can astronauts on the far side of the Moon see Earth?',
    notice: 'Earth moves slowly in the lunar sky because of libration. Compare the visible intervals at these two sites: what would a direct radio link require when Earth is hidden? Visibility alone does not establish radio performance.',
    sites: [
      { name: 'Apollo 11 · Tranquility Base', site: { latDeg: 0.6741, lonEastDeg: 23.473 } },
      { name: 'Far side · equator', site: { latDeg: 0, lonEastDeg: 180 } },
    ],
  },
]

function toCompare(s: { name: string; site: SiteCoordinates }): CompareSite {
  return { key: siteKey(s.site), name: s.name, site: s.site }
}

export function startExperiment(id: string): void {
  const e = EXPERIMENTS.find((x) => x.id === id)
  if (!e) return
  const s = getState()
  const mode = id === 'dates' ? 'dates' : id === 'terrain' ? 'terrain' : 'sites'
  const input = s.scenarios.A.input
  const chosen = { key: siteKey(input.site), name: input.siteName ?? 'Chosen point', site: input.site }
  const secondStartMs = input.startMs + s.durationDays * 86400000
  const slots = mode === 'sites' ? e.sites.map(toCompare) : lessonSlots(mode, chosen, input.startMs, secondStartMs)
  setState({ compareSites: slots, experiment: { id, mode, secondStartMs, trails: true }, cursorOffsetMs: 0, playing: false })
  goTo('compare')
}

export function changeLessonDate(which: 'first' | 'second', ms: number): void {
  const s = getState()
  const mode = s.experiment.mode ?? 'sites'
  const first = which === 'first' ? ms : s.scenarios.A.input.startMs
  const second = which === 'second' ? ms : s.experiment.secondStartMs ?? first + s.durationDays * 86400000
  if (which === 'first') {
    const input = { ...s.scenarios.A.input, startMs: ms }
    setState({ scenarios: { ...s.scenarios, A: { ...s.scenarios.A, input, run: { phase: 'idle', stale: true } } } })
  }
  setState({
    compareSites: mode === 'sites' ? s.compareSites : lessonSlots(mode, s.compareSites[0] ?? { key: 'selected', name: s.scenarios.A.input.siteName ?? 'Chosen point', site: s.scenarios.A.input.site }, first, second),
    experiment: { ...s.experiment, secondStartMs: second }, cursorOffsetMs: 0, playing: false,
  })
}
