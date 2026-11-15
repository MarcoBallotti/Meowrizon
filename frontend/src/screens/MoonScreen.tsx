/**
 * The first screens of the flow, on one mounted globe:
 *  - plan ('moon'): decide when to land, and if you like where, in one full-height card;
 *  - results ('explore'): the best sites for that date, in the same card.
 * Keeping both in one component keeps the Cesium viewer alive between them.
 */
import { Info, Minimize2, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { provider } from '../api'
import { formatLat, formatLon, formatUtcDate, formatUtcLong } from '../domain/format'
import { areaOfLatitude, comparisonCandidates } from '../domain/catalogs'
import { assessRegions, rank, rankColor, type AreaFilter, type Ranked } from '../domain/ranking'
import { CUSTOM_SITE_NAME, normalizeLon, validateSite } from '../domain/sites'
import type { GlobeFocus, GlobeMarker, MarkerSymbol, RegionBands, RegionShape } from '../features/MoonGlobe'
import { TopBar } from '../features/TopBar'
import { MissionControls } from '../features/MissionControls'
import { loadRegionCatalog, loadSiteCatalog, runRegionRanking } from '../state/runner'
import { clearPoint, goTo, setScenarioInput, setState, useStore, type Audience, type ScenarioInput } from '../state/store'
import { ArrowIcon, Button, Card, DateDial, Field, Input, MonthCalendar, Segmented, Select, SpaceWindow, Toggle } from '../ui'

const MoonGlobe = lazy(() => import('../features/MoonGlobe'))

/** Above this width the results float over a full-screen sky (screens.css, .is-results). */
const WIDE = '(min-width: 1101px)'
/** Where the Moon sits on the results screen, -1..1 from the centre: left of the panel. */
const RESULTS_SCREEN_X = -0.32

function useWide(): boolean {
  const [wide, setWide] = useState(() => matchMedia(WIDE).matches)
  useEffect(() => {
    const mq = matchMedia(WIDE)
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}
const NO_SHAPES: RegionShape[] = []

/** Rings of [east longitude, latitude] from a GeoJSON Polygon or MultiPolygon. */
function ringsOf(geometry: unknown): [number, number][][] {
  const g = geometry as { type?: string; coordinates?: unknown }
  const polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? (g.coordinates as unknown[]) : []
  return (polygons as number[][][][]).flatMap((polygon) =>
    polygon.map((ring) => ring.map((p) => [p[0], p[1]] as [number, number])).filter((ring) => ring.length >= 3),
  )
}
/** With the backend, catalog entries are told apart by id; the practice data uses names. */
const API = provider.kind === 'api'

const DURATIONS = [7, 14, 30, 60, 90]
const STEPS = [10, 30, 60, 120]
const TOP_N: Record<Audience, number> = { student: 5, teacher: 10, planner: 99 }

/** What the plan card lets you change. */
type Plan = 'date' | 'site' | 'both'

const PLANS: { value: Plan; label: string; hint: string }[] = [
  { value: 'date', label: 'By date', hint: 'Change the day' },
  { value: 'site', label: 'By site', hint: 'Change the place' },
  { value: 'both', label: 'By both', hint: 'Day and place' },
]

const AREA_OPTIONS: { value: AreaFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'south-pole', label: 'South pole' },
  { value: 'equatorial', label: 'Equator' },
  { value: 'other', label: 'Other latitudes' },
]

const pct = (v: number) => `${Math.round(v * 100)}%`
const coords = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(1)}°${lat < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(1)}°${lon < 0 ? 'W' : 'E'}`

function caption(lat: number, audience: Audience): string {
  if (audience === 'teacher') return 'Pick a site and a day, then open the Moon with the class to compare the best places to land.'
  if (lat < -80) return "This is the Moon's south pole. The Sun never climbs high here, so a hill can block it for days."
  if (Math.abs(lat) < 35) return 'Near the equator the Sun climbs high for two weeks, then sets for two weeks.'
  return 'Away from the poles, every place gets about two weeks of day and two weeks of night.'
}

/** Name of a site picked on the Moon: the custom point with its coordinates. */
function customName(latDeg: number, lonEastDeg: number): string {
  return `${CUSTOM_SITE_NAME} · ${formatLat(latDeg, 2)}, ${formatLon(lonEastDeg, 2)}`
}

function selectSite(s: { latDeg: number; lonEastDeg: number; name: string; id?: string }) {
  setScenarioInput('A', { site: { latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }, siteName: s.name, selectionId: s.id ?? null })
}

/** Whether this catalog entry is the chosen site. */
function isChosen(input: ScenarioInput, entry: { id: string; name: string }): boolean {
  return API ? input.selectionId === entry.id : input.siteName === entry.name
}

/** Catalog errors from the backend, with a way to try again; nothing in practice mode. */
function CatalogStatus({ empty }: { empty: boolean }) {
  const siteError = useStore((s) => s.siteError)
  const regionError = useStore((s) => s.regionError)
  if (!API) return null
  const error = siteError || regionError
  if (error)
    return (
      <p role="alert" className="catalog-status">
        {error}{' '}
        <Button
          size="s"
          onClick={() => {
            void loadSiteCatalog()
            void loadRegionCatalog()
          }}
        >
          Retry
        </Button>
      </p>
    )
  return empty ? (
    <p role="status" className="catalog-status ui-muted">
      Loading places…
    </p>
  ) : null
}

/** The day, and for engineers and teachers the time: "15 November 2026, 00:00 UTC". */
function whenText(ms: number, audience: Audience): string {
  const long = formatUtcLong(ms)
  return audience === 'student' ? long.split(',')[0] : long
}

/* ------------------------------------------------------------------ inputs */

function StartDial({ label, minutes, strip }: { label: string; minutes: boolean; strip: boolean }) {
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  return <DateDial label={label} value={startMs} minutes={minutes} strip={strip} onChange={(ms) => setScenarioInput('A', { startMs: ms })} />
}

function PlannerExtras() {
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  const height = useStore((s) => s.scenarios.A.input.observerHeightM)
  return (
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
      <Field label="Eye height" htmlFor="height">
        <Input
          id="height"
          type="number"
          data
          inputSize="s"
          unit="m"
          min={0}
          max={500}
          step={0.5}
          value={height}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v) && v >= 0 && v <= 500) setScenarioInput('A', { observerHeightM: v })
          }}
        />
      </Field>
    </div>
  )
}

/* ------------------------------------------------------------------ places */

interface Place {
  id: string
  name: string
  short: string
  area: Exclude<AreaFilter, 'all'> | 'other'
  latDeg: number
  lonEastDeg: number
  symbol?: MarkerSymbol
}

/** Missions that carried a crew to the surface: every other catalog landing is robotic. */
const CREWED = /^(site:)?apollo-/

/** Crewed landings keep the dot; robotic landers get a triangle, filled once landed, outlined while planned. */
function siteSymbol(s: { id: string; kind?: string }): MarkerSymbol {
  if (CREWED.test(s.id)) return 'site'
  if (s.kind === 'previsto') return 'robotic'
  if (s.kind === 'atterrato') return 'robotic-landed'
  return 'site'
}

const areaOf = areaOfLatitude
const AREA_LABEL: Record<Place['area'], string> = { 'south-pole': 'South pole', equatorial: 'Equator', other: 'Other latitudes' }

/**
 * With the backend: its site catalog, then the NASA candidate region centres,
 * each with its own id. With practice data: the regions of the ranking first,
 * so names match it exactly, then the example sites it does not already list.
 */
function usePlaces(): Place[] {
  const catalog = useStore((s) => s.regions)
  const sites = useStore((s) => s.sites)
  return useMemo(() => {
    const site = (s: (typeof sites)[number]): Place => ({ id: s.id, name: s.name, short: s.short, area: areaOf(s.latDeg), latDeg: s.latDeg, lonEastDeg: s.lonEastDeg, symbol: siteSymbol(s) })
    if (API) {
      const centres = (catalog?.locations ?? []).map((r): Place => ({ id: r.id, name: r.name, short: r.name, area: r.area, ...r.center, symbol: 'artemis' }))
      return [...sites.map(site), ...centres]
    }
    const out: Place[] = (catalog?.regions ?? []).map((r) => ({ id: r.id, name: r.name, short: r.name.split(' · ')[0], area: r.area, ...r.center }))
    for (const s of sites) {
      if (out.some((p) => p.name.toLowerCase() === s.name.toLowerCase())) continue
      out.push(site(s))
    }
    return out
  }, [catalog, sites])
}

/** "-85.5, 30" or "-85.5 30": a latitude and an east longitude typed in the search field. */
function parseCoords(text: string): { latDeg: number; lonEastDeg: number } | null {
  const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const lat = Number(m[1])
  const lon = Number(m[2])
  return validateSite(lat, lon) ? null : { latDeg: lat, lonEastDeg: normalizeLon(lon) }
}

/** The list of places: search by name or by coordinates, and a filter by area. */
function SiteList() {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const places = usePlaces()
  const [query, setQuery] = useState('')
  const [area, setArea] = useState<AreaFilter>('all')
  const planner = audience === 'planner'
  const typed = planner ? parseCoords(query) : null
  const q = query.trim().toLowerCase()
  const shown = typed ? [] : places.filter((p) => (area === 'all' || p.area === area) && (!q || p.name.toLowerCase().includes(q)))
  const pointShown = useStore((s) => s.pointShown)
  // The free point is listed only while it is on the Moon.
  const custom = input.siteName === null && pointShown

  return (
    <div className="site-picker">
      <p className="home-hint">
        <span className="home-hint-dot" aria-hidden="true" />
        {planner ? 'Pick a site or click the globe.' : 'Pick a place or tap the Moon.'}
      </p>
      <div className="site-tools">
        <Input
          id="site-search"
          type="search"
          inputSize="s"
          placeholder={planner ? 'Search, or type lat, lon' : 'Search a place'}
          aria-label={planner ? 'Search a site, or type a latitude and longitude' : 'Search a place'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <Segmented<AreaFilter> label="Area" size="s" tone="sunk" value={area} onChange={setArea} options={AREA_OPTIONS} />
      </div>
      <CatalogStatus empty={places.length === 0} />
      <ul className="site-list" aria-label="Landing sites">
            {typed && (
              <li>
                <button
                  type="button"
                  className="site-row"
                  aria-pressed={custom && input.site.latDeg === typed.latDeg && input.site.lonEastDeg === typed.lonEastDeg}
                  onClick={() => setScenarioInput('A', { site: typed, siteName: null })}
                >
                  <span className="site-row-radio" aria-hidden="true" />
                  <span className="site-row-text">
                    <span className="site-row-name">Use these coordinates</span>
                    <span className="site-row-coords mono">{coords(typed.latDeg, typed.lonEastDeg)}</span>
                  </span>
                  <span className="site-row-area">Custom</span>
                </button>
              </li>
            )}
            {custom && !q && (
              <li>
                <button type="button" className="site-row" aria-pressed="true">
                  <span className="site-row-radio" aria-hidden="true" />
                  <span className="site-row-text">
                    <span className="site-row-name">{CUSTOM_SITE_NAME}</span>
                    <span className="site-row-coords mono">{coords(input.site.latDeg, input.site.lonEastDeg)}</span>
                  </span>
                  <span className="site-row-area">On the globe</span>
                </button>
              </li>
            )}
            {shown.map((p) => (
              <li key={p.id}>
                <button type="button" className="site-row" aria-pressed={isChosen(input, p)} onClick={() => selectSite(p)}>
                  <span className="site-row-radio" aria-hidden="true" />
                  <span className="site-row-text">
                    <span className="site-row-name">{p.name}</span>
                    {audience !== 'student' && <span className="site-row-coords mono">{coords(p.latDeg, p.lonEastDeg)}</span>}
                  </span>
                  <span className="site-row-area">{AREA_LABEL[p.area]}</span>
                </button>
              </li>
            ))}
            {!typed && shown.length === 0 && <li className="site-list-empty">No site matches “{query}”.</li>}
      </ul>
    </div>
  )
}

/* ------------------------------------------------------------------ plan card */

function PlanModes({ value, onChange }: { value: Plan; onChange: (p: Plan) => void }) {
  return (
    <div className="plan-modes" role="group" aria-label="What to change">
      {PLANS.map((p) => (
        <button key={p.value} type="button" aria-pressed={value === p.value} onClick={() => onChange(p.value)}>
          {p.label}
          <small>{p.hint}</small>
        </button>
      ))}
    </div>
  )
}

interface PlanCardProps {
  plan: Plan
  onPlan: (p: Plan) => void
  onResults: () => void
  onHorizon: () => void
}

/** Step 1: when to land first; where, only if you want to choose it yourself. */
function PlanCard({ plan, onPlan, onResults, onHorizon }: PlanCardProps) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const durationDays = useStore((s) => s.durationDays)
  const planner = audience === 'planner'
  const student = audience === 'student'
  const pointShown = useStore((s) => s.pointShown)
  const place = input.siteName?.split(' · ')[0] ?? CUSTOM_SITE_NAME
  const dialLabel = planner ? 'Date and time, UTC' : 'Day'
  const horizon = (
    <Button size="l" block icon={<ArrowIcon />} onClick={onHorizon} className="plan-go" disabled={!pointShown}>
      {!pointShown ? 'Pick a site to open its horizon' : student ? `Fly down to ${place}` : `Open the horizon at ${place}`}
    </Button>
  )

  return (
    <Card as="section" className="plan-card" aria-label="Landing plan">
      <PlanModes value={plan} onChange={onPlan} />

      {plan === 'date' && (
        <>
          <h1 className="plan-title">{student ? 'When shall we land?' : 'When do you want to land?'}</h1>
          <div className="plan-body">
            <StartDial label={dialLabel} minutes={planner} strip={false} />
            <MonthCalendar value={input.startMs} onChange={(ms) => setScenarioInput('A', { startMs: ms })} />
            {planner ? <PlannerExtras /> : <p className="ui-field-hint">Times are UTC. The light on the Moon follows the day you pick.</p>}
          </div>
          <Button size="l" block icon={<ArrowIcon />} onClick={onResults} className="plan-go">
            {API ? 'Candidate regions' : student ? `Best places for ${formatUtcDate(input.startMs)}` : `Best sites for ${formatUtcDate(input.startMs)}`}
          </Button>
        </>
      )}

      {plan === 'site' && (
        <>
          <h1 className="plan-title">{student ? 'Where shall we land?' : 'Where do you want to land?'}</h1>
          <div className="plan-fixed">
            <span>
              {whenText(input.startMs, audience)}
              {planner && <span className="ui-muted"> · {durationDays} days</span>}
            </span>
            <button type="button" className="ui-dial-link" onClick={() => onPlan('date')}>
              Change date
            </button>
          </div>
          <div className="plan-body">
            <SiteList />
            {!planner && <p className="plan-caption">{caption(input.site.latDeg, audience)}</p>}
          </div>
          {horizon}
        </>
      )}

      {plan === 'both' && (
        <>
          <h1 className="plan-title">When and where?</h1>
          <StartDial label={dialLabel} minutes={planner} strip />
          <div className="home-divider" />
          <div className="plan-body">
            <SiteList />
            {!planner && <p className="plan-caption">{caption(input.site.latDeg, audience)}</p>}
          </div>
          {horizon}
        </>
      )}
    </Card>
  )
}

/* ------------------------------------------------------------------ results card */

type Pick = (site: { latDeg: number; lonEastDeg: number; name: string; id?: string }) => void

function why(r: Ranked, audience: Audience): string {
  return r.paretoFront === 1
    ? audience === 'student' ? 'A leading trade-off: another place may be better for one need and worse for another.' : 'Pareto shortlist: no eligible candidate is at least as good on every compared metric and better on one.'
    : `Trade-off group ${r.paretoFront}: another eligible candidate performs at least as well on every compared metric.`
}

function nightText(h: number, audience: Audience): string {
  return audience === 'planner' ? `${h.toFixed(1)} h` : h < 24 ? `${h.toFixed(1)} h` : `${(h / 24).toFixed(1)} d`
}

/** The period of the results, on the left of the sky, with the way back to change it. */
function ResultsWhen() {
  const audience = useStore((s) => s.audience)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const durationDays = useStore((s) => s.durationDays)
  return (
    <div className="results-when plan-fixed">
      <span>
        {whenText(startMs, audience)}
        <span className="ui-muted"> · {durationDays} days</span>
      </span>
      <button type="button" className="ui-dial-link" onClick={() => goTo('moon')}>
        Change
      </button>
    </div>
  )
}

/**
 * Step 2: every candidate site for the chosen period, one card each, from the
 * best to the worst. With the engine the regions are measured one at a time:
 * cards join the list in their place as each result arrives.
 */
function RankedSitesPanel({ ranked, onPick, onHorizon }: { ranked: Ranked[]; onPick: Pick; onHorizon: () => void }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const area = useStore((s) => s.area)
  const catalog = useStore((s) => s.regions)
  const error = useStore((s) => s.regionError)
  const siteError = useStore((s) => s.siteError)
  const sites = useStore((s) => s.sites)
  const sitesLoaded = useStore((s) => s.sitesLoaded)
  const progress = useStore((s) => s.ranking)
  const mission = useStore(s => s.mission)
  const assessments = useMemo(() => assessRegions(API ? progress?.regions ?? [] : catalog?.regions ?? [], area, mission), [progress, catalog, area, mission])
  const notEligible = assessments.filter(r => r.assessment.status !== 'eligible')
  const student = audience === 'student'
  const planner = audience === 'planner'
  const shown = API ? ranked : ranked.slice(0, TOP_N[audience])
  // The horizon opens for a site chosen from the cards: until then the button waits.
  const chosen = shown.find((r) => isChosen(input, r))
  const place = chosen?.name.split(' · ')[0]
  const measuring = API && !!progress?.busy
  const done = progress ? progress.regions.length + progress.failed.length + progress.skipped.length : 0
  const completed = new Set([...(progress?.regions ?? []), ...(progress?.failed ?? []), ...(progress?.skipped ?? [])].map(p => p.id))
  const pending = comparisonCandidates(catalog, sites).filter(p => !completed.has(p.id) && (area === 'all' || p.area === area))

  return (
    <section className="rank-panel" aria-label="Sites from best to worst">
      <Card className="rank-head">
        <div className="results-rank">
          <span className="ui-field-label">{catalog?.origin === 'demo' ? 'Mission trade study · practice data' : 'Mission trade study'}</span>
          <span className="ui-small ui-muted">Requirements first · Pareto groups</span>
        </div>
        <MissionControls />
        <p className="ui-small ui-muted">Sunlight screen: {pct(mission.minSunFraction)} minimum. Only candidates meeting all configured requirements enter the comparison.</p>
        <details className="ui-small ui-muted">
          <summary>How candidates are assessed</summary>
          <p>Failed requirements exclude a candidate. Missing required measurements produce “Insufficient data”. Among the rest, group 1 contains the best trade-offs across visibility, outages and shared windows; enabled terrain and energy criteria also participate. A metric is compared only when all eligible candidates have it. Later groups are dominated by earlier candidates.</p>
          <p>The visibility index orders candidates within each group: a harmonic mean of Sun, Earth and simultaneous visibility, penalized for long outages. It does not override requirements or prove mission suitability. Candidates in one group remain alternative trade-offs.</p>
          <p>This assessment uses one point and one time window. Landing-footprint hazards, trajectory access, science targets, thermal survival and RF link performance need additional models and data. Missing optional metrics never become zero-valued measurements.</p>
          {!API && <p>Practice data supplies only the longest night. Requirements needing other measurements report insufficient data.</p>}
          <p>Method references: <a href="https://www.nasa.gov/reference/6-8-decision-analysis/" target="_blank" rel="noreferrer">NASA decision analysis</a> and <a href="https://ntrs.nasa.gov/citations/20250011660" target="_blank" rel="noreferrer">lunar site selection</a>. This implementation is independent and has not been validated or endorsed by NASA.</p>
        </details>
        {measuring && progress && (
          <p className="rank-progress ui-small" role="status">
            <span className="rank-progress-bar" aria-hidden="true">
              <span style={{ width: `${(done / progress.total) * 100}%` }} />
            </span>
            Measuring {progress.current} · {done} of {progress.total}. {progress.message}
          </p>
        )}
        {API && <p className="ui-small ui-muted">All catalog locations are considered. Region results describe their centre point, not the whole region. Comparisons use geometric visibility only; terrain resolution and model limitations apply.</p>}
        {API && progress && <p role="status" className="ui-small">{ranked.length} meet configured limits · {notEligible.length} excluded or insufficient data · {progress.skipped.length} below sunlight minimum · {progress.failed.length} calculation failures · {progress.total - done} pending</p>}
        {API && (error || siteError) && <p role="alert">Catalog incomplete: {[error, siteError].filter(Boolean).join(' ')} <Button size="s" onClick={() => { void loadRegionCatalog(); void loadSiteCatalog() }}>Reload catalogs</Button></p>}
      </Card>

      {API && ((!catalog && !error) || !sitesLoaded) ? (
        <p role="status" className="ui-muted">Loading catalog points…</p>
      ) : shown.length === 0 && !measuring ? (
        <p className="ui-muted">No evaluated candidates meet all configured requirements in this area. Review the reasons or edit the mission requirements.</p>
      ) : (
        <ol className="rank-list" aria-label="Ranking">
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" className="rank-card" aria-pressed={isChosen(input, r)} onClick={() => onPick({ ...r.center, name: r.name, id: r.id })}>
                <span className="rank-card-head">
                  <span className="rank-badge" style={{ background: rankColor(r.rank, shown.length) }}>
                    {r.rank}
                  </span>
                  <span className="rank-card-name">{r.name.split(' · ')[0]}</span>
                  <span className="rank-card-score mono" title="Pareto trade-off group">
                    Group {r.paretoFront}
                  </span>
                </span>
                <span className={`results-metrics is-${audience}`}>
                  <span className="results-metric is-sun">
                    <small>Sunlight</small>
                    <b>{pct(r.sunFraction)}</b>
                  </span>
                  <span className="results-metric is-earth">
                    <small>{student ? 'Earth in the sky' : 'Earth in view'}</small>
                    <b>{pct(r.earthFraction)}</b>
                  </span>
                  <span className="results-metric">
                    <small>{student ? 'Both together' : 'Sun + Earth'}</small>
                    <b>{pct(r.bothFraction)}</b>
                  </span>
                  {planner && (
                    <span className="results-metric">
                      <small>{API ? 'Longest below C3' : 'Longest night'}</small>
                      <b>{nightText(r.longestNightH, audience)}</b>
                    </span>
                  )}
                </span>
                {API && <span className="ui-small ui-muted">
                  Longest sunlight outage: {nightText(r.longestNightH, audience)} · Longest radio outage: {r.longestNoLinkH === undefined ? 'Unknown' : nightText(r.longestNoLinkH, audience)} · Longest shared window: {r.longestBothH === undefined ? 'Unknown' : nightText(r.longestBothH, audience)}
                </span>}
                {API && <span className="ui-small ui-muted">{r.pointKind === 'region-center' ? 'Region centre · point estimate' : 'Catalog site'}</span>}
                <span className="results-why">{why(r, audience)}</span>
                <span className="ui-small ui-muted">Visibility index: {r.score.toFixed(1)}/100 · Configured requirements met</span>
              </button>
              <details className="mission-checks ui-small">
                <summary>Requirements and evidence</summary>
                <ul>{r.assessment.checks.map(c => <li key={c.id}>{c.label}: {c.value?.toFixed(2) ?? 'Unknown'} {c.unit} · {c.direction === 'min' ? 'minimum' : 'maximum'} {c.limit} {c.unit} · {c.status}</li>)}</ul>
                {r.localTerrain && <p>Local terrain: {r.localTerrain.status === 'ok' ? `${r.localTerrain.slopeDeg?.toFixed(2)}° slope, ${r.localTerrain.roughnessRmsM?.toFixed(2)} m residual RMS` : r.localTerrain.reason}. Support {r.localTerrain.supportDiameterM} m · native pixels {r.localTerrain.sourcePixelSizeM} m · {r.localTerrain.sampleCount} samples.</p>}
                {r.assessment.power && <p>Battery minimum: {r.assessment.power.minBatteryWh.toFixed(1)} Wh · end: {r.assessment.power.endBatteryWh.toFixed(1)} Wh · generated: {r.assessment.power.generatedWh.toFixed(1)} Wh.</p>}
                {r.provenance && <p>Terrain: {r.provenance.productIds.join(', ')}. Ephemerides: {r.provenance.ephemeris}. Evaluation {r.provenance.evaluationId}.</p>}
              </details>
              {API && r.warnings?.length ? <details className="ui-small"><summary>Data resolution and limitations</summary>{r.warnings.map((w, i) => <p key={i}>{w}</p>)}</details> : null}
            </li>
          ))}
          {measuring &&
            progress &&
            pending.map(p => (
              <li key={p.id} className="rank-card is-pending">
                <span className="rank-badge" />
                <span className="ui-muted ui-small">{p.name} · {p.name === progress.current ? 'Measuring…' : 'Pending'}</span>
              </li>
            ))}
        </ol>
      )}

      {notEligible.length > 0 && <details className="mission-rejected ui-small">
        <summary>Excluded or insufficient data ({notEligible.length})</summary>
        <ul>{notEligible.map(({ region, assessment }) => <li key={region.id}>
          <strong>{region.name} · {assessment.status === 'excluded' ? 'Excluded' : 'Insufficient data'}</strong>
          <ul>{assessment.checks.filter(c => c.status !== 'pass').map(c => <li key={c.id}>{c.label}: {c.status === 'unknown' ? c.reason : `${c.value?.toFixed(2)} ${c.unit}; requires ${c.direction === 'min' ? 'at least' : 'at most'} ${c.limit} ${c.unit}`}</li>)}</ul>
        </li>)}</ul>
      </details>}

      {API && progress && progress.skipped.length > 0 && <details className="mission-rejected ui-small">
        <summary>Skipped: below {pct(mission.minSunFraction)} sunlight ({progress.skipped.filter(p => area === 'all' || areaOfLatitude(p.center.latDeg) === area).length})</summary>
        <ul>{progress.skipped.filter(p => area === 'all' || areaOfLatitude(p.center.latDeg) === area).map(p => <li key={p.id}>
          {p.name} · sunlight at most {(Math.ceil(p.sunFractionUpperBound * 10000) / 100).toFixed(2)}% over the selected period
        </li>)}</ul>
      </details>}

      {API && progress && progress.failed.length > 0 && <section aria-label="Not evaluable points">
        <h2>Not evaluable for this period</h2>
        <ul>{progress.failed.filter(p => area === 'all' || areaOfLatitude(p.center.latDeg) === area).map(p => <li key={p.id}>
          <button type="button" className="ui-dial-link" onClick={() => onPick({ ...p.center, name: p.name, id: p.id })}>{p.name}</button>
          <p>{p.reason}</p>
        </li>)}</ul>
        {!progress.busy && <Button size="s" onClick={() => void runRegionRanking(true)}>Retry comparison</Button>}
      </section>}

      <Button size="l" block icon={<ArrowIcon />} onClick={onHorizon} className="rank-go" disabled={!chosen}>
        {!place ? 'Select a site to open its horizon' : student ? `Fly down to ${place}` : `Open the horizon at ${place}`}
      </Button>
    </section>
  )
}

/* ------------------------------------------------------------------ credits */

const CREDITS = 'LRO WAC mosaic: NASA/GSFC/Arizona State University. LOLA hillshade: NASA/GSFC, via NASA Moon Trek. Independent tool, not endorsed by NASA.'
const CREDITS_MAX_PX = 13
const CREDITS_MIN_PX = 10
const CREDITS_WRAPPED_PX = 12

/**
 * The band that closes the Moon box: one line, the font steps down until it
 * fits. On narrow screens, where even the smallest size does not fit, the text
 * wraps and the band grows; the box reads its height from --credits-h.
 */
function CreditsBar() {
  const ref = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const fit = () => {
      el.classList.remove('is-wrapped')
      box.style.removeProperty('--credits-h')
      let size = CREDITS_MAX_PX
      el.style.fontSize = `${size}px`
      while (el.scrollWidth > el.clientWidth && size > CREDITS_MIN_PX) {
        size -= 0.5
        el.style.fontSize = `${size}px`
      }
      if (el.scrollWidth > el.clientWidth) {
        // Wrapping anyway: go back to a size that reads comfortably.
        el.classList.add('is-wrapped')
        el.style.fontSize = `${CREDITS_WRAPPED_PX}px`
        box.style.setProperty('--credits-h', `${el.offsetHeight}px`)
      }
    }
    fit()
    // Watch the Moon box, whose width the band follows; the band's own changes never resize it.
    const ro = new ResizeObserver(fit)
    ro.observe(box)
    document.fonts?.ready.then(fit)
    return () => ro.disconnect()
  }, [])
  return (
    <p ref={ref} className="moon-credits">
      {CREDITS}
    </p>
  )
}

/* ------------------------------------------------------------------ screen */

export function MoonScreen({ mode }: { mode: 'moon' | 'explore' }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const catalog = useStore((s) => s.regions)
  const sites = useStore((s) => s.sites)
  const sitesLoaded = useStore((s) => s.sitesLoaded)
  const regionError = useStore((s) => s.regionError)
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  const azimuthStepDeg = useStore((s) => s.azimuthStepDeg)
  const maxDistanceKm = useStore((s) => s.maxDistanceKm)
  const area = useStore((s) => s.area)
  const places = usePlaces()
  const mission = useStore(s => s.mission)
  const minSunFraction = mission.minSunFraction
  const [plan, setPlan] = useState<Plan>('date')
  const [realLight, setRealLight] = useState(true)
  const [showRegions, setShowRegions] = useState(true)
  const [view, setView] = useState<'whole' | 'pole'>('whole')
  const [resetNonce, setResetNonce] = useState(0)
  const [hover, setHover] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const planner = audience === 'planner'
  const results = mode === 'explore'
  const pointShown = useStore((s) => s.pointShown)
  const wide = useWide()
  // Numbered badges only where the answer is a ranking: the results.
  const ranking = results
  // "By date" changes the day only: the sites stay on the Moon, greyed out.
  const selectable = results || plan !== 'date'

  // With the engine the regions are measured for the chosen period; practice data carries its own numbers.
  const measured = useStore((s) => s.ranking)
  const ranked = useMemo(
    () => (API ? rank(measured?.regions ?? [], area, mission) : catalog ? rank(catalog.regions, area, mission) : []),
    [catalog, measured, area, mission],
  )
  useEffect(() => {
    if (results && (catalog || regionError) && sitesLoaded) void runRegionRanking()
  }, [results, catalog, regionError, sites, sitesLoaded, input.startMs, input.observerHeightM, durationDays, stepMinutes, azimuthStepDeg, maxDistanceKm, minSunFraction])

  const markers = useMemo<GlobeMarker[]>(() => {
    // Results: a numbered badge per site, coloured by its place from best (green) to worst (red).
    // Regions still being measured keep their plain square until their number arrives.
    if (ranking) {
      const top = API ? ranked : ranked.slice(0, TOP_N[audience])
      const badges: GlobeMarker[] = top.map((r) => ({ id: r.id, label: r.name.split(' · ')[0], rank: r.rank, color: rankColor(r.rank, top.length), ...r.center }))
      const waiting = API ? comparisonCandidates(catalog, sites).filter(l => (area === 'all' || l.area === area) && !measured?.regions.some(r => r.id === l.id) && !measured?.failed.some(r => r.id === l.id) && !measured?.skipped.some(r => r.id === l.id)) : []
      return [...badges, ...waiting.map((l) => ({ id: l.id, label: l.name, ...l.center, symbol: l.pointKind === 'region-center' ? 'artemis' as const : 'site' as const }))]
    }
    return places.map((p) => ({ id: p.id, label: p.short, latDeg: p.latDeg, lonEastDeg: p.lonEastDeg, symbol: p.symbol }))
  }, [ranking, ranked, audience, places, catalog, sites, area, measured])

  const selectedId = API
    ? (input.selectionId ?? null)
    : ((ranking ? ranked.find((r) => r.name === input.siteName)?.id : places.find((p) => p.name === input.siteName)?.id) ?? null)

  // The results frame the chosen area, and move closer to a picked site.
  // The camera only slides, it never turns.
  // On wide screens the results panel floats over the right of the sky: the
  // target sits in the middle of the free part on the left.
  const offset: [number, number] | undefined = results && wide ? [RESULTS_SCREEN_X, 0] : undefined
  const focus: GlobeFocus | null = results
    ? zoomed
      ? { ...input.site, distanceM: 260_000, screen: offset }
      : area === 'south-pole' || API // the engine's candidate regions are all at the south pole
        ? { latDeg: -87.5, lonEastDeg: 20, distanceM: 760_000, screen: offset }
        : area === 'equatorial'
          ? { latDeg: 8, lonEastDeg: 15, distanceM: 2_600_000, screen: offset }
          : offset
            ? { latDeg: -48, lonEastDeg: 15, distanceM: 4_000_000, screen: offset }
            : null
    : view === 'pole'
      ? { latDeg: -87.5, lonEastDeg: 20, distanceM: 760_000 }
      : null

  // The two catalogue areas, bounded by the parallels that contain their regions.
  const bands = useMemo<RegionBands | null>(() => {
    if (!catalog) return null
    const entries = catalog.regions.length ? catalog.regions : (catalog.locations ?? [])
    const lats = (a: 'south-pole' | 'equatorial') => entries.filter((r) => r.area === a).map((r) => Math.abs(r.center.latDeg))
    const south = lats('south-pole')
    const equator = lats('equatorial')
    return {
      southPoleLat: south.length ? -Math.floor(Math.min(...south) / 5) * 5 : null,
      equatorialLat: equator.length ? Math.ceil(Math.max(...equator) / 5) * 5 : null,
    }
  }, [catalog])

  // The Artemis III candidate regions as the backend serves them: each one a
  // separate square at its real size, as on NASA's maps. They are never merged
  // into one area: the ground between them (deep, shadowed craters) is not a candidate.
  const shapes = useMemo<RegionShape[]>(() => {
    const regions = (catalog?.locations ?? []).map((r) => ({ id: r.id, rings: ringsOf(r.geometry), filled: true })).filter((r) => r.rings.length > 0)
    return regions.length ? regions : NO_SHAPES
  }, [catalog])
  const symbolsShown = new Set(markers.map((m) => m.symbol ?? 'site'))
  const [legendOpen, setLegendOpen] = useState(false)

  const resetView = () => {
    setView('whole')
    setResetNonce((n) => n + 1)
  }

  const openHorizon = () => {
    setState({ cursorOffsetMs: 0 })
    goTo('site')
  }

  // The answer opens on its leader, so "Open the horizon" goes to the best site.
  const showResults = () => {
    const top = ranked[0]
    if (top) selectSite({ ...top.center, name: top.name, id: top.id })
    // The results start with nothing chosen: a free point picked before does not carry over.
    else if (!input.siteName) clearPoint()
    setZoomed(false)
    goTo('explore')
  }

  const pick: Pick = (site) => {
    selectSite(site)
    if (results) setZoomed(true)
  }
  if (!results && zoomed) setZoomed(false)

  const pickMarker = (id: string) => {
    const r = (catalog?.locations ?? catalog?.regions ?? []).find((x) => x.id === id)
    if (r) return pick({ ...r.center, name: r.name, id: r.id })
    const p = places.find((x) => x.id === id)
    if (p) pick(p)
  }

  return (
    <div className={results ? 'moon-page is-results' : 'moon-page'}>
      {/* The results are the sky at full screen: no top bar. */}
      {!results && <TopBar demo={false} />}
      <div className="moon-layout">
        <div className="moon-side">
          {results ? (
            <RankedSitesPanel ranked={ranked} onPick={pick} onHorizon={openHorizon} />
          ) : (
            <PlanCard plan={plan} onPlan={setPlan} onResults={showResults} onHorizon={openHorizon} />
          )}
        </div>
        <div className="moon-stage">
          <SpaceWindow className={results ? 'moon-window' : 'moon-window has-credits'} aria-label="The Moon">
            <Suspense fallback={<div className="moon-globe-loading">Loading the Moon…</div>}>
              <MoonGlobe
                markers={markers}
                selected={{ ...input.site, label: input.siteName?.split(' · ')[0] ?? customName(input.site.latDeg, input.site.lonEastDeg), id: selectedId, shown: pointShown }}
                onClearSelection={clearPoint}
                focus={focus}
                lightMs={realLight ? input.startMs : null}
                regions={showRegions ? bands : null}
                resetNonce={resetNonce}
                regionShapes={showRegions ? shapes : NO_SHAPES}
                selectable={selectable}
                onPickMarker={pickMarker}
                onPickPoint={(site) => setScenarioInput('A', { site, siteName: null })}
                onHover={planner ? setHover : undefined}
              />
            </Suspense>

            {results && <ResultsWhen />}

            {/* The results show only the Moon and the ranking: no switches, key or credits band. */}
            {!results && <div className="moon-window-toggles">
              <Toggle checked={realLight} onChange={setRealLight} onDark>
                Sunlight on this day
              </Toggle>
              <Toggle checked={showRegions} onChange={setShowRegions} onDark>
                Regions
              </Toggle>
              <button
                type="button"
                className="moon-info"
                aria-label="Map key"
                aria-expanded={legendOpen}
                aria-controls="moon-legend"
                onClick={() => setLegendOpen((o) => !o)}
              >
                <Info size={20} strokeWidth={1.75} aria-hidden="true" />
              </button>
            </div>}
            {!results && legendOpen && (
              <ul id="moon-legend" className="moon-legend ui-small" aria-label="Map key">
                {shapes.length > 0 && (
                  <li>
                    <span className="moon-legend-mark is-artemis" aria-hidden="true" />
                    Published region outlines · NASA / Moon Trek ({shapes.length} in catalog)
                  </li>
                )}
                {symbolsShown.has('site') && (
                  <li>
                    <span className="moon-legend-mark is-site" aria-hidden="true" />
                    Crewed landing (Apollo) or chosen site
                  </li>
                )}
                {symbolsShown.has('robotic-landed') && (
                  <li>
                    <svg className="moon-legend-mark" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 L11 10.5 H1 Z" fill="#f2b45a" stroke="#f2b45a" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                    Robotic lander, landed
                  </li>
                )}
                {symbolsShown.has('robotic') && (
                  <li>
                    <svg className="moon-legend-mark" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 L11 10.5 H1 Z" fill="none" stroke="#f2b45a" strokeWidth="1.6" strokeLinejoin="round" /></svg>
                    Robotic lander, planned (CLPS) · not a crewed site
                  </li>
                )}
              </ul>
            )}

            {results ? (
              zoomed && (
                <Button variant="quiet" pill size="s" icon={<Minimize2 size={20} strokeWidth={1.75} aria-hidden="true" />} className="moon-view" onClick={() => setZoomed(false)}>
                  All sites
                </Button>
              )
            ) : (
              <div className="moon-view">
                <Segmented
                  label="Part of the Moon in view"
                  size="s"
                  tone="on-dark"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'whole', label: 'Whole Moon' },
                    { value: 'pole', label: 'South pole' },
                  ]}
                />
              </div>
            )}
            <Button variant="quiet" pill size="s" icon={<RotateCcw size={20} strokeWidth={1.75} aria-hidden="true" />} className="moon-reset" onClick={resetView}>
              Reset view
            </Button>
            {planner && hover && <span className="ui-space-caption moon-hover mono">{hover}</span>}
            {!results && <CreditsBar />}
          </SpaceWindow>
        </div>
      </div>
    </div>
  )
}
