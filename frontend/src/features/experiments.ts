/** Educator experiments: pairs of sites that make one difficulty visible. */
import type { SiteCoordinates } from '../api/types'
import { goTo, setState, siteKey, type CompareSite } from '../state/store'

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
    notice: 'The peak looks over the hills and sees the Sun almost all the time. The crater floor sits below its rim and never does. Turn the terrain off: the sky is the same, only the hills differ.',
    sites: [
      { name: 'Peak Near Shackleton', site: { latDeg: -88.811, lonEastDeg: 123.69 } },
      { name: 'Shackleton crater floor', site: { latDeg: -89.67, lonEastDeg: 129.8 } },
    ],
  },
  {
    id: 'near-far',
    title: 'Near side or far side?',
    ask: 'Can astronauts on the far side of the Moon see Earth?',
    notice: 'The Moon always shows the same face to Earth, so Earth barely moves in its sky and never rises on the far side. A far-side landing needs a relay satellite to talk home.',
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
  setState({ compareSites: e.sites.map(toCompare), experiment: { id, flat: false, trails: true }, cursorOffsetMs: 0, playing: false })
  goTo('compare')
}

