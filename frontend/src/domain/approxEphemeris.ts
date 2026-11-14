/**
 * Crude analytic Sun and Earth directions in the Moon-fixed frame.
 *
 * Mean synodic motion plus sinusoidal libration, with errors of several
 * degrees. Used by the demo provider and to light the globe for a chosen
 * date. Never a substitute for engine ephemerides.
 */

const DAY_MS = 86_400_000
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14)
const SYNODIC_DAYS = 29.530589

/** [lat, lon] of the sub-solar point, degrees. */
export function subSolarPoint(tMs: number): [number, number] {
  const days = (tMs - NEW_MOON_EPOCH_MS) / DAY_MS
  const lon = 180 - (360 * days) / SYNODIC_DAYS
  const lat = 1.543 * Math.sin((2 * Math.PI * days) / 346.62)
  return [lat, lon]
}

/** [lat, lon] of the sub-Earth point, degrees. */
export function subEarthPoint(tMs: number): [number, number] {
  const days = (tMs - NEW_MOON_EPOCH_MS) / DAY_MS
  const lon = 7.9 * Math.sin((2 * Math.PI * days) / 27.5546)
  const lat = 6.7 * Math.sin((2 * Math.PI * days) / 27.2122 + 1.0)
  return [lat, lon]
}
