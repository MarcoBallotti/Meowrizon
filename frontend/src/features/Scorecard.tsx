/** General Public: choose, inspect the evidence, and try to improve it. */
import { MapPin, RotateCcw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { checksOf, gradeColor, mainProblem, suggestBetter } from '../domain/grade'
import { formatDuration, formatUtcDate } from '../domain/format'
import { scenarioIssue, terrainIssue } from '../domain/comparison'
import { decisionChanges, decisionConfig, makeAttempt, sameDecisionConfig, testedAlternatives, validDecisionMetrics } from '../domain/publicDecision'
import { runScenario, summarize } from '../state/runner'
import { getState, goTo, recordAttempt, reopenAttempt, setScenarioInput, useStore } from '../state/store'
import { Button, Card, DateDial, Delta, Notice } from '../ui'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const

export function AttemptHistory({ currentId }: { currentId?: string }) {
  const attempts = useStore(s => s.attempts)
  if (!attempts.length) return null
  const current = attempts.find(t => t.id === currentId)
  const comparable = current ? attempts.filter(t => sameDecisionConfig(t.config, current.config)) : []
  const best = comparable.reduce<typeof current>((best, t) => !best || t.index > best.index ? t : best, undefined)
  return <details className="ui-small">
    <summary>Your tries ({attempts.length}) · this visit</summary>
    <ol>{attempts.map((t, i) => <li key={t.id}>
      <button type="button" className="ui-dial-link" aria-current={t.id === currentId ? 'true' : undefined} onClick={() => reopenAttempt(t.id)}>
        Try {i + 1} · {t.name} · {formatUtcDate(t.startMs)} · {t.config.durationDays} days · {t.grade} ({t.index.toFixed(1)}/100)
        {t.id === currentId ? ' · current' : ''}{t.id === best?.id ? ' · best comparable choice' : ''}
      </button>
    </li>)}</ol>
  </details>
}

export function Scorecard() {
  const state = useStore(s => s)
  const { scenarios: { A }, attempts, durationDays, stepMinutes } = state
  const { startMs } = A.input
  const span = durationDays * 86_400_000
  const ev = A.run.phase === 'ready' && !A.run.stale ? A.run.evaluation : undefined
  const terrain = A.run.terrain
  const configKey = JSON.stringify(decisionConfig(state))
  const config = useMemo(() => JSON.parse(configKey) as ReturnType<typeof decisionConfig>, [configKey])

  const assessment = useMemo(() => {
    if (!ev || !terrain || !config) return null
    const issue = (ev.origin === 'engine' ? terrainIssue(terrain) : null)
      ?? scenarioIssue(ev, terrain.id, startMs, startMs + span, stepMinutes * 60_000, true)
    if (issue) return { issue, attempt: null }
    const metrics = summarize(ev, startMs, startMs + span)
    if (!validDecisionMetrics(metrics, durationDays * 24)) return { issue: 'Visibility measurements are missing or inconsistent.', attempt: null }
    return { issue: null, attempt: makeAttempt(A.input, config, metrics, ev.id) }
  }, [ev, terrain, A.input, startMs, span, stepMinutes, durationDays, config])
  const current = assessment?.attempt

  useEffect(() => {
    if (!current || getState().scenarios.A.run.evaluation !== ev) return
    recordAttempt(current)
  }, [current, ev])

  if (!current) {
    const error = A.run.phase === 'error' ? A.run.error ?? 'The calculation could not finish.'
      : assessment?.issue ?? (A.run.phase === 'ready' && !A.run.stale ? 'The completed result is missing measurements or model information.' : null)
    return <Card as="section" className="score is-waiting" aria-label="Your result" aria-busy={!error}>
      <h2 className="ui-title">{error ? 'Your choice could not be evaluated' : 'Evaluating your chosen spot…'}</h2>
      {error ? <><Notice tone="danger">{error} No grade has been recorded.</Notice>
        <Button onClick={() => void runScenario('A')}>Try the calculation again</Button>
        <Button variant="quiet" onClick={() => goTo('moon')}>Change your choice</Button></>
        : <p className="ui-small ui-muted" role="status">{A.run.message ?? `Following the Sun and Earth for ${durationDays} days.`}</p>}
      <AttemptHistory />
    </Card>
  }

  const here = attempts.findIndex(t => t.id === current.id)
  const before = attempts.slice(0, here < 0 ? attempts.length : here).findLast(t => sameDecisionConfig(t.config, current.config))
  const comparable = attempts.filter(t => sameDecisionConfig(t.config, current.config))
  const best = Math.max(current.index, ...comparable.map(t => t.index))
  const checks = checksOf(current.metrics)
  const metrics = current.metrics
  const readings = {
    sun: { label: 'Sunlight', value: `${Math.round(metrics.sun * 100)}%` },
    earth: { label: 'Earth in view', value: `${Math.round(metrics.earth * 100)}%` },
    both: { label: 'Sun and Earth together', value: `${Math.round(metrics.both * 100)}%` },
    night: { label: 'Longest night', value: formatDuration(metrics.nightH * 3_600_000) },
    radio: { label: 'Longest time without Earth', value: metrics.earthOutageH === undefined ? '—' : formatDuration(metrics.earthOutageH * 3_600_000) },
  }
  const suggestion = suggestBetter(current.site, current.index, testedAlternatives(attempts, current))

  return <Card as="section" className="score" aria-label="Your result">
    <div className="score-head">
      <span className="score-grade" style={{ background: gradeColor(current.grade) }} aria-label={`Grade ${current.grade}`}>{current.grade}</span>
      <div className="score-head-text">
        <span className="ui-small ui-muted">{here >= 0 ? `Try ${here + 1}` : 'Your spot'} · {durationDays} days</span>
        <b className="score-index mono">{current.index.toFixed(1)}/100
          {before && <Delta value={current.index - before.index} suffix={`vs try ${attempts.indexOf(before) + 1}`} />}
        </b>
        {comparable.length > 1 && <span className="ui-small ui-muted">Best comparable choice: {best.toFixed(1)}/100</span>}
      </div>
    </div>
    <p className="ui-small ui-muted">{current.config.origin === 'demo' ? 'Illustrative simulation · ' : ''}Visibility grade · A–F, higher is better. Does not assess landing safety or power.</p>
    <dl className="score-checks">{checks.map(c => <div key={c.id} className={`score-check is-${c.tone}`}>
      <dt>{readings[c.id].label}</dt><dd>{readings[c.id].value}</dd>
    </div>)}</dl>
    <details className="score-details ui-small"><summary>Understand this result</summary>
      <p>Learning index of visibility, not a landing-safety or power assessment.</p>
      <ul>{checks.map(c => <li key={c.id}><b>{c.label}.</b> {c.reason}</li>)}</ul>
      <p>{mainProblem(checks, A.input.site.latDeg)}</p>
    </details>
    <details className="score-details ui-small"><summary>How the grade is calculated</summary>
      <p>Balanced sunlight, Earth visibility and shared visibility raise the index. Long interruptions in sunlight or Earth visibility lower it. A ≥55, B ≥42, C ≥28, D ≥15; lower scores receive F. The same method and period length are used when comparing your tries.</p>
    </details>
    {before ? <div className="ui-small" aria-live="polite">
      <h3 className="ui-title">What changed since try {attempts.indexOf(before) + 1}?</h3>
      <ul>{decisionChanges(current.metrics, before.metrics).map(c => <li key={c.key}>
        {c.label}: {Math.abs(c.delta) < .05 ? 'unchanged' : `${c.delta > 0 ? '+' : ''}${c.delta.toFixed(1)} ${c.unit} · ${c.outcome}`}
      </li>)}</ul>
    </div> : attempts.length > (here >= 0 ? 1 : 0) && <p className="ui-small ui-muted">Earlier tries use different settings or methods, so their grades are not compared.</p>}
    {suggestion && <div className="score-suggest">
      <MapPin {...ICON} /><span>Your previously tested <b>{suggestion.region.name}</b>, {Math.round(suggestion.km)} km {suggestion.direction}, scored {suggestion.grade} for this same period.</span>
      <Button size="s" onClick={() => reopenAttempt(suggestion.region.id)}>Revisit this choice</Button>
    </div>}
    <div className="score-actions">
      <Button icon={<RotateCcw {...ICON} />} onClick={() => goTo('moon')}>Change spot, keep this date</Button>
      <DateDial label="Change date, keep this spot" value={startMs} strip={false} onChange={ms => setScenarioInput('A', { startMs: ms })} />
      <AttemptHistory currentId={current.id} />
    </div>
  </Card>
}
