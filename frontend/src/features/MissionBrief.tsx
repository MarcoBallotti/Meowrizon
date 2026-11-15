/**
 * Mission Planner home (P1): requirements in a brief, then a recommendation
 * with its reasons, then the best landing windows for the chosen site.
 * Answers "Where and when should we land?".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { TimeInterval } from '../api/types'
import { formatUtcDate, formatUtcShort, previousMonthName } from '../domain/format'
import type { MissionProfile } from '../domain/mission'
import type { Ranked } from '../domain/ranking'
import { durationMs, setMission, setScenarioInput, setState, useStore } from '../state/store'
import { ArrowIcon, Button, Card, DateDial, Delta, Field, Select, TrackBar } from '../ui'

const DURATIONS = [7, 14, 30, 60, 90]
const DARK_LIMITS: (number | null)[] = [null, 48, 72, 96, 120, 168, 240, 336]
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Applies a requirement change shortly after the slider settles. */
function useDebouncedMission(): [MissionProfile, (patch: Partial<MissionProfile>) => void] {
  const saved = useStore((s) => s.mission)
  // A draft exists only while a slider moves; otherwise the saved profile shows.
  const [draft, setDraft] = useState<MissionProfile | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shown = draft ?? saved
  const change = (patch: Partial<MissionProfile>) => {
    const next = { ...shown, ...patch }
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try { setMission(next) } catch { /* Invalid drafts never become requirements. */ }
      setDraft(null)
    }, 400)
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  return [shown, change]
}

function Requirement({ id, label, value, display, min, max, step, onChange }: { id: string; label: string; value: number; display: string; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div className="brief-req">
      <label htmlFor={id} className="brief-req-head">
        <span>{label}</span>
        <b className="mono">{display}</b>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

/** Period and the three requirements a planner sets first. */
export function MissionBrief() {
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const durationDays = useStore((s) => s.durationDays)
  const [mission, change] = useDebouncedMission()
  const darkIndex = Math.max(0, DARK_LIMITS.indexOf(mission.maxSunOutageH))
  return (
    <Card as="section" className="brief" aria-label="Mission brief">
      <div className="brief-head">
        <h1 className="ui-title is-m">Where and when should we land?</h1>
        <p className="ui-small ui-muted">Set the mission period and the minimum conditions. The shortlist updates as you move the sliders.</p>
      </div>
      <div className="brief-period">
        <DateDial label="Mission start, UTC" value={startMs} minutes strip={false} onChange={(ms) => setScenarioInput('A', { startMs: ms })} />
        <Field label="Duration" htmlFor="brief-duration">
          <Select id="brief-duration" inputSize="s" value={durationDays} onChange={(e) => setState({ durationDays: Number(e.target.value), cursorOffsetMs: 0 })}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} days</option>)}
          </Select>
        </Field>
      </div>
      <div className="brief-reqs">
        <Requirement id="req-sun" label="Sunlight at least" value={Math.round(mission.minSunFraction * 100)} display={pct(mission.minSunFraction)} min={0} max={100} step={5} onChange={(v) => change({ minSunFraction: v / 100 })} />
        <Requirement id="req-earth" label="Earth in view at least" value={Math.round(mission.minEarthFraction * 100)} display={pct(mission.minEarthFraction)} min={0} max={100} step={5} onChange={(v) => change({ minEarthFraction: v / 100 })} />
        <Requirement
          id="req-dark"
          label="Longest darkness at most"
          value={darkIndex}
          display={mission.maxSunOutageH === null ? 'No limit' : `${mission.maxSunOutageH} h`}
          min={0}
          max={DARK_LIMITS.length - 1}
          step={1}
          onChange={(i) => change({ maxSunOutageH: DARK_LIMITS[i] })}
        />
      </div>
    </Card>
  )
}

/** Longest windows with both the Sun and Earth in view, longest first. */
function bestWindows(intervals: TimeInterval[], n = 3): TimeInterval[] {
  return [...intervals].sort((a, b) => (b.endMs - b.startMs) - (a.endMs - a.startMs)).slice(0, n)
}

function hoursText(ms: number): string {
  const h = ms / 3_600_000
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`
}

/** The answer in one sentence, its reasons, and the way into the horizon. */
export function Recommendation({ ranked, chosen, onOpen, onPick }: { ranked: Ranked[]; chosen: Ranked | undefined; onOpen: () => void; onPick: (r: Ranked) => void }) {
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const top = ranked[0]
  const busy = useStore((s) => s.ranking?.busy ?? false)
  if (!top) {
    return (
      <Card as="section" className="reco is-empty" aria-label="Recommendation">
        <h2 className="ui-title">{busy ? 'Measuring candidate sites…' : 'No site meets these requirements'}</h2>
        <p className="ui-small ui-muted">{busy ? 'The recommendation appears as soon as the first candidates are measured.' : 'Lower a slider or pick a longer period. Excluded sites and their reasons are listed below.'}</p>
      </Card>
    )
  }
  const runnerUp = ranked[1]
  const vs = `vs ${previousMonthName(startMs)}`
  const passed = top.assessment.checks.filter((c) => c.status === 'pass').length
  const lead = runnerUp
    ? top.bothFraction >= runnerUp.bothFraction
      ? `${pct(top.bothFraction - runnerUp.bothFraction)} more shared Sun and Earth time than ${runnerUp.name.split(' · ')[0]}.`
      : `${runnerUp.name.split(' · ')[0]} has more shared time, but ${top.name.split(' · ')[0]} has shorter outages.`
    : 'The only candidate that meets every requirement.'
  return (
    <Card as="section" className="reco" aria-label="Recommendation">
      <span className="ui-small ui-muted">Recommended for {formatUtcDate(startMs)}{busy ? ' · provisional while sites are measured' : ''}</span>
      <h2 className="ui-title is-m">{top.name.split(' · ')[0]}</h2>
      <p>Meets all {passed} requirements. {lead}</p>
      <dl className="reco-metrics">
        {([['Sunlight', top.sunFraction, top.previous?.sunFraction], ['Earth in view', top.earthFraction, top.previous?.earthFraction], ['Sun and Earth', top.bothFraction, top.previous?.bothFraction]] as const).map(([label, v, prev]) => (
          <div key={label}>
            <dt className="ui-small ui-muted">{label}</dt>
            <dd className="mono">{pct(v)}{prev !== undefined && <Delta value={(v - prev) * 100} suffix={vs} />}</dd>
          </div>
        ))}
        <div>
          <dt className="ui-small ui-muted">Longest darkness</dt>
          <dd className="mono">{hoursText(top.longestNightH * 3_600_000)}{top.previous && <Delta value={top.longestNightH - top.previous.longestNightH} unit=" h" better="lower" suffix={vs} />}</dd>
        </div>
      </dl>
      <div className="reco-actions">
        {chosen?.id === top.id ? (
          <Button icon={<ArrowIcon />} onClick={onOpen}>Open the horizon at {top.name.split(' · ')[0]}</Button>
        ) : (
          <Button onClick={() => onPick(top)}>Select {top.name.split(' · ')[0]}</Button>
        )}
      </div>
    </Card>
  )
}

/** When to land at the selected site: the period strip and its best windows. */
export function LandingWindows({ name }: { name: string | undefined }) {
  const run = useStore((s) => s.scenarios.A.run)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const span = useStore(durationMs)
  const ev = run.evaluation
  const windows = useMemo(() => (ev ? bestWindows(ev.intervals.both) : []), [ev])
  if (!name) return null
  return (
    <Card as="section" className="windows" aria-label="Best landing windows">
      <div className="windows-head">
        <h2 className="ui-title">When to land at {name}</h2>
        <span className="ui-small ui-muted">{ev && !run.stale ? 'Longest stretches with the Sun and Earth both in view' : 'Calculating Sun and Earth for the period…'}</span>
      </div>
      {ev && !run.stale ? (
        <>
          <div className="windows-strips">
            <span className="ui-small ui-muted">Sun</span><TrackBar tone="sun" size="s" intervals={ev.intervals.sun} startMs={startMs} spanMs={span} label="Sun in view" />
            <span className="ui-small ui-muted">Earth</span><TrackBar tone="earth" size="s" intervals={ev.intervals.earth} startMs={startMs} spanMs={span} label="Earth in view" />
            <span className="ui-small ui-muted">Both</span><TrackBar tone="both" size="s" intervals={ev.intervals.both} startMs={startMs} spanMs={span} label="Sun and Earth both in view" />
          </div>
          {windows.length ? (
            <ol className="windows-list">
              {windows.map((w, i) => (
                <li key={w.startMs}>
                  <span className="ui-small ui-muted">{i === 0 ? 'Best' : `${i + 1}`}</span>
                  <span className="mono">{formatUtcShort(w.startMs)} – {formatUtcShort(w.endMs)} UTC</span>
                  <b className="mono">{hoursText(w.endMs - w.startMs)}</b>
                </li>
              ))}
            </ol>
          ) : (
            <p className="ui-small ui-muted">The Sun and Earth are never in view together in this period.</p>
          )}
        </>
      ) : (
        <div className="windows-strips is-loading" aria-hidden="true"><span /><i /><span /><i /><span /><i /></div>
      )}
    </Card>
  )
}
