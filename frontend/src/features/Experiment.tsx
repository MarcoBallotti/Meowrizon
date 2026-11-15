/**
 * Educator home (E2): pick an experiment, two sites side by side on one clock.
 * Answers "Why is landing on the Moon so difficult?" by contrast: the same
 * month at two places, with the hills on or off.
 */
import { provider } from '../api'
import { ArrowRight, Columns2 } from 'lucide-react'
import { setScenarioInput, setState, useStore } from '../state/store'
import { Button, Card, DateDial, Select, Toggle } from '../ui'
import { openComparePicker } from './compareSlots'
import { EXPERIMENTS, startExperiment, changeLessonDate } from './experiments'

export function ExperimentCard() {
  const input = useStore(s => s.scenarios.A.input)
  const sites = useStore(s => s.sites)
  return (
    <Card as="section" className="experiments" aria-label="Experiments">
      <div className="experiments-head">
        <h1 className="ui-title is-m">Why is landing on the Moon so difficult?</h1>
        <p className="ui-small ui-muted">Predict, observe, then explain. Compare dates, places, or the effect of terrain using the same calculation method.</p>
      </div>
      <label className="ui-small">Site for the date and terrain experiments
        <Select value={input.selectionId ?? ''} onChange={event => {
          const site = sites.find(s => s.id === event.target.value)
          if (site) setScenarioInput('A', { site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg }, siteName: site.name, selectionId: site.id })
        }}>
          <option value="">{input.siteName ?? 'Point selected on the Moon'}</option>
          {sites.map(site => <option key={site.id} value={site.id}>{site.name}</option>)}
        </Select>
      </label>
      <p className="ui-small ui-muted">You can also click a free point on the Moon. Current point: {input.site.latDeg.toFixed(3)}°, {input.site.lonEastDeg.toFixed(3)}°.</p>
      <ul className="experiments-list">
        {EXPERIMENTS.map((e) => (
          <li key={e.id}>
            <button type="button" className="experiment" onClick={() => startExperiment(e.id)}>
              <span className="experiment-title">{e.title}</span>
              <span className="ui-small ui-muted">{e.sites.length ? e.sites.map((s) => s.name.split(' · ')[0]).join(' vs ') : input.siteName ?? 'Your selected point'}</span>
              <span className="experiment-ask">{e.ask}</span>
              <ArrowRight className="experiment-go" size={20} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="secondary"
        icon={<Columns2 size={18} strokeWidth={1.75} aria-hidden="true" />}
        onClick={() => {
          setState({ compareSites: [], experiment: { id: null, mode: 'sites', trails: true } })
          openComparePicker()
        }}
      >
        Choose your own sites
      </Button>
    </Card>
  )
}

/** Above the windows: the question, what to notice, and the two switches. */
export function ExperimentBar() {
  const experiment = useStore((s) => s.experiment)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const mode = experiment.mode ?? 'sites'
  const view = useStore(s => s.compareView)
  const e = EXPERIMENTS.find((x) => x.id === experiment.id)
  return (
    <section className="ui-card is-tight experiment-bar" aria-label="Experiment">
      <div className="experiment-bar-text">
        {e ? (
          <>
            <b>Predict: {e.ask}</b>
            <details>
              <summary className="ui-small">Observe and explain</summary>
              <p className="ui-small">{e.notice}</p>
            </details>
          </>
        ) : (
          <b>Predict which site has more light or a longer interruption. Play the period, then explain the differences.</b>
        )}
      </div>
      <div className="experiment-bar-toggles">
        <DateDial label={mode === 'dates' ? 'Period A starts' : 'Period starts'} value={startMs} strip={false} onChange={ms => changeLessonDate('first', ms)} />
        {mode === 'dates' && <DateDial label="Period B starts" value={experiment.secondStartMs ?? startMs} strip={false} onChange={ms => changeLessonDate('second', ms)} />}
        <Toggle checked={experiment.trails} onChange={(trails) => setState((s) => ({ experiment: { ...s.experiment, trails } }))}>
          Sun and Earth paths (Full circle)
        </Toggle>
      </div>
      <p className="ui-small ui-muted experiment-bar-note">{mode === 'terrain'
        ? provider.kind === 'demo' ? 'Practice simulation: A uses synthetic terrain; B uses a zero-degree horizon. Both use the same centre-visibility model, without eclipse physics.' : 'A: real terrain. B: ideal zero-degree horizon. Both use the same disc visibility and eclipse model. The ideal horizon is a teaching counterfactual.'
        : mode === 'dates' ? 'Same site and duration, different dates. Playback aligns elapsed time; each window shows its own UTC date.' : 'Different sites, same dates and duration. A stronger result for one need may be weaker for another.'}</p>
      {experiment.trails && view !== 'circle' && <p className="ui-small ui-muted">Switch to Full circle to see the Sun and Earth paths.</p>}
    </section>
  )
}
