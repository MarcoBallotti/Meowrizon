/**
 * Educator home (E2): pick an experiment, two sites side by side on one clock.
 * Answers "Why is landing on the Moon so difficult?" by contrast: the same
 * month at two places, with the hills on or off.
 */
import { ArrowRight, Columns2 } from 'lucide-react'
import { setScenarioInput, setState, useStore } from '../state/store'
import { Button, Card, DateDial, Toggle } from '../ui'
import { openComparePicker } from './compareSlots'
import { EXPERIMENTS, startExperiment } from './experiments'

export function ExperimentCard() {
  return (
    <Card as="section" className="experiments" aria-label="Experiments">
      <div className="experiments-head">
        <h1 className="ui-title is-m">Why is landing on the Moon so difficult?</h1>
        <p className="ui-small ui-muted">Pick an experiment. Two places play the same month side by side, so the class sees what changes and why.</p>
      </div>
      <ul className="experiments-list">
        {EXPERIMENTS.map((e) => (
          <li key={e.id}>
            <button type="button" className="experiment" onClick={() => startExperiment(e.id)}>
              <span className="experiment-title">{e.title}</span>
              <span className="ui-small ui-muted">{e.sites.map((s) => s.name.split(' · ')[0]).join(' vs ')}</span>
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
          setState({ compareSites: [], experiment: { id: null, flat: false, trails: true } })
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
  const e = EXPERIMENTS.find((x) => x.id === experiment.id)
  return (
    <section className="ui-card is-tight experiment-bar" aria-label="Experiment">
      <div className="experiment-bar-text">
        {e ? (
          <>
            <b>{e.ask}</b>
            <details>
              <summary className="ui-small">What to notice</summary>
              <p className="ui-small">{e.notice}</p>
            </details>
          </>
        ) : (
          <b>Play the month and compare what each site sees.</b>
        )}
      </div>
      <div className="experiment-bar-toggles">
        <DateDial label="Month starts" value={startMs} strip={false} onChange={(ms) => {
          setState({ cursorOffsetMs: 0 })
          setScenarioInput('A', { startMs: ms })
        }} />
        <Toggle checked={!experiment.flat} onChange={(on) => setState((s) => ({ experiment: { ...s.experiment, flat: !on } }))}>
          Terrain
        </Toggle>
        <Toggle checked={experiment.trails} onChange={(trails) => setState((s) => ({ experiment: { ...s.experiment, trails } }))}>
          Sun and Earth paths
        </Toggle>
      </div>
      {experiment.flat && <p className="ui-small ui-muted experiment-bar-note">Terrain off: the horizon is drawn flat and a body counts as in view whenever it is above 0°. Compare the numbers with terrain on to see what the hills take away.</p>}
    </section>
  )
}
