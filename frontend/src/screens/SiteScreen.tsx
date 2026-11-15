/**
 * Step 4: the view from the site, then the evidence grouped by question.
 * One 12-column grid; cards in a row share their height. Every card builds
 * itself with tiles while its data is computed.
 */
import { Columns2, Maximize2, Minimize2, Orbit, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatLat, formatLon, formatUtcLong } from '../domain/format'
import { CUSTOM_SITE_NAME } from '../domain/sites'
import { PublicAssessment } from '../features/PublicAssessment'
import { Scorecard } from '../features/Scorecard'
import { CompareCard, DayHourCard, EventsCard, LightCalendarCard, WindowsCard } from '../features/DeepDive'
import { openComparePicker } from '../features/compareSlots'
import { EclipseStrip, NextEclipseCard } from '../features/EclipseCards'
import { HorizonScene } from '../features/HorizonScene'
import { OrbitView } from '../features/OrbitView'
import { DataPanel, MonthPanel, NowPanel, PeriodPanel, PromptsPanel } from '../features/Report'
import { Timeline } from '../features/Timeline'
import { TopBar } from '../features/TopBar'
import { runScenario } from '../state/runner'
import { goTo, useStore, type Audience, type RunPhase } from '../state/store'
import { BackLink, Building, Button, Notice, SpaceWindow } from '../ui'

const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const

/** One progress value across both steps of the calculation. */
function overall(phase: RunPhase, progress = 0): number {
  if (phase === 'terrain') return progress * 0.6
  if (phase === 'ephemeris') return 0.6 + progress * 0.4
  return 1
}

function phaseText(phase: RunPhase): string {
  return phase === 'ephemeris' ? 'Tracking the Sun and Earth…' : 'Tracing the hills around the site…'
}

type Span = 3 | 4 | 6 | 8 | 12

interface Cell {
  key: string
  span: Span
  node: ReactNode
  /** Height to hold while the card waits for its data. */
  rest?: number
}

interface Section {
  key: string
  title: string
  cells: Cell[]
}

/** Which cards each reader gets, grouped by the question they answer. */
function sectionsFor(audience: Audience): Section[] {
  if (audience === 'public') {
    return [{ key: 'why', title: 'Right now and over the month', cells: [
      { key: 'result', span: 4, node: <Scorecard /> },
      { key: 'calendar', span: 4, node: <LightCalendarCard audience="public" /> },
      { key: 'characteristics', span: 4, node: <MonthPanel /> },
    ] }]
  }

  if (audience === 'educator') {
    return [
      { key: 'explain', title: 'Why is this site more or less favorable?', cells: [
        { key: 'assessment', span: 12, node: <PublicAssessment /> },
        { key: 'comparison', span: 12, node: <CompareCard audience="educator" />, rest: 480 },
        { key: 'numbers', span: 6, node: <MonthPanel /> },
        { key: 'prompts', span: 6, node: <PromptsPanel /> },
      ] },
      { key: 'demonstrate', title: 'Demonstrate how conditions change', cells: [
        { key: 'calendar', span: 12, node: <LightCalendarCard audience="educator" /> },
        { key: 'windows', span: 12, node: <WindowsCard audience="educator" /> },
        { key: 'eclipses', span: 12, node: <EclipseStrip audience="educator" /> },
      ] },
    ]
  }

  return [
    {
      key: 'choose',
      title: 'Decision',
      cells: [
        // The comparison first; the period table after it, across the whole row.
        { key: 'cmp', span: 12, node: <CompareCard audience="planner" />, rest: 480 },
        { key: 'period', span: 12, node: <PeriodPanel />, rest: 480 },
        { key: 'win', span: 12, node: <WindowsCard audience="planner" />, rest: 240 },
      ],
    },
    { key: 'time', title: 'Light and link, hour by hour', cells: [{ key: 'heat', span: 12, node: <DayHourCard />, rest: 280 }] },
    {
      key: 'eclipse',
      title: 'Eclipses',
      cells: [
        { key: 'next', span: 4, node: <NextEclipseCard audience="planner" />, rest: 320 },
        { key: 'strip', span: 8, node: <EclipseStrip audience="planner" />, rest: 320 },
      ],
    },
    {
      key: 'data',
      title: 'Events and data',
      cells: [
        { key: 'events', span: 6, node: <EventsCard />, rest: 320 },
        { key: 'data', span: 6, node: <DataPanel />, rest: 320 },
      ],
    },
  ]
}

export function SiteScreen() {
  const audience = useStore((s) => s.audience)
  const A = useStore((s) => s.scenarios.A)
  const offset = useStore((s) => s.cursorOffsetMs)
  const { terrain, evaluation, phase, progress, error } = A.run
  const busy = phase === 'idle' || phase === 'terrain' || phase === 'ephemeris'
  const waiting = busy
  const p = overall(phase, progress)
  const name = A.input.siteName ?? CUSTOM_SITE_NAME
  const [orbitsOpen, setOrbitsOpen] = useState(false)
  const [full, setFull] = useState(false)
  const horizon = useRef<HTMLDivElement>(null)
  const cursorMs = A.input.startMs + offset

  // Full screen for the horizon: the browser API where available, otherwise a fixed layer.
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === horizon.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFull = async () => {
    const el = horizon.current
    if (!el) return
    if (document.fullscreenElement) return void (await document.exitFullscreen().catch(() => setFull(false)))
    if (full) return setFull(false)
    try {
      await el.requestFullscreen()
    } catch {
      setFull(true)
    }
  }

  return (
    <div className="site-page">
      <TopBar
        start={
          <div className="site-title">
            <BackLink
              label={audience === 'public' ? 'Pick another spot' : audience === 'educator' ? 'Back to the comparison' : 'Back to the shortlist'}
              onClick={() => goTo(audience === 'educator' ? 'compare' : 'moon')}
            />
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
      >
        <Button variant="secondary" size="s" icon={<Columns2 size={18} strokeWidth={1.75} aria-hidden="true" />} onClick={openComparePicker}>
          Compare
        </Button>
      </TopBar>

      <div className="site-grid">
        <div ref={horizon} className={`site-horizon span-8${full ? ' is-full' : ''}${orbitsOpen ? ' has-orbits' : ''}`}>
          <SpaceWindow className="site-window" aria-label="View from the site">
            {phase === 'error' && !evaluation ? (
              <div className="site-loading"><Notice tone="danger"><strong>We could not calculate this scenario.</strong> {error}{' '}<Button size="s" variant="inverse" onClick={() => void runScenario('A')}>Try again</Button></Notice></div>
            ) : (
              <Building busy={busy || !evaluation} progress={p} phase={A.run.message ?? phaseText(phase)} tone="dark" className="site-building">
                {terrain && evaluation && <HorizonScene profile={terrain.profile} evaluation={evaluation} cursorMs={cursorMs} audience={audience} />}
              </Building>
            )}
            {!orbitsOpen && evaluation && (
              <button type="button" className="orbit-mini" onClick={() => setOrbitsOpen(true)} aria-label="Open the view of the Sun, Earth and Moon from outside">
                <OrbitView cursorMs={cursorMs} audience={audience} compact />
                <span className="orbit-mini-label">
                  <Orbit size={16} strokeWidth={1.75} aria-hidden="true" />
                  Orbits
                  <Maximize2 size={16} strokeWidth={1.75} aria-hidden="true" />
                </span>
              </button>
            )}
            <button type="button" className="site-full" onClick={() => void toggleFull()} aria-label={full ? 'Leave full screen' : 'Full screen'} title={full ? 'Leave full screen' : 'Full screen'}>
              {full ? <Minimize2 {...ICON} /> : <Maximize2 {...ICON} />}
            </button>
          </SpaceWindow>
          {orbitsOpen && (
            <SpaceWindow className="site-orbits" aria-label="Sun, Earth and Moon from outside">
              <OrbitView cursorMs={cursorMs} audience={audience} />
              <button type="button" className="site-full" onClick={() => setOrbitsOpen(false)} aria-label="Close the orbit view" title="Close">
                <X {...ICON} />
              </button>
            </SpaceWindow>
          )}
        </div>

        <aside className="site-now span-4" aria-label="Right now">
          <Building busy={waiting} progress={p} phase={!evaluation ? phaseText(phase) : undefined} minHeight={440} className="fill">
            {evaluation && <NowPanel audience={audience} />}
          </Building>
        </aside>

        <div className="span-12">
          <Building busy={busy} progress={p}>
            <Timeline audience={audience} />
          </Building>
        </div>
      </div>

      {sectionsFor(audience).map((section) => (
        <section key={section.key} className="site-section" aria-labelledby={`sec-${section.key}`}>
          <h2 className="ui-title is-m" id={`sec-${section.key}`}>
            {section.title}
          </h2>
          <div className="site-grid">
            {section.cells.map((c) => (
              <div key={c.key} className={`span-${c.span}`}>
                <Building busy={waiting} progress={p} minHeight={c.rest} className="fill">
                  {evaluation && c.node}
                </Building>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
