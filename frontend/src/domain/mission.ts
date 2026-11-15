/** Mission-specific trade study. Limits are user requirements, never NASA certification. */
import type { LocalTerrain } from '../api/types'

export interface PowerProfile {
  enabled: boolean
  arrayPowerW: number
  loadW: number
  batteryWh: number
  initialCharge: number
  reserveCharge: number
  chargeEfficiency: number
  dischargeEfficiency: number
}

export interface MissionProfile {
  minSunFraction: number
  minEarthFraction: number
  minBothFraction: number
  maxSunOutageH: number | null
  maxEarthOutageH: number | null
  minJointWindowH: number | null
  maxSlopeDeg: number | null
  maxRoughnessM: number | null
  maxDemPixelM: number | null
  /** Operational allowance at each event boundary, not a statistical error bound. */
  eventMarginMinutes: number
  power: PowerProfile
}

export const DEFAULT_MISSION: MissionProfile = {
  minSunFraction: .45, minEarthFraction: 0, minBothFraction: 0,
  maxSunOutageH: null, maxEarthOutageH: null, minJointWindowH: null,
  maxSlopeDeg: null, maxRoughnessM: null, maxDemPixelM: null,
  eventMarginMinutes: 0,
  power: { enabled: false, arrayPowerW: 1000, loadW: 500, batteryWh: 10000,
    initialCharge: 1, reserveCharge: .2, chargeEfficiency: .95, dischargeEfficiency: .95 },
}

export function missionIssue(p: MissionProfile): string | null {
  if (!p || typeof p !== 'object' || !p.power || typeof p.power.enabled !== 'boolean') return 'Mission profile is incomplete.'
  for (const value of [p.minSunFraction, p.minEarthFraction, p.minBothFraction,
    p.power.initialCharge, p.power.reserveCharge]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) return 'Percentages must be between 0 and 100.'
  }
  for (const value of [p.maxSunOutageH, p.maxEarthOutageH, p.minJointWindowH,
    p.maxSlopeDeg, p.maxRoughnessM, p.maxDemPixelM]) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) return 'Limits must be non-negative numbers or left blank.'
  }
  if (p.maxSlopeDeg !== null && p.maxSlopeDeg > 90) return 'Slope must be at most 90 degrees.'
  if (!Number.isFinite(p.eventMarginMinutes) || p.eventMarginMinutes < 0) return 'Event margin must be non-negative.'
  for (const value of [p.power.arrayPowerW, p.power.loadW, p.power.batteryWh]) {
    if (!Number.isFinite(value) || value <= 0) return 'Array power, load and battery capacity must be positive.'
  }
  for (const value of [p.power.chargeEfficiency, p.power.dischargeEfficiency]) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) return 'Efficiencies must be greater than 0 and at most 100%.'
  }
  if (p.power.initialCharge < p.power.reserveCharge) return 'Initial battery charge must meet the reserve requirement.'
  return null
}

export interface PowerSeries {
  timesMs: number[]
  visibleFraction: number[]
  distanceKm: number[]
}

export interface MissionMetrics {
  sunFraction: number
  earthFraction: number
  bothFraction: number
  periodHours: number
  longestNightH: number
  longestNoLinkH?: number
  longestBothH?: number
  localTerrain?: LocalTerrain
  demPixelM?: number
  powerSeries?: PowerSeries
}

export interface PowerResult {
  minBatteryWh: number
  endBatteryWh: number
  generatedWh: number
  unservedWh: number
  firstReserveBreachMs: number | null
}

/**
 * Fixed net load and an ideal tracking array rated at 1 AU. Disc visibility
 * includes terrain and eclipses. Linear power between samples; split every
 * charge/discharge transition so saturation cannot hide a later deficit.
 */
export function simulatePower(series: PowerSeries | undefined, p: PowerProfile, periodHours: number): PowerResult | null {
  if (!series || missionIssue({ ...DEFAULT_MISSION, power: p })) return null
  const { timesMs: t, visibleFraction: f, distanceKm: d } = series
  if (!Array.isArray(t) || !Array.isArray(f) || !Array.isArray(d) || t.length < 2 || t.length !== f.length || t.length !== d.length) return null
  if (!Number.isFinite(periodHours) || periodHours <= 0 || Math.abs((t[t.length - 1] - t[0]) / 3_600_000 - periodHours) > 1e-9) return null
  if (t.some((v, i) => !Number.isFinite(v) || (i > 0 && v <= t[i - 1])) || f.some(v => !Number.isFinite(v) || v < 0 || v > 1) || d.some(v => !Number.isFinite(v) || v <= 0)) return null
  const generation = f.map((v, i) => p.arrayPowerW * v * (149_597_870.7 / d[i]) ** 2)
  if (generation.some(v => !Number.isFinite(v))) return null
  let charge = p.batteryWh * p.initialCharge
  const reserve = p.batteryWh * p.reserveCharge
  let minBatteryWh = charge, generatedWh = 0, unservedWh = 0
  let firstReserveBreachMs: number | null = null
  for (let i = 1; i < t.length; i++) {
    const hours = (t[i] - t[i - 1]) / 3_600_000
    generatedWh += (generation[i - 1] + generation[i]) * hours / 2
    const a = generation[i - 1] - p.loadW, b = generation[i] - p.loadW
    const edges = [0, ...(a * b < 0 ? [a / (a - b)] : []), 1]
    for (let j = 1; j < edges.length; j++) {
      const lo = edges[j - 1], hi = edges[j]
      const wattsLo = a + (b - a) * lo, wattsHi = a + (b - a) * hi
      const energy = (wattsLo + wattsHi) * hours * (hi - lo) / 2
      if (energy >= 0) charge = Math.min(p.batteryWh, charge + energy * p.chargeEfficiency)
      else {
        const required = -energy / p.dischargeEfficiency
        if (firstReserveBreachMs === null && charge - required < reserve - 1e-9) {
          // Bisect the monotone discharge segment to report a time within the sampled model.
          let left = lo, right = hi
          for (let k = 0; k < 40; k++) {
            const mid = (left + right) / 2
            const consumed = -(wattsLo + a + (b - a) * mid) * hours * (mid - lo) / 2 / p.dischargeEfficiency
            if (charge - consumed >= reserve) left = mid
            else right = mid
          }
          firstReserveBreachMs = t[i - 1] + (left + right) / 2 * (t[i] - t[i - 1])
        }
        unservedWh += Math.max(0, required - charge) * p.dischargeEfficiency
        charge = Math.max(0, charge - required)
      }
      minBatteryWh = Math.min(minBatteryWh, charge)
    }
  }
  return { minBatteryWh, endBatteryWh: charge, generatedWh, unservedWh, firstReserveBreachMs }
}

export type AssessmentStatus = 'eligible' | 'excluded' | 'insufficient-data'
export interface RequirementCheck {
  id: string
  label: string
  status: 'pass' | 'fail' | 'unknown'
  value: number | null
  limit: number
  unit: string
  direction: 'min' | 'max'
  reason?: string
}
export interface MissionAssessment {
  status: AssessmentStatus
  checks: RequirementCheck[]
  power: PowerResult | null
}

export function assessMission(r: MissionMetrics, p: MissionProfile): MissionAssessment {
  const issue = missionIssue(p)
  if (issue) throw new Error(issue)
  const checks: RequirementCheck[] = []
  const check = (id: string, label: string, value: number | undefined | null, limit: number | null, direction: 'min' | 'max', unit: string, reason?: string) => {
    if (limit === null) return
    const known = typeof value === 'number' && Number.isFinite(value) && value >= 0
    checks.push({ id, label, value: known ? value : null, limit, direction, unit, reason: known ? undefined : reason ?? 'Required measurement is unavailable.',
      status: !known ? 'unknown' : (direction === 'min' ? value + 1e-9 >= limit : value <= limit + 1e-9) ? 'pass' : 'fail' })
  }
  // This cheap requirement runs before reading any other site metric.
  check('sun', 'Sunlight', r.sunFraction * 100, p.minSunFraction * 100, 'min', '%')
  if (r.sunFraction < p.minSunFraction) checks[0].status = 'fail'
  if (checks[0].status !== 'pass') return { status: checks[0].status === 'fail' ? 'excluded' : 'insufficient-data', checks, power: null }
  const core = [r.sunFraction, r.earthFraction, r.bothFraction]
  if (core.some(v => !Number.isFinite(v) || v < 0 || v > 1) || !Number.isFinite(r.periodHours) || r.periodHours <= 0
    || r.bothFraction > Math.min(r.sunFraction, r.earthFraction) + 1e-9
    || r.bothFraction < Math.max(0, r.sunFraction + r.earthFraction - 1) - 1e-9
    || !Number.isFinite(r.longestNightH)
    || [r.longestNightH, r.longestNoLinkH, r.longestBothH].some(v => v !== undefined && (!Number.isFinite(v) || v < 0 || v > r.periodHours + 1e-9))) {
    checks.push({ id: 'coverage', label: 'Consistent visibility coverage', value: null, limit: 100, unit: '%', direction: 'min', status: 'unknown', reason: 'Visibility fractions, durations or period are missing or inconsistent.' })
  }
  check('earth', 'Earth visibility', r.earthFraction * 100, p.minEarthFraction * 100, 'min', '%')
  check('both', 'Simultaneous visibility', r.bothFraction * 100, p.minBothFraction * 100, 'min', '%')
  const marginH = 2 * p.eventMarginMinutes / 60
  const padded = (v: number | undefined) => v === undefined ? undefined : Math.min(r.periodHours, v + marginH)
  check('night', 'Longest Sun outage + allowance', padded(r.longestNightH), p.maxSunOutageH, 'max', 'h')
  check('radio', 'Longest Earth outage + allowance', padded(r.longestNoLinkH), p.maxEarthOutageH, 'max', 'h')
  check('window', 'Continuous shared window − allowance', r.longestBothH === undefined ? undefined : Math.max(0, r.longestBothH - marginH), p.minJointWindowH, 'min', 'h')
  const terrain = r.localTerrain?.status === 'ok' ? r.localTerrain : undefined
  const missingTerrain = r.localTerrain?.reason ?? 'Local terrain is not resolved by the available DEM.'
  check('slope', 'Local slope (100 m support)', terrain?.slopeDeg, p.maxSlopeDeg, 'max', '°', missingTerrain)
  check('roughness', 'Local surface residual RMS', terrain?.roughnessRmsM, p.maxRoughnessM, 'max', 'm', missingTerrain)
  check('dem', 'Horizon DEM pixel size', r.demPixelM, p.maxDemPixelM, 'max', 'm')
  const power = p.power.enabled ? simulatePower(r.powerSeries, p.power, r.periodHours) : null
  if (p.power.enabled) {
    check('battery', 'Minimum battery reserve', power ? power.minBatteryWh / p.power.batteryWh * 100 : null, p.power.reserveCharge * 100, 'min', '%', 'Solar disc fractions and Sun distances for the entire period are required.')
    check('supply', 'Unserved electrical demand', power?.unservedWh, 0, 'max', 'Wh')
  }
  return { status: checks.some(c => c.status === 'fail') ? 'excluded' : checks.some(c => c.status === 'unknown') ? 'insufficient-data' : 'eligible', checks, power }
}

/** Compare only dimensions known for every candidate in the current comparison. */
export function paretoFronts<T>(rows: T[], objectives: ((row: T) => number)[]): Map<T, number> {
  const fronts = new Map<T, number>()
  const comparable = objectives.filter(get => rows.every(r => Number.isFinite(get(r))))
  const dominates = (a: T, b: T) => comparable.every(get => get(a) >= get(b)) && comparable.some(get => get(a) > get(b))
  let pending = [...rows], level = 1
  while (pending.length) {
    const front = pending.filter(b => !pending.some(a => a !== b && dominates(a, b)))
    for (const row of front) fronts.set(row, level)
    const taken = new Set(front)
    pending = pending.filter(r => !taken.has(r))
    level++
  }
  return fronts
}
