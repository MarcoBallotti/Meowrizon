/**
 * Up to four horizons side by side on one clock. Every window shows the same
 * UTC instant; the shared timeline below moves all of them together.
 */
import { Maximize2, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, type KeyboardEvent, type PointerEvent } from 'react'
import { currentCompareSite, openComparePicker, SLOT_LETTERS } from '../features/compareSlots'
import { CompareWindow } from '../features/CompareWindow'
import { ExperimentBar } from '../features/Experiment'
import { flatEvaluation, flatProfile } from '../domain/flat'
import { TopBar } from '../features/TopBar'
import { formatAngle, formatLat, formatLon, formatUtc, formatUtcDate, formatUtcLong, previousMonthName } from '../domain/format'
import { bodyAt } from '../domain/sampling'
import { usePlayback } from '../hooks'
import { retryCompareSite, syncCompareRuns } from '../state/compareRunner'
import { summarize } from '../state/runner'
import {
  durationMs,
  getState,
  goTo,
  setScenarioInput,
  setState,
  useStore,
  type Audience,
  type CompareSite,
  type CompareView,
  type RunPhase,
  type ScenarioRun,
  type SiteSummary,
} from '../state/store'
import { BackLink, Building, Button, Chip, Delta, IconButton, Notice, PauseIcon, PlayIcon, Segmented, Select, SpaceWindow, TrackBar } from '../ui'
import '../features/compare.css'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const
const SPEEDS = [6, 12, 24, 72]

function overall(phase: RunPhase, progress = 0): number {
  if (phase === 'terrain') return progress * 0.6
  if (phase === 'ephemeris') return 0.6 + progress * 0.4
  return 1
}

function shortName(name: string): string {
  return name.split(' · ')[0]
}

export function CompareScreen() {
  const audience = useStore((s) => s.audience)
  const sites = useStore((s) => s.compareSites)
  const runs = useStore((s) => s.compareRuns)
  const view = useStore((s) => s.compareView)
  const playing = useStore((s) => s.playing)
  const speed = useStore((s) => s.speed)
  const offset = useStore((s) => s.cursorOffsetMs)
  const span = useStore(durationMs)
  const A = useStore((s) => s.scenarios.A.input)
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  usePlayback(playing)

  // (Re)start runs when the set of sites or the period changes.
  useEffect(() => {
    syncCompareRuns()
  }, [sites, A.startMs, A.observerHeightM, durationDays, stepMinutes])

  const startMs = A.startMs
  const cursorMs = startMs + offset

  // One vertical scale for every full-circle window.
  const scale = useMemo(() => {
    let lo = -2
    let hi = 6
    for (const c of sites) {
      const p = runs[c.key]?.terrain?.profile
      if (!p) continue
      lo = Math.min(lo, Math.floor(Math.min(...p.elevationDeg) - 0.5))
      hi = Math.max(hi, Math.ceil(Math.max(...p.elevationDeg) + 2))
    }
    return { lo, hi }
  }, [sites, runs])
  const facingAz = (sites[0]?.site.latDeg ?? -1) < 0 ? 0 : 180

  if (sites.length < 2) {
    return (
      <div className="site-page hc-page">
        <TopBar start={<CompareTitle count={sites.length} startMs={startMs} days={durationDays} />} />
        <div className="ui-card hc-empty">
          <h2 className="ui-title">Pick at least two sites to compare</h2>
          <p className="ui-muted">Their horizons play side by side on one clock, so you can see which one keeps the Sun and Earth in view.</p>
          <div>
            <Button
              onClick={() => {
                if (!getState().compareSites.length) setState({ compareSites: [currentCompareSite()] })
                openComparePicker()
              }}
            >
              Choose sites
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="site-page hc-page">
      <TopBar start={<CompareTitle count={sites.length} startMs={startMs} days={durationDays} />}>
        <Button variant="secondary" size="s" icon={<Pencil {...ICON} />} onClick={openComparePicker}>
          Edit sites
        </Button>
      </TopBar>

      <section className="ui-card is-tight hc-controls" aria-label="Clock">
        <IconButton aria-label={playing ? 'Pause' : 'Play'} onClick={() => setState({ playing: !playing })}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </IconButton>
        <div className="hc-when">
          <b className="mono">{formatUtc(cursorMs)} UTC</b>
          <span className="ui-small ui-muted">Same instant at every site</span>
        </div>
        <div className="hc-controls-end">
          {audience === 'planner' && (
            <label>
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
          <Segmented<CompareView>
            label="View"
            size="s"
            value={view}
            onChange={(v) => setState({ compareView: v })}
            options={[
              { value: 'circle', label: 'Full circle', title: 'All around, same scale in every window' },
              { value: 'sun', label: 'Follow the Sun', title: 'Each window faces its own Sun, true proportions' },
            ]}
          />
        </div>
      </section>

      {audience === 'educator' && <ExperimentBar />}

      <div className="hc-grid" data-n={sites.length}>
        {sites.map((c, i) => (
          <ComparePanel
            key={c.key}
            letter={SLOT_LETTERS[i]}
            entry={c}
            run={runs[c.key]}
            cursorMs={cursorMs}
            audience={audience}
            view={view}
            scale={scale}
            facingAz={facingAz}
            startMs={startMs}
            spanMs={span}
          />
        ))}
      </div>
      <p className="hc-scale-note ui-small ui-muted">
        {view === 'circle'
          ? `Full circle, facing ${facingAz === 0 ? 'north' : 'south'} in the middle. Every window uses the same scale; heights are stretched so low ridges read, and the Sun and Earth are drawn larger than life.${audience === 'planner' ? ' Dots trace the Sun’s path over the period.' : ''}`
          : 'Each window turns to face its own Sun, at true proportions.'}
      </p>

      <SharedTimeline sites={sites} runs={runs} startMs={startMs} spanMs={span} offset={offset} audience={audience} />
    </div>
  )
}

function CompareTitle({ count, startMs, days }: { count: number; startMs: number; days: number }) {
  const back = currentCompareSite()
  const educator = useStore((s) => s.audience === 'educator')
  return (
    <div className="site-title">
      <BackLink label={educator ? 'Back to experiments' : `Back to ${shortName(back.name)}`} onClick={() => goTo(educator ? 'moon' : 'site')} />
      <div className="site-title-text">
        <h1 className="ui-title is-m">{count >= 2 ? `Comparing ${count} sites` : 'Compare horizons'}</h1>
        <span className="ui-small ui-muted">
          {formatUtcDate(startMs)} – {formatUtcDate(startMs + days * 86_400_000)}
        </span>
      </div>
    </div>
  )
}

interface PanelProps {
  letter: string
  entry: CompareSite
  run: ScenarioRun | undefined
  cursorMs: number
  audience: Audience
  view: CompareView
  scale: { lo: number; hi: number }
  facingAz: number
  startMs: number
  spanMs: number
}

function ComparePanel({ letter, entry, run, cursorMs, audience, view, scale, facingAz, startMs, spanMs }: PanelProps) {
  const experiment = useStore((s) => s.experiment)
  const flat = audience === 'educator' && experiment.flat
  const trails = audience === 'planner' || (audience === 'educator' && experiment.trails)
  const phase = run?.phase ?? 'idle'
  const terrain = run?.terrain
  const evaluation = run?.evaluation && flat ? flatEvaluation(run.evaluation) : run?.evaluation
  const previous = run?.previous && flat ? flatEvaluation(run.previous) : run?.previous
  const busy = !evaluation && phase !== 'error'

  const now = useMemo(() => (evaluation ? summarize(evaluation, startMs, startMs + spanMs) : null), [evaluation, startMs, spanMs])
  const prev = useMemo(() => (previous ? summarize(previous, startMs - spanMs, startMs) : null), [previous, startMs, spanMs])

  const remove = () => setState((s) => ({ compareSites: s.compareSites.filter((x) => x.key !== entry.key) }))
  const open = () => {
    setScenarioInput('A', { site: entry.site, siteName: entry.name })
    goTo('site')
  }

  return (
    <article className="hc-panel" aria-label={`${letter}: ${entry.name}`}>
      <header className="hc-panel-head">
        <span className="hc-badge">{letter}</span>
        <div className="hc-panel-name">
          <b title={entry.name}>{entry.name}</b>
          <span className="mono ui-muted">
            {formatLat(entry.site.latDeg, 2)} · {formatLon(entry.site.lonEastDeg, 2)}
          </span>
        </div>
        <button type="button" className="hc-icon-btn" onClick={open} title="Open this site" aria-label={`Open ${entry.name}`}>
          <Maximize2 {...ICON} />
        </button>
        <button type="button" className="hc-icon-btn" onClick={remove} title="Remove from comparison" aria-label={`Remove ${entry.name}`}>
          <X {...ICON} />
        </button>
      </header>

      <SpaceWindow className="hc-window">
        {phase === 'error' && !evaluation ? (
          <div className="hc-window-error">
            <Notice tone="danger">
              <strong>We could not calculate this site.</strong> {run?.error}{' '}
              <Button size="s" variant="inverse" onClick={() => retryCompareSite(entry.site)}>
                Try again
              </Button>
            </Notice>
          </div>
        ) : (
          <Building
            busy={busy}
            progress={overall(phase, run?.progress)}
            phase={run?.message ?? (phase === 'ephemeris' ? 'Tracking the Sun and Earth…' : 'Tracing the hills around the site…')}
            tone="dark"
            minHeight={0}
            className="hc-building"
          >
            {terrain && evaluation && (
              <CompareWindow profile={flat ? flatProfile(terrain.profile) : terrain.profile} evaluation={evaluation} cursorMs={cursorMs} audience={audience} view={view} scale={scale} facingAz={facingAz} trails={trails} />
            )}
          </Building>
        )}
      </SpaceWindow>

      {evaluation && <PanelStatus evaluation={evaluation} cursorMs={cursorMs} audience={audience} />}
      {now && <PanelMetrics now={now} prev={prev} audience={audience} startMs={startMs} />}
    </article>
  )
}

function PanelStatus({ evaluation, cursorMs, audience }: { evaluation: NonNullable<ScenarioRun['evaluation']>; cursorMs: number; audience: Audience }) {
  const sun = bodyAt(evaluation, evaluation.sun, evaluation.intervals.sun, cursorMs)
  const earth = bodyAt(evaluation, evaluation.earth, evaluation.intervals.earth, cursorMs)
  const word = (name: string, b: typeof sun) => (b.visible ? `${name} in view` : b.elevationDeg > 0 ? `${name} behind the hills` : `${name} below the horizon`)
  return (
    <>
      <div className="hc-status" aria-live="off">
        <Chip tone={sun.visible ? 'sun' : 'off'} dot>
          {word('Sun', sun)}
        </Chip>
        <Chip tone={earth.visible ? 'earth' : 'off'} dot>
          {word('Earth', earth)}
        </Chip>
      </div>
      {audience === 'planner' && (
        <p className="hc-readout mono ui-muted">
          Sun el {formatAngle(sun.elevationDeg, 2)} az {Math.round(sun.azimuthDeg)}° · ridge {formatAngle(sun.horizonDeg, 2)} · Earth el {formatAngle(earth.elevationDeg, 2)}
        </p>
      )}
    </>
  )
}

function PanelMetrics({ now, prev, audience, startMs }: { now: SiteSummary; prev: SiteSummary | null; audience: Audience; startMs: number }) {
  const vs = `vs ${previousMonthName(startMs)}`
  const pct = (v: number) => Math.round(v * 100)
  const items: { label: string; value: string; delta: number | null; unit: string; better: 'higher' | 'lower' }[] = [
    { label: 'Sunlit', value: `${pct(now.sun)}%`, delta: prev ? pct(now.sun) - pct(prev.sun) : null, unit: '', better: 'higher' },
  ]
  if (audience === 'planner') {
    items.push(
      { label: 'Earth in view', value: `${pct(now.earth)}%`, delta: prev ? pct(now.earth) - pct(prev.earth) : null, unit: '', better: 'higher' },
      { label: 'Sun and Earth', value: `${pct(now.both)}%`, delta: prev ? pct(now.both) - pct(prev.both) : null, unit: '', better: 'higher' },
      { label: 'Longest night', value: `${Math.round(now.nightH)} h`, delta: prev ? Math.round(now.nightH) - Math.round(prev.nightH) : null, unit: ' h', better: 'lower' },
    )
  } else {
    items.push({ label: 'Earth in view', value: `${pct(now.earth)}%`, delta: prev ? pct(now.earth) - pct(prev.earth) : null, unit: '', better: 'higher' })
  }
  return (
    <dl className="hc-metrics">
      {items.map((m) => (
        <div key={m.label} className="hc-metric">
          <dt>{m.label}</dt>
          <dd className="mono">
            {m.value}
            {m.delta !== null && <Delta value={m.delta} unit={m.unit} better={m.better} suffix={vs} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

interface TimelineProps {
  sites: CompareSite[]
  runs: Record<string, ScenarioRun>
  startMs: number
  spanMs: number
  offset: number
  audience: Audience
}

function SharedTimeline({ sites, runs, startMs, spanMs, offset, audience }: TimelineProps) {
  const flat = useStore((s) => audience === 'educator' && s.experiment.flat)
  const days = spanMs / 86_400_000
  const ticks = useMemo(() => {
    const every = days <= 14 ? 1 : days <= 30 ? 5 : 10
    const out: number[] = []
    for (let d = 0; d < days; d += every) out.push(d)
    return out
  }, [days])

  const scrub = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setState({ cursorOffsetMs: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * spanMs })
  }
  const step = (hours: number) => {
    const s = getState()
    setState({ cursorOffsetMs: Math.max(0, Math.min(spanMs, s.cursorOffsetMs + hours * 3_600_000)) })
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') step(e.shiftKey ? 24 : 1)
    else if (e.key === 'ArrowLeft') step(e.shiftKey ? -24 : -1)
    else if (e.key === 'Home') setState({ cursorOffsetMs: 0 })
    else return
    e.preventDefault()
  }

  return (
    <section className="ui-card hc-timeline" aria-labelledby="hc-tl-title">
      <div className="hc-timeline-head">
        <h2 className="ui-title" id="hc-tl-title">
          The period at a glance
        </h2>
        <div className="hc-legend ui-small ui-muted">
          <span><i className="is-sun" />Sun in view</span>
          <span><i className="is-earth" />Earth in view</span>
          <span>Drag to move the clock</span>
        </div>
      </div>
      <div className="hc-timeline-body">
        <div className="hc-timeline-labels" aria-hidden="true">
          {sites.map((c, i) => (
            <span key={c.key} className="hc-timeline-label">
              <span className="hc-badge">{SLOT_LETTERS[i]}</span>
              <span className="hc-timeline-name">{shortName(c.name)}</span>
            </span>
          ))}
        </div>
        <div
          className="hc-timeline-bars"
          role="slider"
          tabIndex={0}
          aria-label="Time in the period"
          aria-valuemin={0}
          aria-valuemax={Math.round(spanMs / 3_600_000)}
          aria-valuenow={Math.round(offset / 3_600_000)}
          aria-valuetext={formatUtcLong(startMs + offset)}
          onKeyDown={onKey}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            setState({ playing: false })
            scrub(e)
          }}
          onPointerMove={(e) => {
            if (e.currentTarget.hasPointerCapture(e.pointerId)) scrub(e)
          }}
        >
          {sites.map((c) => {
            const raw = runs[c.key]?.evaluation
            const ev = raw && flat ? flatEvaluation(raw) : raw
            return (
              <div key={c.key} className="hc-timeline-row">
                <TrackBar tone="sun" size="s" intervals={ev?.intervals.sun ?? []} startMs={startMs} spanMs={spanMs} label={`${c.name}: Sun in view`} />
                <TrackBar tone="earth" size="s" intervals={ev?.intervals.earth ?? []} startMs={startMs} spanMs={spanMs} label={`${c.name}: Earth in view`} />
              </div>
            )
          })}
          <div className="timeline-axis" aria-hidden="true">
            {ticks.map((d) => (
              <span key={d} style={{ left: `${(d / days) * 100}%` }}>
                {audience === 'planner' ? formatUtcDate(startMs + d * 86_400_000) : `Day ${d + 1}`}
              </span>
            ))}
          </div>
          <span className="timeline-cursor" style={{ left: `${(offset / spanMs) * 100}%` }} aria-hidden="true" />
        </div>
      </div>
    </section>
  )
}
