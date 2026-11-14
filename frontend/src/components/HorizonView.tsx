import { memo, useMemo, useState, type PointerEvent } from 'react'
import type { BodyTrack, HorizonProfile, ScenarioEvaluation, TimeInterval } from '../api/types'
import { compass, formatAngle, formatDuration } from '../domain/format'
import { bodyAt, nextTransition, type BodyAtTime } from '../domain/sampling'
import { useElementSize } from '../hooks'
import { useStore, type ScenarioKey } from '../state/store'
import { EarthGlyphSvg, EarthIcon, SunGlyphSvg, SunIcon } from './Glyphs'

const PAD = { top: 14, right: 16, bottom: 26, left: 40 }
const READOUT_H = 96
const READOUT_COMPACT_H = 40

type YMode = 'horizon' | 'full'

interface Frame {
  width: number
  height: number
  centerAz: number
  yMin: number
  yMax: number
}

const rel = (az: number, center: number) => ((((az - center + 180) % 360) + 360) % 360)

function makeScales(f: Frame) {
  const w = Math.max(1, f.width - PAD.left - PAD.right)
  const h = Math.max(1, f.height - PAD.top - PAD.bottom)
  return {
    x: (az: number) => PAD.left + (rel(az, f.centerAz) / 360) * w,
    y: (el: number) => PAD.top + ((f.yMax - el) / (f.yMax - f.yMin)) * h,
    w,
    h,
  }
}

function niceStep(span: number): number {
  const raw = span / 6
  const steps = [0.5, 1, 2, 5, 10, 15, 30]
  return steps.find((s) => s >= raw) ?? 30
}

/** Terrain silhouette: area between H(az) and the bottom of the plot. */
function terrainPath(profile: HorizonProfile, f: Frame): { area: string; edge: string } {
  const { x, y } = makeScales(f)
  const pts = profile.azimuthDeg
    .map((az, i) => ({ r: rel(az, f.centerAz), az, h: profile.elevationDeg[i] }))
    .sort((a, b) => a.r - b.r)
  const first = pts[0]
  const last = pts[pts.length - 1]
  // Close the seam at the plot edges by interpolating across it.
  const span = 360 - last.r + first.r
  const seam = span > 0 ? last.h + ((first.h - last.h) * (360 - last.r)) / span : first.h
  const left = PAD.left
  const right = x(f.centerAz + 180 - 1e-9)
  const line = [`M ${left} ${y(seam)}`, ...pts.map((p) => `L ${x(p.az)} ${y(p.h)}`), `L ${right} ${y(seam)}`].join(' ')
  const bottom = y(f.yMin)
  return { edge: line, area: `${line} L ${right} ${bottom} L ${left} ${bottom} Z` }
}

/** Track split into polylines at the plot seam and at visibility changes. */
function trackPaths(evaluation: ScenarioEvaluation, track: BodyTrack, f: Frame): { visible: string; hidden: string } {
  const { x, y } = makeScales(f)
  const vis: string[] = []
  const hid: string[] = []
  let prevR = -1
  let prevVisible: boolean | null = null
  let current: string[] = []
  const flush = () => {
    if (current.length > 1 && prevVisible !== null) (prevVisible ? vis : hid).push(current.join(' '))
    current = []
  }
  for (let i = 0; i < evaluation.timesMs.length; i++) {
    const az = track.azimuthDeg[i]
    const el = Math.max(f.yMin - 5, Math.min(f.yMax + 5, track.elevationDeg[i]))
    const r = rel(az, f.centerAz)
    const v = track.centerVisible[i]
    const px = `${x(az).toFixed(1)},${y(el).toFixed(1)}`
    if (prevR >= 0 && Math.abs(r - prevR) > 180) flush()
    if (prevVisible !== null && v !== prevVisible) {
      current.push(px)
      flush()
    }
    current.push(px)
    prevVisible = v
    prevR = r
  }
  flush()
  const toPath = (lines: string[]) => lines.map((l) => `M ${l.split(' ').join(' L ')}`).join(' ')
  return { visible: toPath(vis), hidden: toPath(hid) }
}

interface PanelData {
  key: ScenarioKey
  profile: HorizonProfile
  evaluation: ScenarioEvaluation
  stale: boolean
}

const Grid = memo(function Grid({ frame }: { frame: Frame }) {
  const { x, y } = makeScales(frame)
  const yStep = niceStep(frame.yMax - frame.yMin)
  const yTicks: number[] = []
  for (let v = Math.ceil(frame.yMin / yStep) * yStep; v <= frame.yMax; v += yStep) yTicks.push(v)
  const xTicks = Array.from({ length: 12 }, (_, i) => i * 30)

  return (
      <g className="grid">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD.left} x2={frame.width - PAD.right} y1={y(v)} y2={y(v)} className={v === 0 ? 'grid-zero' : undefined} />
            <text x={PAD.left - 6} y={y(v)} dy="0.32em" textAnchor="end" className="axis-label tabular">
              {formatAngle(v, yStep < 1 ? 1 : 0)}
            </text>
          </g>
        ))}
        {xTicks.map((az) => {
          const px = x(az)
          const cardinal = az % 90 === 0
          return (
            <g key={`x${az}`}>
              <line x1={px} x2={px} y1={PAD.top} y2={frame.height - PAD.bottom} className={cardinal ? 'grid-cardinal' : undefined} />
              <text x={px} y={frame.height - PAD.bottom + 16} textAnchor="middle" className={`axis-label tabular${cardinal ? ' is-cardinal' : ''}`}>
                {cardinal ? compass(az) : `${az}°`}
              </text>
            </g>
          )
        })}
      </g>
  )
})

const Content = memo(function Content({ data, frame, showTracks }: { data: PanelData; frame: Frame; showTracks: boolean }) {
  const terrain = useMemo(() => terrainPath(data.profile, frame), [data.profile, frame])
  const sun = useMemo(() => trackPaths(data.evaluation, data.evaluation.sun, frame), [data.evaluation, frame])
  const earth = useMemo(() => trackPaths(data.evaluation, data.evaluation.earth, frame), [data.evaluation, frame])
  return (
    <g>
      <defs>
        <linearGradient id={`terrain-${data.key}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="var(--terrain-top)" />
          <stop offset="1" stopColor="var(--terrain-bottom)" />
        </linearGradient>
      </defs>
      {showTracks && (
        <g className="tracks">
          <path d={sun.hidden} className="track track-sun is-hidden" />
          <path d={sun.visible} className="track track-sun" />
          <path d={earth.hidden} className="track track-earth is-hidden" />
          <path d={earth.visible} className="track track-earth" />
        </g>
      )}
      <path d={terrain.area} fill={`url(#terrain-${data.key})`} className="terrain-area" />
      <path d={terrain.edge} className="terrain-edge" />
    </g>
  )
})

function labelY(at: BodyAtTime, frame: Frame): number {
  const { y } = makeScales(frame)
  const py = y(Math.max(frame.yMin, Math.min(frame.yMax, at.elevationDeg)))
  return Math.max(PAD.top + 10, Math.min(frame.height - PAD.bottom - 6, py - 10))
}

function Marker({ body, at, frame, labelShift = 0 }: { body: 'sun' | 'earth'; at: BodyAtTime; frame: Frame; labelShift?: number }) {
  const { x, y } = makeScales(frame)
  const px = x(at.azimuthDeg)
  const above = at.elevationDeg > frame.yMax
  const below = at.elevationDeg < frame.yMin
  const py = y(Math.max(frame.yMin, Math.min(frame.yMax, at.elevationDeg)))
  const Glyph = body === 'sun' ? SunGlyphSvg : EarthGlyphSvg
  const name = body === 'sun' ? 'Sole' : 'Terra'
  const anchorRight = px > frame.width - 150
  return (
    <g className={`marker marker-${body}${at.visible ? '' : ' is-hidden'}`}>
      <line x1={px} x2={px} y1={py} y2={y(at.horizonDeg)} className="marker-drop" />
      {above || below ? (
        <path
          d={above ? `M ${px - 6} ${py + 10} L ${px} ${py + 2} L ${px + 6} ${py + 10} Z` : `M ${px - 6} ${py - 10} L ${px} ${py - 2} L ${px + 6} ${py - 10} Z`}
          className="marker-offscale"
        />
      ) : (
        <Glyph x={px} y={py} r={6} dim={!at.visible} />
      )}
      <text
        x={px + (anchorRight ? -14 : 14)}
        y={labelY(at, frame) + labelShift}
        textAnchor={anchorRight ? 'end' : 'start'}
        className="marker-label"
      >
        <tspan className="marker-name">{name}</tspan>
        <tspan className="tabular"> {formatAngle(at.elevationDeg)}</tspan>
        <tspan className="marker-state"> · {at.visible ? 'visibile' : 'oltre il terreno'}</tspan>
      </text>
    </g>
  )
}

function Readout({ body, at, intervals, t, compact }: { body: 'sun' | 'earth'; at: BodyAtTime; intervals: TimeInterval[]; t: number; compact: boolean }) {
  const next = nextTransition(intervals, t)
  const Icon = body === 'sun' ? SunIcon : EarthIcon
  const margin = at.elevationDeg - at.horizonDeg
  return (
    <div className={`readout readout-${body}${at.visible ? ' is-on' : ''}${compact ? ' is-compact' : ''}`}>
      <div className="readout-head">
        <Icon size={15} />
        <span className="readout-name">{body === 'sun' ? 'Sole' : 'Terra'}</span>
        <span className={`chip ${at.visible ? 'chip-on' : 'chip-off'}`}>{at.visible ? 'Visibile' : 'Nascosto'}</span>
      </div>
      <dl className="readout-grid tabular">
        <dt>Az</dt>
        <dd>
          {formatAngle(at.azimuthDeg)} <span className="muted">{compass(at.azimuthDeg)}</span>
        </dd>
        <dt>El</dt>
        <dd>{formatAngle(at.elevationDeg, 2)}</dd>
        <dt>Terreno</dt>
        <dd>{formatAngle(at.horizonDeg, 2)}</dd>
        <dt>Margine</dt>
        <dd className={margin >= 0 ? 'pos' : 'neg'}>{formatAngle(margin, 2)}</dd>
      </dl>
      <p className="readout-next">
        {next
          ? `${next.becomes === 'visible' ? (body === 'sun' ? 'Luce' : 'Visibile') : body === 'sun' ? 'Ombra' : 'Nascosta'} tra ${formatDuration(next.atMs - t)}`
          : 'Nessun cambio nel periodo'}
      </p>
    </div>
  )
}

function Panel({
  data,
  frame,
  cursorMs,
  showTracks,
  label,
  compact,
}: {
  data: PanelData
  frame: Frame
  cursorMs: number
  showTracks: boolean
  label: string | null
  compact: boolean
}) {
  const { evaluation } = data
  const sun = bodyAt(evaluation, evaluation.sun, evaluation.intervals.sun, cursorMs)
  const earth = bodyAt(evaluation, evaluation.earth, evaluation.intervals.earth, cursorMs)
  const [hover, setHover] = useState<{ px: number; az: number; h: number } | null>(null)
  const { w, x } = makeScales(frame)
  // Keep the two labels apart when the bodies are close on screen.
  const dx = Math.abs(x(sun.azimuthDeg) - x(earth.azimuthDeg))
  const dy = labelY(earth, frame) - labelY(sun, frame)
  let earthShift = 0
  if (dx < 170 && Math.abs(dy) < 15) {
    const below = 15 - dy
    earthShift = labelY(earth, frame) + below < frame.height - PAD.bottom ? below : -15 - dy
  }

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - rect.left
    if (px < PAD.left || px > PAD.left + w) {
      setHover(null)
      return
    }
    const az = (((frame.centerAz - 180 + ((px - PAD.left) / w) * 360) % 360) + 360) % 360
    const { azimuthDeg, elevationDeg } = data.profile
    const step = 360 / azimuthDeg.length
    setHover({ px, az, h: elevationDeg[Math.round(az / step) % azimuthDeg.length] })
  }

  return (
    <div className={`horizon-panel${data.stale ? ' is-stale' : ''}`}>
      <div className={`horizon-readouts${compact ? ' is-compact' : ''}`} style={{ height: compact ? READOUT_COMPACT_H : READOUT_H }}>
        {label && (
          <span className={`scenario-dot scenario-${data.key}`} title={label}>
            {data.key}
          </span>
        )}
        <Readout body="sun" at={sun} intervals={evaluation.intervals.sun} t={cursorMs} compact={compact} />
        <Readout body="earth" at={earth} intervals={evaluation.intervals.earth} t={cursorMs} compact={compact} />
      </div>
      <svg
        width={frame.width}
        height={frame.height}
        className="horizon-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Profilo dell’orizzonte${label ? ` dello scenario ${data.key}` : ''}: Sole ${sun.visible ? 'visibile' : 'nascosto'}, Terra ${earth.visible ? 'visibile' : 'nascosta'}.`}
      >
        <clipPath id={`plot-${data.key}`}>
          <rect x={PAD.left} y={PAD.top} width={w} height={frame.height - PAD.top - PAD.bottom} />
        </clipPath>
        <Grid frame={frame} />
        <g clipPath={`url(#plot-${data.key})`}>
          <Content data={data} frame={frame} showTracks={showTracks} />
          <Marker body="earth" at={earth} frame={frame} labelShift={earthShift} />
          <Marker body="sun" at={sun} frame={frame} />
        </g>
        {hover && (
          <g className="hover">
            <line x1={hover.px} x2={hover.px} y1={PAD.top} y2={frame.height - PAD.bottom} />
            <text x={hover.px + 6} y={PAD.top + 12} className="hover-label tabular">
              Az {hover.az.toFixed(1)}° · terreno {formatAngle(hover.h, 2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  )
}

export function HorizonView() {
  const compare = useStore((s) => s.compare)
  const A = useStore((s) => s.scenarios.A)
  const B = useStore((s) => s.scenarios.B)
  const offset = useStore((s) => s.cursorOffsetMs)
  const [ref, size] = useElementSize<HTMLDivElement>()
  const [yMode, setYMode] = useState<YMode>('horizon')
  const [centerChoice, setCenterChoice] = useState<'auto' | 0 | 180>('auto')
  const [showTracks, setShowTracks] = useState(true)

  const panels: PanelData[] = []
  for (const [key, sc] of [['A', A], ['B', B]] as const) {
    if (key === 'B' && !compare) continue
    if (sc.run.terrain && sc.run.evaluation) {
      panels.push({ key, profile: sc.run.terrain.profile, evaluation: sc.run.evaluation, stale: sc.run.stale })
    }
  }

  const lat = A.input.site.latDeg
  const centerAz = centerChoice === 'auto' ? (lat < 0 ? 0 : 180) : centerChoice

  // Shared vertical scale across panels for honest comparison.
  const [yMin, yMax] = (() => {
    let lo = -2
    let hi = 6
    for (const p of panels) {
      for (const h of p.profile.elevationDeg) {
        lo = Math.min(lo, h)
        hi = Math.max(hi, h)
      }
      if (yMode === 'full') {
        for (const e of p.evaluation.sun.elevationDeg) hi = Math.max(hi, e)
        for (const e of p.evaluation.earth.elevationDeg) hi = Math.max(hi, e)
      }
    }
    return yMode === 'full' ? [Math.floor(lo - 2), Math.min(90, Math.ceil(hi + 3))] : [Math.floor(lo - 1.5), Math.ceil(hi + 4)]
  })()

  // Two stacked panels, or a short viewport, use one-line readouts.
  const compact = panels.length > 1 || size.height < 300
  const readoutH = compact ? READOUT_COMPACT_H : READOUT_H
  const panelH = panels.length ? Math.max(72, (size.height - 8 * (panels.length - 1)) / panels.length - readoutH) : 0
  const frame = useMemo<Frame>(
    () => ({ width: size.width, height: panelH, centerAz, yMin, yMax }),
    [size.width, panelH, centerAz, yMin, yMax],
  )

  const loading = [A, ...(compare ? [B] : [])].some((s) => s.run.phase === 'terrain' || s.run.phase === 'ephemeris')
  const errored = [A, ...(compare ? [B] : [])].find((s) => s.run.phase === 'error')

  return (
    <section className="view view-horizon" aria-label="Orizzonte locale">
      <header className="view-header">
        <h2 className="view-title">Orizzonte locale</h2>
        <div className="view-tools">
          <div className="segmented segmented-small" role="group" aria-label="Scala verticale">
            <button aria-pressed={yMode === 'horizon'} className="segment" onClick={() => setYMode('horizon')}>
              Vicino all’orizzonte
            </button>
            <button aria-pressed={yMode === 'full'} className="segment" onClick={() => setYMode('full')}>
              Intera
            </button>
          </div>
          <div className="segmented segmented-small" role="group" aria-label="Centro dell’asse azimutale">
            {(
              [
                ['auto', 'Auto'],
                [0, 'N'],
                [180, 'S'],
              ] as const
            ).map(([v, l]) => (
              <button key={String(v)} aria-pressed={centerChoice === v} className="segment" onClick={() => setCenterChoice(v)}>
                {l}
              </button>
            ))}
          </div>
          <label className="toggle toggle-small">
            <input type="checkbox" checked={showTracks} onChange={(e) => setShowTracks(e.target.checked)} />
            <span className="toggle-track" aria-hidden="true" />
            <span>Traiettorie</span>
          </label>
        </div>
      </header>
      <div className="horizon-body" ref={ref}>
        {panels.length === 0 ? (
          <div className="empty-state">
            {errored ? (
              <p>Nessun risultato: {errored.run.error}</p>
            ) : (
              <>
                <div className="skeleton-horizon" aria-hidden="true" />
                <p>{loading ? 'Calcolo dell’orizzonte e delle effemeridi…' : 'Scegli un punto per iniziare.'}</p>
              </>
            )}
          </div>
        ) : (
          size.width > 0 &&
          panels.map((p) => (
            <Panel
              key={p.key}
              data={p}
              frame={frame}
              showTracks={showTracks}
              label={compare ? (p.key === 'A' ? A.input.siteName : B.input.siteName) ?? 'Coordinate libere' : null}
              cursorMs={(p.key === 'A' ? A.input.startMs : B.input.startMs) + offset}
              compact={compact}
            />
          ))
        )}
      </div>
      <footer className="view-legend">
        <span>
          <SunIcon /> Sole
        </span>
        <span>
          <EarthIcon /> Terra (centro)
        </span>
        <span className="legend-line legend-solid">sopra il terreno</span>
        <span className="legend-line legend-dashed">nascosto</span>
        <span className="legend-terrain">profilo del terreno H(az)</span>
        <span className="muted">Elevazione rispetto al piano orizzontale locale · azimut da Nord, senso orario</span>
      </footer>
    </section>
  )
}
