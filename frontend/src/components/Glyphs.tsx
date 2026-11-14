/** Sun and Earth symbols, so that state is never conveyed by colour alone. */

interface GlyphProps {
  x?: number
  y?: number
  r?: number
  dim?: boolean
}

export function SunGlyphSvg({ x = 0, y = 0, r = 7, dim = false }: GlyphProps) {
  const rays = Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4
    return (
      <line
        key={i}
        x1={x + Math.cos(a) * (r + 2.5)}
        y1={y + Math.sin(a) * (r + 2.5)}
        x2={x + Math.cos(a) * (r + 6)}
        y2={y + Math.sin(a) * (r + 6)}
      />
    )
  })
  return (
    <g className={`glyph glyph-sun${dim ? ' is-dim' : ''}`}>
      <g className="glyph-rays">{rays}</g>
      <circle cx={x} cy={y} r={r} className="glyph-body" />
    </g>
  )
}

export function EarthGlyphSvg({ x = 0, y = 0, r = 7, dim = false }: GlyphProps) {
  return (
    <g className={`glyph glyph-earth${dim ? ' is-dim' : ''}`}>
      <circle cx={x} cy={y} r={r + 3.5} className="glyph-ring" />
      <circle cx={x} cy={y} r={r} className="glyph-body" />
      <path d={`M ${x - r} ${y} H ${x + r} M ${x} ${y - r} A ${r * 0.45} ${r} 0 0 1 ${x} ${y + r}`} className="glyph-lines" />
    </g>
  )
}

export function SunIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-14 -14 28 28" aria-hidden="true" className="icon">
      <SunGlyphSvg r={5.5} />
    </svg>
  )
}

export function EarthIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" className="icon">
      <EarthGlyphSvg r={6} />
    </svg>
  )
}

export function BothIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden="true" className="icon icon-both">
      <rect x="1" y="1" width="12" height="12" rx="2" />
      <path d="M4 7.2 6.2 9.4 10.2 4.8" />
    </svg>
  )
}
