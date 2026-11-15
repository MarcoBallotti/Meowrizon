/**
 * Mission Planner home (P1): requirements in a brief, then a recommendation
 * with its reasons, then the best landing windows for the chosen site.
 * Answers "Where and when should we land?".
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatUtcDate, formatUtcShort, previousMonthName } from '../domain/format'
import { assessMission, type MissionProfile } from '../domain/mission'
import type { Ranked, Region } from '../domain/ranking'
import { runScenario } from '../state/runner'
import { provider } from '../api'
import { orderingReason, candidateDifferences, requirementMargin, plannerContext, visibilityWindows } from '../domain/planner'
import { scenarioIssue } from '../domain/comparison'
import { rankingRequest } from '../domain/rankingRequest'
import { restorePlannerExperiment, getState, goTo, durationMs, setMission, setScenarioInput, setState, useStore } from '../state/store'
import { ArrowIcon, Button, Card, DateDial, Delta, Field, Select, TrackBar, Notice } from '../ui'

const DURATIONS = [7, 14, 30, 60, 90]
const DARK_LIMITS: (number | null)[] = [null, 48, 72, 96, 120, 168, 240, 336]
const pct = (v: number) => `${Math.round(v * 100)}%`

/** Applies a requirement change shortly after the slider settles. */
function useDebouncedMission(): [MissionProfile, (patch: Partial<MissionProfile>) => void] {
  const saved = useStore((s) => s.mission)
  // A draft exists only while a slider moves; otherwise the saved profile shows.
  const [draft, setDraft] = useState<{ base: MissionProfile; value: MissionProfile } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const shown = draft?.base === saved ? draft.value : saved
  const change = (patch: Partial<MissionProfile>) => {
    const next = { ...shown, ...patch }
    setDraft({ base: saved, value: next })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try { if (getState().mission === saved) setMission(next) } catch { /* Invalid drafts never become requirements. */ }
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
      <PlannerWhatIf />
    </Card>
  )
}

function hoursText(ms: number): string {
  const h = ms / 3_600_000
  return h < 48 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`
}

function Margins({ region }: { region: Ranked }) {
  return <details className="ui-small">
    <summary>How much margin remains?</summary>
    <ul>{region.assessment.checks.map(c => {
      const margin = requirementMargin(c)
      return <li key={c.id}>{c.label}: {c.value?.toFixed(2) ?? 'Unknown'} {c.unit}; {c.direction === 'min' ? 'minimum' : 'maximum'} {c.limit} {c.unit}
        {margin === null ? ' · margin unknown' : ` · margin ${margin.toFixed(2)} ${c.unit === '%' ? 'percentage points' : c.unit}`}</li>
    })}</ul>
    <p className="ui-muted">Margins include configured event allowances. They are distances from your limits, not statistical confidence bounds.</p>
  </details>
}

function PlannerWhatIf() {
  const s = useStore(s => s)
  const saved = s.plannerExperiment
  if (!saved) return null
  const sameContext = saved.context === plannerContext(s)
  const changed = (Object.keys(saved.mission) as (keyof MissionProfile)[]).filter(k => JSON.stringify(saved.mission[k]) !== JSON.stringify(s.mission[k]))
  const labels: Record<keyof MissionProfile, string> = {
    minSunFraction: 'Minimum sunlight', minEarthFraction: 'Minimum Earth visibility', minBothFraction: 'Minimum shared visibility',
    maxSunOutageH: 'Maximum darkness', maxEarthOutageH: 'Maximum Earth interruption', minJointWindowH: 'Minimum shared window',
    maxSlopeDeg: 'Local slope limit', maxRoughnessM: 'Surface roughness limit', maxDemPixelM: 'DEM resolution limit',
    eventMarginMinutes: 'Event allowance', power: 'Energy model settings',
  }
  const assessment = sameContext ? assessMission(saved.baseline, s.mission) : null
  return <div className="ui-small" aria-live="polite">
    <h2 className="ui-title">What changes if…?</h2>
    <p>Original recommendation: <strong>{saved.baseline.name}</strong>. Change the requirements above or in Mission requirements below.</p>
    {!sameContext ? <Notice>The date, duration, scope or calculation settings changed. Restore the original configuration to compare requirement changes.</Notice>
      : !changed.length ? <p>No requirements changed yet.</p> : <>
        <ul>{changed.map(k => {
          const show = (mission: MissionProfile) => {
            const value = mission[k]
            if (k === 'power') return mission.power.enabled ? 'enabled (configured equipment)' : 'disabled'
            if (value === null) return 'no limit'
            return k.endsWith('Fraction') ? `${(Number(value) * 100).toFixed(1)}%` : String(value)
          }
          return <li key={k}>{labels[k]}: {show(saved.mission)} → {show(s.mission)}{k === 'power' && ' · see Mission requirements for equipment changes'}</li>
        })}</ul>
        <p>The original site is now {assessment?.status === 'eligible' ? 'still eligible; any recommendation change reflects trade-offs and the current candidate set' : assessment?.status === 'excluded' ? 'excluded by the changed requirements' : 'missing evidence required by the changed requirements'}.</p>
        <ul>{assessment?.checks.filter(c => c.status !== 'pass').map(c => <li key={c.id}>{c.label}: {c.value === null ? c.reason : `${c.value.toFixed(2)} ${c.unit}; ${c.direction === 'min' ? 'requires at least' : 'allows at most'} ${c.limit} ${c.unit}`}</li>)}</ul>
      </>}
    <Button size="s" onClick={restorePlannerExperiment}>Restore original configuration</Button>{' '}
    <Button size="s" variant="quiet" onClick={() => setState({ plannerExperiment: null })}>Keep current configuration</Button>
  </div>
}

/** Evidence-based recommendation within the measured candidate set. */
export function Recommendation({ ranked, chosen, candidates, onOpen, onPick }: { ranked: Ranked[]; chosen: Ranked | undefined; candidates: Region[]; onOpen: () => void; onPick: (r: Ranked) => void }) {
  const s = useStore(s => s)
  const [alternativeId, setAlternativeId] = useState('')
  const startMs = s.scenarios.A.input.startMs
  const top = ranked[0]
  const current = provider.kind !== 'api' || s.ranking?.key === rankingRequest(s).key
  const busy = provider.kind === 'api' && (!!s.ranking?.busy || ((!current || !s.ranking) && !s.regionError && !s.siteError))
  const missing = !!s.regionError || !!s.siteError || (current && !!s.ranking?.failed.length)
    || candidates.some(r => assessMission(r, s.mission).status === 'insufficient-data')
  const partial = busy || missing
  const selectedAlternative = candidates.find(r => r.id === alternativeId && r.id !== top?.id)
  const alternative = selectedAlternative ?? (chosen?.id !== top?.id ? chosen : undefined) ?? ranked[1] ?? candidates.find(r => r.id !== top?.id)
  const differences = top && alternative ? candidateDifferences(top, alternative, s.mission) : []
  const otherRanked = ranked.find(r => r.id === alternative?.id)
  const baseline = s.plannerExperiment
  const comparableBaseline = baseline && baseline.context === plannerContext(s)
  const vs = `vs ${previousMonthName(startMs)}`

  if (!top) return <Card as="section" className="reco is-empty" aria-label="Recommendation">
    <h2 className="ui-title">{busy ? 'Finding the best site for this date…' : missing ? 'No recommendation from the available evidence' : 'No evaluated site for this period'}</h2>
    <p className="ui-small ui-muted">{busy ? 'Wait for current measurements before drawing a conclusion.' : missing ? 'Some candidates lack required data or failed to calculate. This does not establish that no solution exists.' : 'The evaluated candidates fail one or more configured limits. Inspect their reasons or try a different date or requirement.'}</p>
  </Card>

  return <Card as="section" className="reco" aria-label="Recommendation">
    <h2 className="ui-title is-m">{top.name.split(' · ')[0]}</h2>
    <p className="ui-small ui-muted">{provider.kind === 'demo' ? 'Practice catalog · not date-specific' : `${formatUtcDate(startMs)} · ${s.durationDays} days`}{partial ? ' · provisional: evaluation incomplete' : ' · evaluation complete'}</p>
    <p className="ui-small"><strong>{top.assessment.checks.filter(c => c.status === 'pass').length}/{top.assessment.checks.length} requirements met</strong>{provider.kind === 'demo' && ' · Static practice measurements; date and duration changes do not recalculate them.'}</p>
    {comparableBaseline && <p className="ui-small" role="status">{baseline.baseline.id === top.id ? 'The recommendation remains the same.' : `The current recommendation changed from ${baseline.baseline.name}.`}{partial ? ' The comparison is still provisional.' : ''}</p>}
    <dl className="reco-metrics">
      {([['Sunlight', top.sunFraction, top.previous?.sunFraction], ['Earth in view', top.earthFraction, top.previous?.earthFraction], ['Sun and Earth', top.bothFraction, top.previous?.bothFraction]] as const).map(([label, value, previous]) => <div key={label}><dt className="ui-small ui-muted">{label}</dt><dd className="mono">{pct(value)}{previous !== undefined && <Delta value={(value - previous) * 100} suffix={vs} />}</dd></div>)}
      <div><dt className="ui-small ui-muted">Longest darkness</dt><dd className="mono">{hoursText(top.longestNightH * 3600000)}</dd></div>
    </dl>
    <Margins region={top} />
    <details className="ui-small"><summary>Why not another site?</summary>
      <Field label="Compare with the recommendation" htmlFor="reco-alternative"><Select id="reco-alternative" value={alternative?.id ?? ''} onChange={e => setAlternativeId(e.target.value)}>
        <option value="">Select an alternative</option>{candidates.filter(r => r.id !== top.id).map(r => <option value={r.id} key={r.id}>{r.name}</option>)}
      </Select></Field>
      {alternative && <>
        <p className="ui-muted">{otherRanked ? orderingReason(top, otherRanked) : 'The alternative does not meet every configured requirement or lacks required evidence.'}</p>
        <ul>{differences.map(d => <li key={d.label}>{d.label}: recommendation {d.own.toFixed(1)}, alternative {d.other.toFixed(1)} {d.unit === 'percentage points' ? '%' : d.unit} · {d.outcome}.</li>)}</ul>
        {otherRanked ? <Margins region={otherRanked} /> : <ul>{assessMission(alternative, s.mission).checks.filter(c => c.status !== 'pass').map(c => <li key={c.id}>{c.label}: {c.reason ?? `${c.value?.toFixed(2)} ${c.unit}; limit ${c.limit} ${c.unit}`}</li>)}</ul>}
      </>}
      <p className="ui-muted">Only measured candidates in this scope appear. Screened or failed candidates remain listed in the shortlist evidence.</p>
    </details>
    <div className="reco-actions">
      {chosen?.id === top.id ? <Button icon={<ArrowIcon />} onClick={onOpen}>Open the horizon</Button> : <Button onClick={() => onPick(top)}>Select this site</Button>}
    </div>
  </Card>
}

/** When to land at the selected site: the period strip and its best windows. */
export function LandingWindows({ name }: { name: string | undefined }) {
  const settings = useStore(s => s)
  const run = settings.scenarios.A.run
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const span = useStore(durationMs)
  const result = run.phase === 'ready' && !run.stale ? run.evaluation : undefined
  const profile = run.terrain?.profile
  const matches = !!result && result.timesMs[0] === startMs && result.timesMs.at(-1) === startMs + span
    && profile?.params.azimuthStepDeg === settings.azimuthStepDeg && profile?.params.maxDistanceKm === settings.maxDistanceKm
    && profile?.observer.heightAboveSurfaceM === settings.scenarios.A.input.observerHeightM
  const issue = result && matches ? scenarioIssue(result, run.terrain!.id, startMs, startMs + span, settings.stepMinutes * 60000, provider.kind === 'demo') : null
  const ev = matches && !issue ? result : undefined
  const windows = useMemo(() => (ev ? visibilityWindows(ev.intervals.both, startMs, startMs + span) : []), [ev, startMs, span])
  if (!name) return null
  return (
    <Card as="section" className="windows" aria-label="Best landing windows">
      <div className="windows-head">
        <h2 className="ui-title">Visibility opportunities at {name}</h2>
        <span className="ui-small ui-muted">{ev && !run.stale ? 'Shared visibility, not validated mission-start dates' : 'Calculating Sun and Earth for the period…'}</span>
      </div>
      {run.phase === 'error' || issue ? <Notice tone="danger">{run.error ?? issue} <Button size="s" onClick={() => void runScenario('A')}>Retry calculation</Button></Notice> : ev ? (
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
                  <button type="button" className="ui-dial-link mono" onClick={() => {
                    goTo('site')
                    setState({ cursorOffsetMs: Math.max(0, Math.min(span, w.startMs - startMs)), playing: false })
                  }}>{formatUtcShort(w.startMs)} – {formatUtcShort(w.endMs)} UTC · inspect</button>
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
