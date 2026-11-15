/**
 * 2A: the next eclipse with a countdown and "Go to eclipse".
 * K2: two years of eclipses on a strip, each marked visible or hidden from the site.
 * Dates come from the low-precision model (minutes of error) and say so.
 */
import { useMemo } from 'react'
import { formatDuration, formatFriendlyDuration, formatUtc, formatUtcDate, formatUtcShort } from '../domain/format'
import { scenarioStartFor, upcomingEclipses, type SiteEclipse } from '../domain/eclipses'
import { setScenarioInput, setState, useStore, type Audience } from '../state/store'
import { Button, Card, Chip, EclipseIcon } from '../ui'

function goToEclipse(e: SiteEclipse) {
  const { startMs, cursorOffsetMs } = scenarioStartFor(e)
  setScenarioInput('A', { startMs })
  setState({ cursorOffsetMs, playing: false })
}

function useEclipses() {
  const evaluation = useStore((s) => s.scenarios.A.run.evaluation)
  const site = useStore((s) => s.scenarios.A.input.site)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const profile = useStore((s) => s.scenarios.A.run.terrain?.profile)
  // Anchor the search on the day, so moving the cursor does not recompute it.
  const day = Math.floor(startMs / 86_400_000) * 86_400_000
  return useMemo(() => evaluation?.origin === 'engine' ? evaluation.eclipseCalendar?.events ?? [] : upcomingEclipses(day - 3 * 86_400_000, site, profile), [day, site, profile, evaluation])
}

const kindLabel = (e: SiteEclipse) => (e.kind === 'total' ? 'total' : 'partial')

export function NextEclipseCard({ audience }: { audience: Audience }) {
  const eclipses = useEclipses()
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const offset = useStore((s) => s.cursorOffsetMs)
  const t = startMs + offset
  const current = eclipses.find((e) => e.startMs <= t && t <= e.endMs)
  const next = current ?? eclipses.find((e) => e.maxMs > t)
  if (!next) return null

  const inProgress = current !== undefined
  const hours = formatDuration(next.endMs - next.startMs)
  const headline = inProgress ? 'Eclipse now' : `Solar eclipse in ${formatFriendlyDuration(next.maxMs - t)}`
  const body =
    audience === 'student'
      ? inProgress
        ? `Earth is passing in front of the Sun. ${next.visible ? 'From here you can see it.' : 'A hill hides it from here.'}`
        : `Earth will hide the Sun for about ${formatFriendlyDuration(next.endMs - next.startMs)}. ${next.visible ? 'You will see it from here.' : 'A hill will hide it from here.'}`
      : audience === 'teacher'
        ? `On Earth this is a lunar eclipse: the red Moon you can see from home. From here Earth covers ${next.kind === 'total' ? 'the whole Sun' : `${Math.round(Math.min(1, next.magnitude) * 100)}% of the Sun`} for ${hours}.`
        : `Greatest ${formatUtc(next.maxMs)} UTC · contacts ${formatUtcShort(next.startMs)}–${formatUtcShort(next.endMs)} · magnitude ${next.magnitude.toFixed(2)}${next.totalStartMs !== null && next.totalEndMs !== null ? ` · total ${formatDuration(next.totalEndMs - next.totalStartMs)}` : ''}`

  return (
    <Card tone="dark" as="article" className="eclipse-card">
      <span className="ui-eyebrow eclipse-eyebrow">
        <EclipseIcon size={18} />
        Eclipse
      </span>
      <p className="ui-story-headline">{headline}</p>
      <p className="ui-story-body">{body}</p>
      <div className="ui-story-extra">
        <Chip tone="on-dark">
          {formatUtcDate(next.maxMs)} {new Date(next.maxMs).getUTCFullYear()} · {kindLabel(next)}
        </Chip>
        <Chip tone="on-dark">{next.visible ? 'Visible from this site' : 'Hidden by the terrain'}</Chip>
      </div>
      {!inProgress && (
        <Button variant="inverse" size="s" onClick={() => goToEclipse(next)}>
          Go to eclipse
        </Button>
      )}
    </Card>
  )
}

export function EclipseStrip({ audience }: { audience: Audience }) {
  const real = useStore((s) => s.scenarios.A.run.evaluation?.origin === 'engine')
  const eclipses = useEclipses()
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const day = Math.floor(startMs / 86_400_000) * 86_400_000
  const from = day - 3 * 86_400_000
  const span = 2 * 365.25 * 86_400_000
  const years: number[] = []
  for (let y = new Date(from).getUTCFullYear() + 1; Date.UTC(y, 0, 1) < from + span; y++) years.push(y)

  return (
    <Card as="article" className="eclipse-strip">
      <div className="report-head">
        <h2 className="ui-title">{audience === 'student' ? 'Eclipses here' : 'Eclipses from this site'}</h2>
        <span className="ui-small ui-muted">next 2 years · {real ? 'JPL Horizons · sampled contacts' : 'approx. model'}</span>
      </div>
      <div className="strip" role="list" aria-label="Eclipses in the next two years">
        <span className="strip-line" aria-hidden="true" />
        {years.map((y) => (
          <span key={y} className="strip-year" style={{ left: `${((Date.UTC(y, 0, 1) - from) / span) * 100}%` }} aria-hidden="true">
            {y}
          </span>
        ))}
        {eclipses.map((e) => (
          <button
            key={e.maxMs}
            type="button"
            role="listitem"
            className={`strip-dot is-${e.kind}${e.visible ? ' is-visible' : ''}`}
            style={{ left: `${((e.maxMs - from) / span) * 100}%` }}
            onClick={() => goToEclipse(e)}
            title={`${formatUtc(e.maxMs)} UTC · ${kindLabel(e)} · ${e.visible ? 'visible' : 'hidden by terrain'}`}
            aria-label={`${formatUtcDate(e.maxMs)} ${new Date(e.maxMs).getUTCFullYear()}, ${kindLabel(e)} eclipse, ${e.visible ? 'visible from this site' : 'hidden by terrain'}. Go to it.`}
          />
        ))}
      </div>
      <div className="strip-legend ui-small ui-muted">
        <span>
          <i className="strip-key is-visible" /> visible from here
        </span>
        <span>
          <i className="strip-key" /> hidden by a hill
        </span>
        <span>
          <i className="strip-key is-total is-visible" /> total
        </span>
      </div>
      {audience === 'planner' && (
        <div className="table-scroll">
        <table className="ui-table">
          <thead>
            <tr>
              <th scope="col">Greatest (UTC)</th>
              <th scope="col">Kind</th>
              <th scope="col">Mag.</th>
              <th scope="col">Length</th>
              <th scope="col">Sun height</th>
            </tr>
          </thead>
          <tbody>
            {eclipses.map((e) => (
              <tr key={e.maxMs}>
                <td>
                  <button type="button" className="ranking-link mono" onClick={() => goToEclipse(e)}>
                    {formatUtc(e.maxMs)}
                  </button>
                </td>
                <td>{kindLabel(e)}</td>
                <td>{e.magnitude.toFixed(2)}</td>
                <td>{formatDuration(e.endMs - e.startMs)}</td>
                <td className={e.visible ? 'is-pos' : 'is-neg'}>{e.sunElevationDeg.toFixed(1)}°</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
    </Card>
  )
}
