const pad = (n: number) => String(n).padStart(2, '0')

export function formatUtc(ms: number, withSeconds = false): string {
  const d = new Date(ms)
  const base = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
  return withSeconds ? `${base}:${pad(d.getUTCSeconds())}` : base
}

export function formatUtcDate(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}`
}

export function formatDuration(ms: number): string {
  const sign = ms < 0 ? '−' : ''
  const m = Math.round(Math.abs(ms) / 60_000)
  const d = Math.floor(m / 1440)
  const h = Math.floor((m % 1440) / 60)
  const min = m % 60
  if (d > 0) return `${sign}${d} g ${h} h`
  if (h > 0) return `${sign}${h} h ${pad(min)} min`
  return `${sign}${min} min`
}

export function formatAngle(deg: number, digits = 1): string {
  const s = deg.toFixed(digits)
  return `${s.startsWith('-') ? '−' + s.slice(1) : s}°`
}

export function formatLat(lat: number): string {
  return `${Math.abs(lat).toFixed(3)}° ${lat < 0 ? 'S' : 'N'}`
}

export function formatLon(lon: number): string {
  return `${Math.abs(lon).toFixed(3)}° ${lon < 0 ? 'O' : 'E'}`
}

export function compass(az: number): string {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
  return names[Math.round((((az % 360) + 360) % 360) / 45) % 8]
}

/** `<input type="datetime-local">` value interpreted as UTC. */
export function toUtcInput(ms: number): string {
  return formatUtc(ms).replace(' ', 'T')
}

export function fromUtcInput(value: string): number {
  return Date.parse(`${value}:00Z`)
}
