/** Display the ideal horizon; visibility is always calculated by the provider. */
import type { HorizonProfile } from '../api/types'

const profiles = new WeakMap<HorizonProfile, HorizonProfile>()

export function flatProfile(p: HorizonProfile): HorizonProfile {
  const hit = profiles.get(p)
  if (hit) return hit
  const out = { ...p, elevationDeg: p.elevationDeg.map(() => 0) }
  profiles.set(p, out)
  return out
}
