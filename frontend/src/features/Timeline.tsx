/**
 * Time control for the site view: play, scrub, and visibility bars.
 * Student: Sunlight + Earth. Teacher: + Both and day ticks. Planner: + UTC,
 * step buttons, speed, and one bar group per compared scenario.
 */
import { useMemo, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { formatDuration, formatUtc, formatUtcDate, formatUtcLong } from '../domain/format'
import { eclipseIntervals } from '../domain/eclipses'
import { usePlayback } from '../hooks'
import { durationMs, getState, setState, useStore, type Audience, type ScenarioKey } from '../state/store'
import { BothIcon, EarthIcon, EclipseIcon, IconButton, PauseIcon, PlayIcon, Select, StepBackIcon, StepForwardIcon, SunIcon, TrackBar } from '../ui'

const SPEEDS = [1, 6, 12, 24, 72]

function step(hours: number) {
  const s = getState()
  setState({ cursorOffsetMs: Math.max(0, Math.min(durationMs(s), s.cursorOffsetMs + hours * 3_600_000)) })
}

export function Timeline({ audience }: { audience: Audience }) {
  const A = useStore((s) => s.scenarios.A)
  const B = useStore((s) => s.scenarios.B)
  const compare = useStore((s) => s.compare)
  const offset = useStore((s) => s.cursorOffsetMs)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const span = useStore(durationMs)
  usePlayback(playing)

  const days = span / 86_400_000
  const day = Math.min(Math.floor(offset / 86_400_000) + 1, Math.ceil(days))
  const t = A.input.startMs + offset

  const ticks = useMemo(() => {
    const every = days <= 14 ? 1 : days <= 30 ? 5 : 10
    const out: number[] = []
    for (let d = 0; d <= days; d += every) out.push(d)
    return out
  }, [days])

  const groups: [ScenarioKey, typeof A][] = audience === 'planner' && compare ? [['A', A], ['B', B]] : [['A', A]]

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    setState({ cursorOffsetMs: f * span })
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') step(e.shiftKey ? 24 : 1)
    else if (e.key === 'ArrowLeft') step(e.shiftKey ? -24 : -1)
    else if (e.key === 'Home') setState({ cursorOffsetMs: 0 })
    else return
    e.preventDefault()
  }

  const subtitle =
    audience === 'public'
      ? playing
        ? 'Watch the Sun crawl along the hills'
        : 'Press play to watch the Sun crawl along the hills'
      : `${formatUtc(t)} UTC · +${formatDuration(offset)}`

  const rows = (key: ScenarioKey, sc: typeof A) => {
    const ev = sc.run.evaluation
    const start = sc.input.startMs
    const eclipses = ev ? eclipseIntervals(ev) : []
    const items: { id: 'sun' | 'earth' | 'both' | 'eclipse'; label: string; icon: ReactNode }[] = [
      { id: 'sun', label: 'Sunlight', icon: <SunIcon size={16} /> },
      { id: 'earth', label: 'Earth in view', icon: <EarthIcon size={16} /> },
    ]
    if (audience !== 'public') items.push({ id: 'both', label: 'Sun + Earth', icon: <BothIcon size={16} /> })
    if (audience !== 'public' || eclipses.length) items.push({ id: 'eclipse', label: 'Eclipse', icon: <EclipseIcon size={16} /> })
    return items.map((r) => (
      <div key={`${key}-${r.id}`} className="timeline-row">
        <span className={`timeline-row-label is-${r.id}`}>
          {groups.length > 1 && <span className={`report-key is-${key}`}>{key}</span>}
          {r.icon}
          {r.label}
        </span>
        <TrackBar
          tone={r.id}
          size={audience === 'planner' ? 's' : 'm'}
          intervals={r.id === 'eclipse' ? eclipses : ev ? ev.intervals[r.id] : []}
          startMs={start}
          spanMs={span}
          label={`${r.label} over ${Math.round(days)} days`}
        />
      </div>
    ))
  }

  return (
    <section className="timeline ui-card" aria-label="Time">
      <div className="timeline-transport">
        {audience === 'planner' && (
          <IconButton variant="secondary" size="s" aria-label="Back 6 hours" onClick={() => step(-6)}>
            <StepBackIcon />
          </IconButton>
        )}
        <IconButton aria-label={playing ? 'Pause' : 'Play'} onClick={() => setState({ playing: !playing })}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        {audience === 'planner' && (
          <IconButton variant="secondary" size="s" aria-label="Forward 6 hours" onClick={() => step(6)}>
            <StepForwardIcon />
          </IconButton>
        )}
        <div className="timeline-time">
          <span className="timeline-day">
            Day {day} of {Math.round(days)}
          </span>
          <span className={`timeline-sub${audience === 'planner' ? ' mono' : ''}`}>{subtitle}</span>
        </div>
        {audience !== 'public' && (
          <label className="timeline-speed">
            <span className="sr-only">Playback speed</span>
            <Select inputSize="s" value={speed} onChange={(e) => setState({ speed: Number(e.target.value) })}>
              {SPEEDS.map((v) => (
                <option key={v} value={v}>
                  {v} h per second
                </option>
              ))}
            </Select>
          </label>
        )}
      </div>

      <div
        className="timeline-bars"
        role="slider"
        tabIndex={0}
        aria-label="Time in the period"
        aria-valuemin={0}
        aria-valuemax={Math.round(span / 3_600_000)}
        aria-valuenow={Math.round(offset / 3_600_000)}
        aria-valuetext={formatUtcLong(t)}
        onKeyDown={onKey}
      >
        <div
          className="timeline-hit"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setState({ playing: false })
            scrub(e)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
          }}
        >
          {groups.map(([k, sc]) => rows(k, sc))}
          {audience !== 'public' && (
            <div className="timeline-axis" aria-hidden="true">
              {ticks.map((d) => (
                <span key={d} style={{ left: `${(d / days) * 100}%` }}>
                  {audience === 'planner' ? formatUtcDate(A.input.startMs + d * 86_400_000) : `Day ${d + 1}`}
                </span>
              ))}
            </div>
          )}
          <span className="timeline-cursor" style={{ left: `${(offset / span) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
