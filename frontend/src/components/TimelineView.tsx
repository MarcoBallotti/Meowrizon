import { memo, useMemo, useRef, type PointerEvent } from 'react'
import type { ScenarioEvaluation, TimeInterval } from '../api/types'
import { formatDuration, formatUtc, formatUtcDate } from '../domain/format'
import { intervalStats } from '../domain/sampling'
import { useElementSize, usePlayback } from '../hooks'
import { durationMs, getState, setState, useStore, type Scenario, type ScenarioKey } from '../state/store'
import { BothIcon, EarthIcon, SunIcon } from './Glyphs'

const LABEL_W = 132
const STATS_W = 176
const ROW_H = 18
const ROW_GAP = 6
const GROUP_GAP = 14
const AXIS_H = 30

const ROWS = [
  { id: 'sun', label: 'Sole', Icon: SunIcon },
  { id: 'earth', label: 'Terra', Icon: EarthIcon },
  { id: 'both', label: 'Entrambi', Icon: BothIcon },
] as const

const SPEEDS = [1, 6, 12, 24, 72]

interface Group {
  key: ScenarioKey
  scenario: Scenario
  evaluation: ScenarioEvaluation
}

const Bars = memo(function Bars({
  intervals,
  startMs,
  span,
  width,
  y,
  kind,
}: {
  intervals: TimeInterval[]
  startMs: number
  span: number
  width: number
  y: number
  kind: string
}) {
  return (
    <g className={`bars bars-${kind}`}>
      <rect x={0} y={y} width={width} height={ROW_H} className="bar-track" rx={3} />
      {intervals.map((iv) => {
        const x0 = ((iv.startMs - startMs) / span) * width
        const x1 = ((iv.endMs - startMs) / span) * width
        return <rect key={iv.startMs} x={x0} y={y} width={Math.max(1, x1 - x0)} height={ROW_H} rx={2} className="bar" />
      })}
    </g>
  )
})

function Stats({ evaluation, startMs, endMs }: { evaluation: ScenarioEvaluation; startMs: number; endMs: number }) {
  const s = {
    sun: intervalStats(evaluation.intervals.sun, startMs, endMs),
    earth: intervalStats(evaluation.intervals.earth, startMs, endMs),
    both: intervalStats(evaluation.intervals.both, startMs, endMs),
  }
  return (
    <>
      {ROWS.map((r) => (
        <div key={r.id} className="stat tabular" style={{ height: ROW_H, marginBottom: ROW_GAP }}>
          <strong>{Math.round(s[r.id].fraction * 100)}%</strong>
          <span className="muted">
            {r.id === 'sun' ? `ombra max ${formatDuration(s.sun.longestOffMs)}` : `max ${formatDuration(s[r.id].longestOnMs)}`}
          </span>
        </div>
      ))}
    </>
  )
}

export function TimelineView() {
  const compare = useStore((s) => s.compare)
  const A = useStore((s) => s.scenarios.A)
  const B = useStore((s) => s.scenarios.B)
  const offset = useStore((s) => s.cursorOffsetMs)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const span = useStore(durationMs)
  const [ref, size] = useElementSize<HTMLDivElement>()
  const svgRef = useRef<SVGSVGElement>(null)
  usePlayback(playing)

  const groups: Group[] = []
  for (const [key, sc] of [['A', A], ['B', B]] as const) {
    if (key === 'B' && !compare) continue
    if (sc.run.evaluation) groups.push({ key, scenario: sc, evaluation: sc.run.evaluation })
  }

  const width = Math.max(0, size.width - LABEL_W - STATS_W)
  const groupH = ROWS.length * (ROW_H + ROW_GAP)
  const height = AXIS_H + groups.length * groupH + Math.max(0, groups.length - 1) * GROUP_GAP + 4

  const ticks = useMemo(() => {
    const days = span / 86_400_000
    const every = days <= 7 ? 1 : days <= 30 ? 2 : days <= 60 ? 5 : 10
    const out: number[] = []
    for (let d = 0; d <= days; d += every) out.push(d)
    return out
  }, [span])

  const xOf = (ms: number) => (ms / span) * width
  const cursorX = xOf(offset)

  const scrub = (e: PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setState({ cursorOffsetMs: f * span })
  }

  const step = (hours: number) => {
    const s = getState()
    setState({ cursorOffsetMs: Math.max(0, Math.min(durationMs(s), s.cursorOffsetMs + hours * 3_600_000)) })
  }

  const startA = A.input.startMs

  return (
    <section className="view view-timeline" aria-label="Timeline di illuminazione e visibilità">
      <header className="timeline-controls">
        <div className="transport">
          <button className="btn btn-icon" onClick={() => step(-6)} aria-label="Indietro di 6 ore" title="−6 h">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M9 3 4 8l5 5M13 3 8 8l5 5" />
            </svg>
          </button>
          <button
            className="btn btn-icon btn-primary"
            onClick={() => setState({ playing: !playing })}
            aria-label={playing ? 'Pausa' : 'Riproduci'}
            title="Spazio"
          >
            {playing ? (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3v10M11 3v10" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M5 3l8 5-8 5z" className="fill" />
              </svg>
            )}
          </button>
          <button className="btn btn-icon" onClick={() => step(6)} aria-label="Avanti di 6 ore" title="+6 h">
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M7 3l5 5-5 5M3 3l5 5-5 5" />
            </svg>
          </button>
          <label className="speed">
            <span className="sr-only">Velocità di riproduzione</span>
            <select value={speed} onChange={(e) => setState({ speed: Number(e.target.value) })}>
              {SPEEDS.map((v) => (
                <option key={v} value={v}>
                  {v} h/s
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="cursor-time">
          <span className="cursor-utc tabular">{formatUtc(startA + offset)}</span>
          <span className="muted">UTC</span>
          <span className="cursor-elapsed tabular">+{formatDuration(offset)}</span>
          {compare && B.input.startMs !== startA && (
            <span className="cursor-b tabular">
              <span className="scenario-dot scenario-B">B</span> {formatUtc(B.input.startMs + offset)}
            </span>
          )}
        </div>
        <p className="timeline-note muted">
          Centro del disco sopra il terreno · tempo dall’inizio di ciascuno scenario
        </p>
      </header>

      <div className="timeline-body" ref={ref}>
        {groups.length === 0 ? (
          <div className="timeline-empty">
            <div className="skeleton-bars" aria-hidden="true" />
          </div>
        ) : (
          width > 0 && (
            <div className="timeline-grid" style={{ gridTemplateColumns: `${LABEL_W}px ${width}px ${STATS_W}px` }}>
              <div className="timeline-labels" style={{ paddingTop: AXIS_H }}>
                {groups.map((g, gi) => (
                  <div key={g.key} style={{ marginTop: gi ? GROUP_GAP : 0 }}>
                    {ROWS.map((r) => (
                      <div key={r.id} className={`row-label row-${r.id}`} style={{ height: ROW_H, marginBottom: ROW_GAP }}>
                        {compare && <span className={`scenario-dot scenario-${g.key} is-small`}>{g.key}</span>}
                        <r.Icon size={13} />
                        <span>{r.label}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              <svg
                ref={svgRef}
                width={width}
                height={height}
                className="timeline-svg"
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId)
                  setState({ playing: false })
                  scrub(e)
                }}
                onPointerMove={(e) => {
                  if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
                }}
                role="slider"
                tabIndex={0}
                aria-label="Cursore temporale"
                aria-valuemin={0}
                aria-valuemax={Math.round(span / 3_600_000)}
                aria-valuenow={Math.round(offset / 3_600_000)}
                aria-valuetext={formatUtc(startA + offset)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') step(e.shiftKey ? 24 : 1)
                  else if (e.key === 'ArrowLeft') step(e.shiftKey ? -24 : -1)
                  else return
                  e.preventDefault()
                }}
              >
                <g className="time-axis">
                  {ticks.map((d) => {
                    const x = xOf(d * 86_400_000)
                    return (
                      <g key={d}>
                        <line x1={x} x2={x} y1={AXIS_H - 6} y2={height} className="tick-line" />
                        <text x={x} y={11} textAnchor={d === 0 ? 'start' : 'middle'} className="axis-label tabular">
                          g {d}
                        </text>
                        <text x={x} y={23} textAnchor={d === 0 ? 'start' : 'middle'} className="axis-label axis-date tabular">
                          {formatUtcDate(startA + d * 86_400_000)}
                        </text>
                      </g>
                    )
                  })}
                </g>
                {groups.map((g, gi) => {
                  const top = AXIS_H + gi * (groupH + GROUP_GAP)
                  const start = g.scenario.input.startMs
                  return (
                    <g key={g.key} className={g.scenario.run.stale ? 'is-stale' : undefined}>
                      {ROWS.map((r, ri) => (
                        <Bars
                          key={r.id}
                          kind={r.id}
                          intervals={g.evaluation.intervals[r.id]}
                          startMs={start}
                          span={span}
                          width={width}
                          y={top + ri * (ROW_H + ROW_GAP)}
                        />
                      ))}
                    </g>
                  )
                })}
                <g className="cursor" transform={`translate(${cursorX},0)`}>
                  <line y1={AXIS_H - 4} y2={height} />
                  <path d="M -5 24 L 5 24 L 0 30 Z" />
                </g>
              </svg>

              <div className="timeline-stats" style={{ paddingTop: AXIS_H }}>
                {groups.map((g, gi) => (
                  <div key={g.key} style={{ marginTop: gi ? GROUP_GAP : 0 }}>
                    <Stats evaluation={g.evaluation} startMs={g.scenario.input.startMs} endMs={g.scenario.input.startMs + span} />
                  </div>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </section>
  )
}
