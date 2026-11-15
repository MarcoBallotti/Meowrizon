import type { AppState } from '../state/store'
import { areaOfLatitude, comparisonCandidates } from './catalogs'

/** The same identity is used when submitting and displaying measurements. */
export function rankingRequest(s: AppState) {
  const locations = comparisonCandidates(s.regions, s.sites)
  const A = s.scenarios.A.input
  if (s.pointShown && !locations.some(l => l.center.latDeg === A.site.latDeg && l.center.lonEastDeg === A.site.lonEastDeg)) {
    locations.push({ id: `custom:${A.site.latDeg}:${A.site.lonEastDeg}`, name: A.siteName ?? 'Chosen point', center: A.site, area: areaOfLatitude(A.site.latDeg), pointKind: 'site' })
  }
  const minSunFraction = s.audience === 'educator' ? 0 : s.mission.minSunFraction
  const key = JSON.stringify([locations.map(l => [l.id, l.center.latDeg, l.center.lonEastDeg]), A.startMs, A.observerHeightM, s.durationDays, s.stepMinutes, s.azimuthStepDeg, s.maxDistanceKm, minSunFraction, 'local-terrain-v1'])
  return { locations, minSunFraction, key }
}
