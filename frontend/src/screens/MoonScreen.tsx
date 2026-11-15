/**
 * The first screens of the flow, on one mounted globe:
 *  - plan ('moon'): decide when to land, and if you like where, in one full-height card;
 *  - results ('explore'): the best sites for that date, in the same card.
 * Keeping both in one component keeps the Cesium viewer alive between them.
 */
import { Minimize2, RotateCcw } from 'lucide-react'
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { provider } from '../api'
import type { DemProduct } from '../api/types'
import { formatLat, formatLon, formatUtcDate, formatUtcLong } from '../domain/format'
import { rank, type AreaFilter, type Ranked, type RankBy } from '../domain/ranking'
import { CUSTOM_SITE_NAME, normalizeLon, validateSite } from '../domain/sites'
import type { GlobeFocus, GlobeMarker, RegionBands } from '../features/MoonGlobe'
import { TopBar } from '../features/TopBar'
import { loadRegionCatalog, loadSiteCatalog } from '../state/runner'
import { goTo, setScenarioInput, setState, useStore, type Audience, type ScenarioInput } from '../state/store'
import { ArrowIcon, Button, Card, DateDial, Field, Input, MonthCalendar, Segmented, Select, SpaceWindow, Toggle } from '../ui'

const MoonGlobe = lazy(() => import('../features/MoonGlobe'))
const EMPTY_PRODUCTS: DemProduct[] = []
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
}

const areaOf = (lat: number): Place['area'] => (lat < -80 ? 'south-pole' : Math.abs(lat) <= 30 ? 'equatorial' : 'other')
const AREA_LABEL: Record<Place['area'], string> = { 'south-pole': 'South pole', equatorial: 'Equator', other: 'Mid-latitude' }

/**
 * With the backend: its site catalog, then the NASA candidate region centres,
 * each with its own id. With practice data: the regions of the ranking first,
 * so names match it exactly, then the example sites it does not already list.
 */
function usePlaces(): Place[] {
  const catalog = useStore((s) => s.regions)
  const sites = useStore((s) => s.sites)
  return useMemo(() => {
    const site = (s: (typeof sites)[number]): Place => ({ id: s.id, name: s.name, short: s.short, area: areaOf(s.latDeg), latDeg: s.latDeg, lonEastDeg: s.lonEastDeg })
    if (API) {
      const centres = (catalog?.locations ?? []).map((r): Place => ({ id: r.id, name: r.name, short: r.name, area: r.area, ...r.center }))
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
  const custom = input.siteName === null

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
  const place = input.siteName?.split(' · ')[0] ?? CUSTOM_SITE_NAME
  const dialLabel = planner ? 'Date and time, UTC' : 'Day'
  const horizon = (
    <Button size="l" block icon={<ArrowIcon />} onClick={onHorizon} className="plan-go">
      {student ? `Fly down to ${place}` : `Open the horizon at ${place}`}
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

const RANK_SHORT: Record<Audience, Record<RankBy, string>> = {
  student: { overall: 'Best', sun: 'Sunniest', earth: 'Radio', both: 'Both' },
  teacher: { overall: 'Overall', sun: 'Sunlight', earth: 'Earth', both: 'Sun + Earth' },
  planner: { overall: 'Overall', sun: 'Sunlight', earth: 'Earth', both: 'Sun + Earth' },
}

function why(r: Ranked, by: RankBy, audience: Audience): string {
  if (audience === 'student') {
    if (by === 'earth') return 'Earth stays in the sky almost all the time, so you can always call home.'
    if (by === 'sun') return 'The Sun shines here more than anywhere else nearby.'
    return 'Lots of sunlight, and Earth is often in the sky to call home.'
  }
  if (by === 'sun') return `Most sunlight in the period: ${pct(r.sunFraction)} of the time, longest night ${r.longestNightH} h.`
  if (by === 'earth') return `Earth above the horizon ${pct(r.earthFraction)} of the time: the most time to talk to Earth.`
  if (by === 'both') return `Sun and Earth in view together ${pct(r.bothFraction)} of the time: power and contact at once.`
  return `Best mix of light and contact: Sun ${pct(r.sunFraction)} of the time, Earth ${pct(r.earthFraction)}, longest night ${r.longestNightH} h.`
}

function nightText(h: number, audience: Audience): string {
  return audience === 'planner' ? `${h} h` : `${Math.max(1, Math.round(h / 24))} d`
}

/**
 * Step 2 with the backend: the NASA candidate regions in catalog order. The
 * engine has no regional calculation yet, so there is no ranking to show.
 */
function CandidateRegionsCard({ onPick, onHorizon }: { onPick: Pick; onHorizon: () => void }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const area = useStore((s) => s.area)
  const catalog = useStore((s) => s.regions)
  const error = useStore((s) => s.regionError)
  const durationDays = useStore((s) => s.durationDays)
  const planner = audience === 'planner'
  const student = audience === 'student'
  const place = input.siteName?.split(' · ')[0] ?? CUSTOM_SITE_NAME
  const regions = (catalog?.locations ?? []).filter((r) => area === 'all' || r.area === area)

  return (
    <Card as="section" className="plan-card results-card" aria-label="Candidate regions">
      <div className="plan-fixed">
        <span>
          {whenText(input.startMs, audience)}
          {planner && <span className="ui-muted"> · {durationDays} days</span>}
        </span>
        <button type="button" className="ui-dial-link" onClick={() => goTo('moon')}>
          Change
        </button>
      </div>
      <div className="results-head">
        <h1 className="plan-title">Candidate regions</h1>
        {!student && <Segmented<AreaFilter> label="Area" size="s" tone="sunk" value={area} onChange={(v) => setState({ area: v })} options={AREA_OPTIONS} />}
      </div>
      <p className="ui-field-hint">NASA 2022 catalog, in catalog order. Centres are for browsing. Open a south-polar site to calculate its PGDA terrain horizon. Illumination and regional comparisons are not available yet.</p>

      {error ? (
        <p role="alert" className="catalog-status plan-body">
          {error}{' '}
          <Button size="s" onClick={() => void loadRegionCatalog()}>
            Retry
          </Button>
        </p>
      ) : !catalog ? (
        <p role="status" className="ui-muted plan-body">
          Loading the regions…
        </p>
      ) : (
        <ol className="results-list" aria-label="Candidate regions">
          {regions.map((r, i) => (
            <li key={r.id}>
              <button type="button" className="results-row is-catalog" aria-pressed={isChosen(input, r)} onClick={() => onPick({ ...r.center, name: r.name, id: r.id })}>
                <span className="results-n">{i + 1}</span>
                <span className="results-name">{r.name}</span>
                <span className="results-value ui-small ui-muted">{r.active ? 'Initial analysis' : 'Catalog'}</span>
              </button>
            </li>
          ))}
          {regions.length === 0 && <li className="site-list-empty">No candidate regions in this area.</li>}
        </ol>
      )}

      <Button size="l" block icon={<ArrowIcon />} onClick={onHorizon} className="plan-go">
        {student ? `Fly down to ${place}` : `Open the horizon at ${place}`}
      </Button>
    </Card>
  )
}

/** Step 2: the best sites for the chosen date, the leader set apart. */
function ResultsCard({ ranked, onPick, onHorizon }: { ranked: Ranked[]; onPick: Pick; onHorizon: () => void }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const rankBy = useStore((s) => s.rankBy)
  const area = useStore((s) => s.area)
  const catalog = useStore((s) => s.regions)
  const durationDays = useStore((s) => s.durationDays)
  const student = audience === 'student'
  const planner = audience === 'planner'
  const shown = ranked.slice(0, TOP_N[audience])
  const top = shown[0]
  const best = top?.value || 1
  const place = input.siteName?.split(' · ')[0] ?? CUSTOM_SITE_NAME
  const valueText = (r: Ranked) => (rankBy === 'overall' ? String(r.score) : pct(r.value))
  const pickRegion = (r: Ranked) => onPick({ ...r.center, name: r.name, id: r.id })

  return (
    <Card as="section" className="plan-card results-card" aria-label="Best sites">
      <div className="plan-fixed">
        <span>
          {whenText(input.startMs, audience)}
          {planner && <span className="ui-muted"> · {durationDays} days</span>}
        </span>
        <button type="button" className="ui-dial-link" onClick={() => goTo('moon')}>
          Change
        </button>
      </div>
      <div className="results-head">
        <h1 className="plan-title">{student ? `Best places on ${formatUtcDate(input.startMs)}` : `Best sites on ${formatUtcDate(input.startMs)}`}</h1>
        {!student && <Segmented<AreaFilter> label="Area" size="s" tone="sunk" value={area} onChange={(v) => setState({ area: v })} options={AREA_OPTIONS} />}
      </div>

      {!catalog ? (
        <p className="ui-muted plan-body">Loading the regions…</p>
      ) : !top ? (
        <p className="ui-muted plan-body">No candidate site in this area yet.</p>
      ) : (
        <>
          <button type="button" className="results-best" aria-pressed={isChosen(input, top)} onClick={() => pickRegion(top)}>
            <span className="results-best-head">
              <span className="results-n is-lead">1</span>
              <span className="results-best-name">{top.name.split(' · ')[0]}</span>
              <span className="results-tag">Recommended</span>
            </span>
            <span className={`results-metrics is-${audience}`}>
              {planner && (
                <span className="results-metric">
                  <small>Score</small>
                  <b>{top.score}</b>
                </span>
              )}
              <span className="results-metric is-sun">
                <small>Sunlight</small>
                <b>{pct(top.sunFraction)}</b>
              </span>
              <span className="results-metric is-earth">
                <small>{student ? 'Earth in the sky' : 'Earth in view'}</small>
                <b>{pct(top.earthFraction)}</b>
              </span>
              {!student && (
                <span className="results-metric">
                  <small>Longest night</small>
                  <b>{nightText(top.longestNightH, audience)}</b>
                </span>
              )}
            </span>
            <span className="results-why">{why(top, rankBy, audience)}</span>
          </button>

          <div className="results-rank">
            <span className="ui-field-label">{catalog.origin === 'demo' ? 'Rank by · practice data' : 'Rank by'}</span>
            <Segmented<RankBy>
              label="Rank by"
              size="s"
              tone="sunk"
              value={rankBy}
              onChange={(v) => setState({ rankBy: v })}
              options={(['overall', 'sun', 'earth', 'both'] as const).map((v) => ({ value: v, label: RANK_SHORT[audience][v] }))}
            />
          </div>

          <ol className="results-list" aria-label="Other sites">
            {shown.slice(1).map((r) => (
              <li key={r.id}>
                <button type="button" className="results-row" aria-pressed={isChosen(input, r)} onClick={() => pickRegion(r)}>
                  <span className="results-n">{r.rank}</span>
                  <span className="results-name">{r.name.split(' · ')[0]}</span>
                  <span className="results-bar" aria-hidden="true">
                    <span style={{ width: `${(r.value / best) * 100}%` }} />
                  </span>
                  {!student && <span className="results-value mono">{valueText(r)}</span>}
                </button>
              </li>
            ))}
          </ol>
        </>
      )}

      <Button size="l" block icon={<ArrowIcon />} onClick={onHorizon} className="plan-go">
        {student ? `Fly down to ${place}` : `Open the horizon at ${place}`}
      </Button>
    </Card>
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
  const rankBy = useStore((s) => s.rankBy)
  const area = useStore((s) => s.area)
  const places = usePlaces()
  const [plan, setPlan] = useState<Plan>('date')
  const [realLight, setRealLight] = useState(true)
  const [showRegions, setShowRegions] = useState(true)
  const [view, setView] = useState<'whole' | 'pole'>('whole')
  const [resetNonce, setResetNonce] = useState(0)
  const [hover, setHover] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const [showCoverage, setShowCoverage] = useState(false)
  const demProducts = useStore((s) => s.coverage?.products) ?? EMPTY_PRODUCTS
  const planner = audience === 'planner'
  const results = mode === 'explore'
  // Numbered badges when the answer is a ranking: the results, and the date view that leads to it.
  const ranking = results || plan === 'date'

  const ranked = useMemo(() => (catalog ? rank(catalog.regions, rankBy, area) : []), [catalog, rankBy, area])

  const markers = useMemo<GlobeMarker[]>(() => {
    // The backend's region catalog has no ranking: its centres, without numbers.
    if (ranking && API) return (catalog?.locations ?? []).map((r) => ({ id: r.id, label: r.name, ...r.center }))
    if (ranking) return ranked.slice(0, TOP_N[audience]).map((r) => ({ id: r.id, label: r.name, rank: r.rank, ...r.center }))
    return places.map((p) => ({ id: p.id, label: p.short, latDeg: p.latDeg, lonEastDeg: p.lonEastDeg }))
  }, [ranking, ranked, audience, places, catalog])

  const selectedId = API
    ? (input.selectionId ?? null)
    : ((ranking ? ranked.find((r) => r.name === input.siteName)?.id : places.find((p) => p.name === input.siteName)?.id) ?? null)

  // The results frame the chosen area, and move closer to a picked site.
  // The camera only slides, it never turns.
  const focus: GlobeFocus | null = results
    ? zoomed
      ? { ...input.site, distanceM: 260_000 }
      : area === 'south-pole'
        ? { latDeg: -87.5, lonEastDeg: 20, distanceM: 760_000 }
        : area === 'equatorial'
          ? { latDeg: 8, lonEastDeg: 15, distanceM: 2_600_000 }
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
    <div className="moon-page">
      <TopBar demo={false} />
      <div className="moon-layout">
        <div className="moon-side">
          {results ? (
            API ? (
              <CandidateRegionsCard onPick={pick} onHorizon={openHorizon} />
            ) : (
              <ResultsCard ranked={ranked} onPick={pick} onHorizon={openHorizon} />
            )
          ) : (
            <PlanCard plan={plan} onPlan={setPlan} onResults={showResults} onHorizon={openHorizon} />
          )}
        </div>
        <div className="moon-stage">
          <SpaceWindow className="moon-window has-credits" aria-label="The Moon">
            <Suspense fallback={<div className="moon-globe-loading">Loading the Moon…</div>}>
              <MoonGlobe
                markers={markers}
                selected={{ ...input.site, label: input.siteName?.split(' · ')[0] ?? customName(input.site.latDeg, input.site.lonEastDeg), id: selectedId }}
                focus={focus}
                lightMs={realLight ? input.startMs : null}
                regions={showRegions ? bands : null}
                resetNonce={resetNonce}
                showCoverage={planner && showCoverage}
                coverageProducts={demProducts}
                onPickMarker={pickMarker}
                onPickPoint={(site) => setScenarioInput('A', { site, siteName: null })}
                onHover={planner ? setHover : undefined}
              />
            </Suspense>

            <div className="moon-window-toggles">
              <Toggle checked={realLight} onChange={setRealLight} onDark>
                Sunlight on this day
              </Toggle>
              <Toggle checked={showRegions} onChange={setShowRegions} onDark>
                Regions
              </Toggle>
              {planner && (
                <Toggle checked={showCoverage} onChange={setShowCoverage} onDark>
                  DEM coverage
                </Toggle>
              )}
            </div>
            {planner && showCoverage && !demProducts.some((p) => p.available) && (
              <span role="status" className="ui-space-caption moon-coverage-note">
                No prepared DEM coverage available
              </span>
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
            <CreditsBar />
          </SpaceWindow>
        </div>
      </div>
    </div>
  )
}
