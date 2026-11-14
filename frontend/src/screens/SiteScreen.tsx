import { formatLat, formatLon, formatUtcLong } from '../domain/format'
import { CUSTOM_SITE_NAME } from '../domain/sites'
import { HorizonScene } from '../features/HorizonScene'
import { Report } from '../features/Report'
import { Timeline } from '../features/Timeline'
import { TopBar } from '../features/TopBar'
import { runScenario } from '../state/runner'
import { goTo, useStore } from '../state/store'
import { BackIcon, Button, Notice, Progress, SpaceWindow } from '../ui'

export function SiteScreen() {
  const audience = useStore((s) => s.audience)
  const A = useStore((s) => s.scenarios.A)
  const offset = useStore((s) => s.cursorOffsetMs)
  const { terrain, evaluation, phase, progress, error } = A.run
  const busy = phase === 'terrain' || phase === 'ephemeris'
  const name = A.input.siteName ?? CUSTOM_SITE_NAME

  return (
    <div className="site-page">
      <TopBar
        start={
          <div className="site-title">
            <Button variant="quiet" pill size="s" icon={<BackIcon />} onClick={() => goTo('moon')}>
              {audience === 'planner' ? 'Moon' : 'Back to the Moon'}
            </Button>
            <div className="site-title-text">
              <h1 className="ui-title is-m">{name}</h1>
              <span className="ui-small ui-muted">
                {audience === 'planner'
                  ? `${formatLat(A.input.site.latDeg)} ${formatLon(A.input.site.lonEastDeg)} · start ${formatUtcLong(A.input.startMs)}`
                  : `From ${formatUtcLong(A.input.startMs)}`}
              </span>
            </div>
          </div>
        }
      />

      <div className="site-layout">
        <div className="site-main">
          <SpaceWindow className="site-window" aria-label="View from the site">
            {terrain && evaluation ? (
              <HorizonScene profile={terrain.profile} evaluation={evaluation} cursorMs={A.input.startMs + offset} audience={audience} />
            ) : (
              <div className="site-loading">
                {phase === 'error' ? (
                  <Notice tone="danger">
                    <strong>We could not work out this horizon.</strong> {error}{' '}
                    <Button size="s" variant="inverse" onClick={() => void runScenario('A')}>
                      Try again
                    </Button>
                  </Notice>
                ) : (
                  <>
                    <p className="ui-title">{phase === 'ephemeris' ? 'Tracking the Sun and Earth…' : 'Tracing the hills around the site…'}</p>
                    <Progress value={busy ? progress : undefined} label="Analysis progress" />
                  </>
                )}
              </div>
            )}
            {busy && terrain && evaluation && <span className="ui-space-caption site-updating">Updating…</span>}
          </SpaceWindow>
          <Timeline audience={audience} />
        </div>
        <aside className="site-side" aria-label="Report">
          <Report audience={audience} />
        </aside>
      </div>
    </div>
  )
}
