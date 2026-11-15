const pad = (n: number) => String(n).padStart(2, '0')

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** 2026-12-01 00:00 */
export function formatUtc(ms: number, withSeconds = false): string {
  const d = new Date(ms)
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  return withSeconds ? `${base}:${pad(d.getUTCSeconds())}` : base
}

/** 1 Dec */
export function formatUtcDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** 1 December 2026, 00:00 UTC — for sentences people read aloud. */
export function formatUtcLong(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
}

/** 1 Dec, 04:00 */
export function formatUtcShort(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** 3 d 4 h · 2 h 05 min · 12 min */
export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '−' : ''
  const m = Math.round(Math.abs(ms) / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  if (d > 0) return `${sign}${d} d ${h} h`
  if (h > 0) return `${sign}${h} h ${pad(min)} min`
  return `${sign}${min} min`
}

/** Fixed-width countdown for data views: 06 d 04 h 12 m */
export function formatCountdown(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60_000))
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  return `${pad(d)} d ${pad(h)} h ${pad(m % 60)} m`
}

/** Plain-language duration: "6 days", "1 day", "9 hours", "less than an hour". */
export function formatFriendlyDuration(ms: number): string {
  const hours = ms / 3_600_000
  if (hours < 1) return 'less than an hour'
  if (hours < 36) {
    const h = Math.round(hours)
    return `${h} ${h === 1 ? 'hour' : 'hours'}`
  }
  const d = Math.round(hours / 24)
  return `${d} ${d === 1 ? 'day' : 'days'}`
}

/** Month before the one containing `ms`: "Oct". */
export function previousMonthName(ms: number): string {
  const d = new Date(ms)
  return MONTHS[(d.getUTCMonth() + 11) % 12]
}

export function formatAngle(deg: number, digits = 1): string {
  const s = deg.toFixed(digits)
  return `${s.startsWith('-') ? '−' + s.slice(1) : s}°`
}

export function formatSignedAngle(deg: number, digits = 2): string {
  return deg >= 0 ? `+${formatAngle(deg, digits)}` : formatAngle(deg, digits)
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export function formatLat(lat: number, digits = 3): string {
  return `${Math.abs(lat).toFixed(digits)}° ${lat < 0 ? 'S' : 'N'}`
}

export function formatLon(lon: number, digits = 3): string {
  return `${Math.abs(lon).toFixed(digits)}° ${lon < 0 ? 'W' : 'E'}`
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const COMPASS_WORDS = ['North', 'North-east', 'East', 'South-east', 'South', 'South-west', 'West', 'North-west']

export function compass(az: number): string {
  return COMPASS[Math.round((((az % 360) + 360) % 360) / 45) % 8]
}

export function compassWord(az: number): string {
  return COMPASS_WORDS[Math.round((((az % 360) + 360) % 360) / 45) % 8]
}

/** `<input type="datetime-local">` value interpreted as UTC. */
export function toUtcInput(ms: number): string {
  return formatUtc(ms).replace(' ', 'T')
}

export function fromUtcInput(value: string): number {
  return Date.parse(`${value}:00Z`)
}
