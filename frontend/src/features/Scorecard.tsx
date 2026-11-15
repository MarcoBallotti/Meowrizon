/**
 * General Public result (U1): the grade of the chosen spot, what works and
 * what does not, and where to try next. Every finished calculation becomes a
 * try that stays on the Moon as a numbered badge.
 */
import { MapPin, RotateCcw } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { provider } from '../api'
import { previousMonthName } from '../domain/format'
import { checksOf, gradeColor, gradeOf, indexOf, mainProblem, suggestBetter } from '../domain/grade'
import { summarize } from '../state/runner'
import { durationMs, getState, goTo, setScenarioInput, setState, useStore } from '../state/store'
import { Button, Card, DateDial, Delta } from '../ui'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const

export function Scorecard() {
  const A = useStore((s) => s.scenarios.A)
  const span = useStore(durationMs)
  const durationDays = useStore((s) => s.durationDays)
  const attempts = useStore((s) => s.attempts)
  const catalog = useStore((s) => s.regions)
  const measured = useStore((s) => s.ranking)
  const ev = A.run.stale ? undefined : A.run.evaluation
  const { startMs } = A.input

  const result = useMemo(() => {
    if (!ev) return null
    const now = summarize(ev, startMs, startMs + span)
    const index = indexOf(now, durationDays * 24)
    return { now, index, grade: gradeOf(index), checks: checksOf(now) }
  }, [ev, startMs, span, durationDays])

  const prevIndex = useMemo(() => {
    const p = A.run.previous
    return p ? indexOf(summarize(p, startMs - span, startMs), durationDays * 24) : null
  }, [A.run.previous, startMs, span, durationDays])

  // Record the try once per finished calculation.
  useEffect(() => {
    if (!result || !ev) return
    const { site, siteName } = getState().scenarios.A.input
    const last = getState().attempts.at(-1)
    if (last && last.site.latDeg === site.latDeg && last.site.lonEastDeg === site.lonEastDeg && last.startMs === startMs) return
    setState((s) => ({ attempts: [...s.attempts, { site, name: siteName ?? 'Your spot', startMs, grade: result.grade, index: result.index }] }))
  }, [ev, result, startMs])

  const regions = provider.kind === 'api' ? measured?.regions ?? [] : catalog?.regions ?? []
  const suggestion = result ? suggestBetter(A.input.site, result.index, regions) : null

  if (!result) {
    return (
      <Card as="section" className="score is-waiting" aria-label="Your result">
        <h2 className="ui-title">Scoring your landing spot…</h2>
        <p className="ui-small ui-muted">We are tracing the hills around it and following the Sun and Earth for {durationDays} days.</p>
      </Card>
    )
  }

  // The try just recorded is the last one; compare with the one before it.
  const here = attempts.findLastIndex((t) => t.site.latDeg === A.input.site.latDeg && t.site.lonEastDeg === A.input.site.lonEastDeg && t.startMs === startMs)
  const before = here > 0 ? attempts[here - 1] : null
  const best = attempts.reduce<number | null>((b, t) => (b === null || t.index > b ? t.index : b), null)

  return (
    <Card as="section" className="score" aria-label="Your result">
      <div className="score-head">
        <span className="score-grade" style={{ background: gradeColor(result.grade) }} aria-label={`Grade ${result.grade}`}>
          {result.grade}
        </span>
        <div className="score-head-text">
          <span className="ui-small ui-muted">{here >= 0 ? `Try ${here + 1}` : 'Your spot'}</span>
          <b className="score-index mono">
            {Math.round(result.index)}/100
            {before ? <Delta value={result.index - before.index} suffix={`vs try ${here}`} /> : prevIndex !== null && <Delta value={result.index - prevIndex} suffix={`vs ${previousMonthName(startMs)}`} />}
          </b>
          {best !== null && attempts.length > 1 && <span className="ui-small ui-muted">Your best so far: {Math.round(best)}/100</span>}
        </div>
      </div>

      <ul className="score-checks">
        {result.checks.map((c) => (
          <li key={c.id} className={`score-check is-${c.tone}`}>
            <b>{c.label}</b>
            <span>{c.reason}</span>
          </li>
        ))}
      </ul>

      <p className="score-tip">{mainProblem(result.checks, A.input.site.latDeg)}</p>

      {suggestion && (
        <div className="score-suggest">
          <MapPin {...ICON} />
          <span>
            Try <b>{suggestion.region.name.split(' · ')[0]}</b>, {Math.round(suggestion.km)} km {suggestion.direction}: it scores {suggestion.grade} for this period.
          </span>
          <Button size="s" onClick={() => setScenarioInput('A', { site: suggestion.region.center, siteName: suggestion.region.name, selectionId: suggestion.region.id })}>
            Land there
          </Button>
        </div>
      )}

      <div className="score-actions">
        <Button icon={<RotateCcw {...ICON} />} onClick={() => goTo('moon')}>Pick another spot</Button>
        <DateDial label="Or try another day" value={startMs} strip={false} onChange={(ms) => setScenarioInput('A', { startMs: ms })} />
      </div>
    </Card>
  )
}
