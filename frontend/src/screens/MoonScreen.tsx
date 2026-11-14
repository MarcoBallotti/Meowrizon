import { lazy, Suspense, useState, type FormEvent } from 'react'
import { formatLat, formatLon, fromUtcInput, toUtcInput } from '../domain/format'
import { CUSTOM_SITE_NAME, EXAMPLE_SITES, normalizeLon, validateSite } from '../domain/sites'
import { globeHandle } from '../features/globeHandle'
import { TopBar } from '../features/TopBar'
import { goTo, setScenarioInput, setState, useStore, type Audience } from '../state/store'
import { ArrowIcon, Button, Card, Field, Input, Segmented, Select, SiteTile, SpaceWindow, StepBadge, Toggle } from '../ui'

const MoonGlobe = lazy(() => import('../features/MoonGlobe'))

const DURATIONS = [7, 14, 30, 60, 90]
const STEPS = [10, 30, 60, 120]

const COPY: Record<Audience, { title: string; lead?: string; place: string; day: string; go: string }> = {
  student: { title: 'Where shall we land?', place: 'Pick a place', day: 'Pick a day', go: 'Fly down to the surface' },
  teacher: {
    title: 'Where shall we land?',
    lead: 'Pick a site and a day, then fly down with the class to see the Sun and Earth from the ground.',
    place: 'Pick a place',
    day: 'Pick a day',
    go: 'Fly down to the surface',
  },
  planner: { title: 'Site and epoch', place: 'Site', day: 'Epoch and period', go: 'Analyse site' },
}

function caption(lat: number): string {
  if (lat < -80) return "This is the Moon's south pole. The Sun never climbs high here, so a hill can block it for days."
  if (Math.abs(lat) < 35) return 'Near the equator the Sun climbs high for two weeks, then sets for two weeks.'
  return 'Away from the poles, every place gets about two weeks of day and two weeks of night.'
}

function CoordinateEditor() {
  const site = useStore((s) => s.scenarios.A.input.site)
  const [lat, setLat] = useState(() => String(site.latDeg))
  const [lon, setLon] = useState(() => String(site.lonEastDeg))
  const [error, setError] = useState<string | null>(null)
  const commit = (e?: FormEvent) => {
    e?.preventDefault()
    const la = Number(lat.replace(',', '.'))
    const lo = Number(lon.replace(',', '.'))
    const problem = validateSite(la, lo)
    setError(problem)
    if (problem) return
    setScenarioInput('A', { site: { latDeg: la, lonEastDeg: normalizeLon(lo) }, siteName: null })
  }
  return (
    <form className="moon-coords" onSubmit={commit}>
      <Field label="Latitude °" htmlFor="lat" error={error}>
        <Input id="lat" inputMode="decimal" data inputSize="s" value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => commit()} />
      </Field>
      <Field label="Longitude east °" htmlFor="lon">
        <Input id="lon" inputMode="decimal" data inputSize="s" value={lon} onChange={(e) => setLon(e.target.value)} onBlur={() => commit()} />
      </Field>
      <button type="submit" hidden />
    </form>
  )
}

export function MoonScreen() {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  const [mode, setMode] = useState<'list' | 'coords'>('list')
  const [realLight, setRealLight] = useState(true)
  const [coverage, setCoverage] = useState(false)
  const [hover, setHover] = useState('')
  const [descending, setDescending] = useState(false)
  const copy = COPY[audience]
  const planner = audience === 'planner'

  const descend = async () => {
    if (descending) return
    setDescending(true)
    setState({ cursorOffsetMs: 0 })
    await globeHandle.flyDown?.(input.site.latDeg, input.site.lonEastDeg)
    goTo('site')
  }

  const southPole = EXAMPLE_SITES.filter((s) => s.region === 'South pole')
  const others = EXAMPLE_SITES.filter((s) => s.region !== 'South pole')

  return (
    <div className={`moon-page${descending ? ' is-descending' : ''}`}>
      <TopBar />
      <div className="moon-layout">
      <div className="moon-side">
        <div className="moon-intro">
          <h1 className={`ui-display${planner ? ' is-s' : ''}`}>{copy.title}</h1>
          {copy.lead && <p className="moon-lead">{copy.lead}</p>}
        </div>

        <Card as="section" aria-label={copy.place}>
          <div className="ui-card-head">
            <StepBadge n={1} />
            <h2 className="ui-title">{copy.place}</h2>
            {planner && (
              <span className="moon-card-tool">
                <Segmented
                  label="How to choose the site"
                  size="s"
                  tone="sunk"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: 'list', label: 'Site list' },
                    { value: 'coords', label: 'Coordinates' },
                  ]}
                />
              </span>
            )}
          </div>
          {planner && mode === 'coords' ? (
            <CoordinateEditor key={`${input.site.latDeg},${input.site.lonEastDeg}`} />
          ) : (
            <>
              {planner && <span className="ui-eyebrow">South pole</span>}
              <div className="ui-site-grid">
                {(planner ? southPole : EXAMPLE_SITES.filter((s) => s.id !== 'sp-ref' && s.id !== 'apollo15')).map((s) => (
                  <SiteTile
                    key={s.id}
                    name={planner ? s.name : s.name.split(' · ')[0]}
                    meta={planner ? `${formatLat(s.latDeg, 2)} ${formatLon(s.lonEastDeg, 2)}` : undefined}
                    selected={input.siteName === s.name}
                    onSelect={() => setScenarioInput('A', { site: { latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }, siteName: s.name })}
                  />
                ))}
              </div>
              {planner && (
                <>
                  <span className="ui-eyebrow">Equatorial band</span>
                  <div className="ui-site-grid">
                    {others.map((s) => (
                      <SiteTile
                        key={s.id}
                        name={s.name}
                        meta={`${formatLat(s.latDeg, 2)} ${formatLon(s.lonEastDeg, 2)}`}
                        selected={input.siteName === s.name}
                        onSelect={() => setScenarioInput('A', { site: { latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }, siteName: s.name })}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          <p className="ui-field-hint">
            {input.siteName === null
              ? `${CUSTOM_SITE_NAME}: ${formatLat(input.site.latDeg, 2)}, ${formatLon(input.site.lonEastDeg, 2)}.`
              : planner
                ? 'Or click anywhere on the globe.'
                : 'Or tap any point on the Moon.'}
          </p>
        </Card>

        <Card as="section" aria-label={copy.day}>
          <div className="ui-card-head">
            <StepBadge n={2} />
            <h2 className="ui-title">
              <label htmlFor="start">{copy.day}</label>
            </h2>
          </div>
          <Input
            id="start"
            type="datetime-local"
            data={planner}
            inputSize={planner ? 's' : 'm'}
            value={toUtcInput(input.startMs)}
            onChange={(e) => {
              const ms = fromUtcInput(e.target.value)
              if (Number.isFinite(ms)) setScenarioInput('A', { startMs: ms })
            }}
          />
          {planner ? (
            <div className="moon-period">
              <Field label="Duration" htmlFor="duration">
                <Select id="duration" inputSize="s" value={durationDays} onChange={(e) => setState({ durationDays: Number(e.target.value), cursorOffsetMs: 0 })}>
                  {DURATIONS.map((d) => (
                    <option key={d} value={d}>
                      {d} days
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Step" htmlFor="step">
                <Select id="step" inputSize="s" value={stepMinutes} onChange={(e) => setState({ stepMinutes: Number(e.target.value) })}>
                  {STEPS.map((m) => (
                    <option key={m} value={m}>
                      {m < 60 ? `${m} min` : `${m / 60} h`}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Observer height" htmlFor="height">
                <Input
                  id="height"
                  type="number"
                  data
                  inputSize="s"
                  unit="m"
                  min={0}
                  max={500}
                  step={0.5}
                  value={input.observerHeightM}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    if (Number.isFinite(v) && v >= 0 && v <= 500) setScenarioInput('A', { observerHeightM: v })
                  }}
                />
              </Field>
            </div>
          ) : (
            <p className="ui-field-hint">Time is UTC, the clock mission teams share. We follow the next {durationDays} days.</p>
          )}
        </Card>

        <Button size="l" step={3} block onClick={() => void descend()} disabled={descending} icon={planner ? <ArrowIcon /> : undefined}>
          {descending ? 'Flying down…' : copy.go}
        </Button>

        <p className="moon-foot ui-small ui-muted">
          LRO imagery and LOLA relief via NASA Moon Trek. Independent tool, not endorsed by NASA. <a href="#/kit">Brand kit</a>
        </p>
      </div>

      <div className="moon-stage">
        <SpaceWindow className="moon-window" aria-label="The Moon">
          <Suspense fallback={<div className="moon-globe-loading">Loading the Moon…</div>}>
            <MoonGlobe realLight={realLight} showCoverage={planner && coverage} onHover={planner ? setHover : undefined} />
          </Suspense>
          <div className="moon-window-toggles">
            <Toggle checked={realLight} onChange={setRealLight} onDark>
              Sunlight on this day
            </Toggle>
            {planner && (
              <Toggle checked={coverage} onChange={setCoverage} onDark>
                DEM coverage
              </Toggle>
            )}
          </div>
          {planner && hover && <span className="ui-space-caption moon-hover mono">{hover}</span>}
        </SpaceWindow>
        {!planner && <p className="moon-caption">{caption(input.site.latDeg)}</p>}
      </div>
      </div>
    </div>
  )
}
