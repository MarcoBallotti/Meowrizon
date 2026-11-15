/**
 * Low-precision Sun, Earth and Moon geometry (Meeus, "Astronomical
 * Algorithms", chapters 25, 47 and 53, main terms only).
 *
 * Accuracy is a few tenths of a degree: enough to place eclipses within
 * about an hour, light the globe for a date and drive the demo provider.
 * It is never a substitute for engine ephemerides (SPICE / JPL Horizons).
 */

const DEG = Math.PI / 180
const DAY_MS = 86_400_000
const J2000_MS = Date.UTC(2000, 0, 1, 12)
const AU_KM = 149_597_870.7
const EARTH_RADIUS_KM = 6371
const SUN_RADIUS_KM = 695_700
/** Inclination of the lunar equator to the ecliptic (Cassini's laws). */
const LUNAR_EQUATOR_I = 1.54242

export type Vec3 = [number, number, number]

const sin = (d: number) => Math.sin(d * DEG)
const cos = (d: number) => Math.cos(d * DEG)
const wrap = (d: number) => ((d % 360) + 360) % 360
const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2])
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const fromLonLat = (lon: number, lat: number, r = 1): Vec3 => [r * cos(lat) * cos(lon), r * cos(lat) * sin(lon), r * sin(lat)]

export interface GeocentricState {
  /** Moon, geocentric ecliptic of date, km. */
  moon: Vec3
  /** Sun, geocentric ecliptic of date, km. */
  sun: Vec3
  /** Moon argument of latitude and mean ascending node, degrees. */
  F: number
  node: number
}

export function geocentric(ms: number): GeocentricState {
  const d = (ms - J2000_MS) / DAY_MS
  const Lp = wrap(218.3164477 + 13.17639648 * d)
  const D = wrap(297.8501921 + 12.19074912 * d)
  const M = wrap(357.5291092 + 0.98560028 * d)
  const Mp = wrap(134.9633964 + 13.06499295 * d)
  const F = wrap(93.272095 + 13.22935024 * d)
  const node = wrap(125.0445479 - 0.05295377 * d)

  const lon =
    Lp +
    6.288774 * sin(Mp) +
    1.274027 * sin(2 * D - Mp) +
    0.658314 * sin(2 * D) +
    0.213618 * sin(2 * Mp) -
    0.185116 * sin(M) -
    0.114332 * sin(2 * F) +
    0.058793 * sin(2 * D - 2 * Mp) +
    0.057066 * sin(2 * D - M - Mp) +
    0.053322 * sin(2 * D + Mp) +
    0.045758 * sin(2 * D - M) -
    0.040923 * sin(M - Mp) -
    0.03472 * sin(D) -
    0.030383 * sin(M + Mp)
  const lat =
    5.128122 * sin(F) +
    0.280602 * sin(Mp + F) +
    0.277693 * sin(Mp - F) +
    0.173237 * sin(2 * D - F) +
    0.055413 * sin(2 * D - Mp + F) +
    0.046271 * sin(2 * D - Mp - F) +
    0.032573 * sin(2 * D + F)
  const distKm = 385000.56 - 20905.355 * cos(Mp) - 3699.111 * cos(2 * D - Mp) - 2955.968 * cos(2 * D) - 569.925 * cos(2 * Mp)

  const L0 = 280.46646 + 0.98564736 * d
  const sunLon = L0 + 1.914602 * sin(M) + 0.019993 * sin(2 * M)
  const sunAu = 1.000140 - 0.016708 * cos(M) - 0.000141 * cos(2 * M)

  return { moon: fromLonLat(lon, lat, distKm), sun: fromLonLat(sunLon, 0, sunAu * AU_KM), F, node }
}

/** Selenographic [lat, lon] of the direction `u` seen from the Moon's centre. */
function selenographic(u: Vec3, F: number, node: number): [number, number] {
  const r = norm(u)
  const lon = Math.atan2(u[1], u[0]) / DEG
  const lat = Math.asin(u[2] / r) / DEG
  const W = lon - node
  const x = cos(W) * cos(lat)
  const y = sin(W) * cos(lat) * cos(LUNAR_EQUATOR_I) - sin(lat) * sin(LUNAR_EQUATOR_I)
  const z = sin(W) * cos(lat) * sin(LUNAR_EQUATOR_I) + sin(lat) * cos(LUNAR_EQUATOR_I)
  const selLon = wrap(Math.atan2(y, x) / DEG - F - 180)
  return [Math.asin(Math.max(-1, Math.min(1, z))) / DEG, selLon > 180 ? selLon - 360 : selLon]
}

/** [lat, lon] of the point on the Moon with the Sun at the zenith. */
export function subSolarPoint(ms: number): [number, number] {
  const g = geocentric(ms)
  return selenographic(sub(g.sun, g.moon), g.F, g.node)
}

/** [lat, lon] of the point on the Moon with Earth at the zenith (libration). */
export function subEarthPoint(ms: number): [number, number] {
  const g = geocentric(ms)
  return selenographic([-g.moon[0], -g.moon[1], -g.moon[2]], g.F, g.node)
}

export interface EclipseGeometry {
  /** Angle between the centres of Sun and Earth seen from the Moon, degrees. */
  separationDeg: number
  earthRadiusDeg: number
  sunRadiusDeg: number
}

export function eclipseGeometry(ms: number): EclipseGeometry {
  const g = geocentric(ms)
  const toEarth: Vec3 = [-g.moon[0], -g.moon[1], -g.moon[2]]
  const toSun = sub(g.sun, g.moon)
  const de = norm(toEarth)
  const ds = norm(toSun)
  const c = (toEarth[0] * toSun[0] + toEarth[1] * toSun[1] + toEarth[2] * toSun[2]) / (de * ds)
  return {
    separationDeg: Math.acos(Math.max(-1, Math.min(1, c))) / DEG,
    earthRadiusDeg: Math.asin(EARTH_RADIUS_KM / de) / DEG,
    sunRadiusDeg: Math.asin(SUN_RADIUS_KM / ds) / DEG,
  }
}

/** Fraction of the Sun's diameter covered by Earth (0 = clear, ≥1 = total). */
export function eclipseMagnitude(g: EclipseGeometry): number {
  return Math.max(0, (g.earthRadiusDeg + g.sunRadiusDeg - g.separationDeg) / (2 * g.sunRadiusDeg))
}

export type EclipseKind = 'partial' | 'total'

export interface SolarEclipseFromMoon {
  /** First and last contact: Earth starts / stops covering the Sun. */
  startMs: number
  endMs: number
  maxMs: number
  /** Total phase, when the Sun is entirely behind Earth. */
  totalStartMs: number | null
  totalEndMs: number | null
  kind: EclipseKind
  magnitude: number
}

const cache = new Map<string, SolarEclipseFromMoon[]>()

/**
 * Solar eclipses seen from the Moon (Earth covering the Sun), found from the
 * geometry at the Moon's centre. Each is a lunar eclipse seen from Earth.
 */
export function findEclipses(fromMs: number, toMs: number): SolarEclipseFromMoon[] {
  const key = `${Math.floor(fromMs / DAY_MS)}:${Math.ceil(toMs / DAY_MS)}`
  const hit = cache.get(key)
  if (hit) return hit
  const out: SolarEclipseFromMoon[] = []
  const step = 3 * 3_600_000
  const sep = (t: number) => eclipseGeometry(t).separationDeg
  let a = sep(fromMs - step)
  let b = sep(fromMs)
  for (let t = fromMs + step; t <= toMs + step; t += step) {
    const c = sep(t)
    if (b <= a && b < c && b < 2) {
      // Golden-section refinement of the minimum around t - step.
      let lo = t - 2 * step
      let hi = t
      for (let i = 0; i < 40; i++) {
        const m1 = lo + (hi - lo) * 0.382
        const m2 = lo + (hi - lo) * 0.618
        if (sep(m1) < sep(m2)) hi = m2
        else lo = m1
      }
      const maxMs = (lo + hi) / 2
      const g = eclipseGeometry(maxMs)
      const outer = (x: number) => {
        const e = eclipseGeometry(x)
        return e.separationDeg - (e.earthRadiusDeg + e.sunRadiusDeg)
      }
      const inner = (x: number) => {
        const e = eclipseGeometry(x)
        return e.separationDeg - (e.earthRadiusDeg - e.sunRadiusDeg)
      }
      if (outer(maxMs) < 0 && maxMs >= fromMs && maxMs <= toMs) {
        const bisect = (f: (x: number) => number, inside: number, outside: number) => {
          let i = inside
          let o = outside
          for (let k = 0; k < 40; k++) {
            const m = (i + o) / 2
            if (f(m) < 0) i = m
            else o = m
          }
          return (i + o) / 2
        }
        const span = 8 * 3_600_000
        const total = inner(maxMs) < 0
        out.push({
          startMs: bisect(outer, maxMs, maxMs - span),
          endMs: bisect(outer, maxMs, maxMs + span),
          maxMs,
          totalStartMs: total ? bisect(inner, maxMs, maxMs - span) : null,
          totalEndMs: total ? bisect(inner, maxMs, maxMs + span) : null,
          kind: total ? 'total' : 'partial',
          magnitude: eclipseMagnitude(g),
        })
      }
    }
    a = b
    b = c
  }
  cache.set(key, out)
  return out
}

/** Heliocentric layout for the orbit view: Earth (AU) and Moon around it (km). */
export function orbitState(ms: number): { earthAu: Vec3; moonKm: Vec3 } {
  const g = geocentric(ms)
  return { earthAu: [-g.sun[0] / AU_KM, -g.sun[1] / AU_KM, -g.sun[2] / AU_KM], moonKm: g.moon }
}
