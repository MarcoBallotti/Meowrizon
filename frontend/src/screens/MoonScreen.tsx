/**
 * Steps 1–3 of the flow, on one mounted globe:
 *  - home ('moon'): one compact card to pick a place and a day, Moon on the right;
 *  - explore: the Moon full screen, a box with the same inputs, and the ranking.
 * Keeping both in one component keeps the Cesium viewer alive between them.
 */
import { Minimize2, Trophy } from 'lucide-react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { formatLat, formatLon, previousMonthName } from '../domain/format'
import { rank, RANK_LABELS, type AreaFilter, type Ranked, type RankBy } from '../domain/ranking'
import { CUSTOM_SITE_NAME, EXAMPLE_SITES, normalizeLon, validateSite } from '../domain/sites'
import type { GlobeFocus, GlobeMarker } from '../features/MoonGlobe'
import { AudienceSwitch, DemoChip, TopBar } from '../features/TopBar'
import { goTo, setScenarioInput, setState, useStore, type Audience } from '../state/store'
import { ArrowIcon, BackIcon, Button, Card, DateDial, Delta, Field, Input, Logo, Segmented, Select, SiteTile, SpaceWindow, Toggle } from '../ui'

const MoonGlobe = lazy(() => import('../features/MoonGlobe'))

const DURATIONS = [7, 14, 30, 60, 90]
const STEPS = [10, 30, 60, 120]
const TOP_N: Record<Audience, number> = { student: 5, teacher: 10, planner: 99 }

function caption(lat: number, audience: Audience): string {
  if (audience === 'teacher') return 'Pick a site and a day, then open the Moon with the class to compare the best places to land.'
  if (lat < -80) return "This is the Moon's south pole. The Sun never climbs high here, so a hill can block it for days."
  if (Math.abs(lat) < 35) return 'Near the equator the Sun climbs high for two weeks, then sets for two weeks.'
  return 'Away from the poles, every place gets about two weeks of day and two weeks of night.'
}

function selectSite(s: { latDeg: number; lonEastDeg: number; name: string }) {
  setScenarioInput('A', { site: { latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }, siteName: s.name })
}

/* ------------------------------------------------------------------ shared inputs */

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

function StartDial({ label, minutes, strip }: { label: string; minutes: boolean; strip: boolean }) {
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  return <DateDial label={label} value={startMs} minutes={minutes} strip={strip} onChange={(ms) => setScenarioInput('A', { startMs: ms })} />
}

/* ------------------------------------------------------------------ places */

interface Place {
  id: string
  name: string
  short: string
  area: string
  latDeg: number
  lonEastDeg: number
}

/** Example sites first, then every region of the catalogue not already listed. */
function usePlaces(): Place[] {
  const catalog = useStore((s) => s.regions)
  return useMemo(() => {
    const out: Place[] = EXAMPLE_SITES.map((s) => ({ id: s.id, name: s.name, short: s.short, area: s.region, latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }))
    for (const r of catalog?.regions ?? []) {
      if (out.some((p) => p.name === r.name)) continue
      out.push({ id: r.id, name: r.name, short: r.name, area: r.area === 'south-pole' ? 'South pole' : 'Equatorial band', ...r.center })
    }
    return out
  }, [catalog])
}

/** Every place, searchable. Opens from "All places" so the grid never grows. */
function PlaceList({ places, selected, planner, onPick, onClose }: { places: Place[]; selected: string | null; planner: boolean; onPick: (p: Place) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  const shown = places.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()))
  const areas = [...new Set(shown.map((p) => p.area))]
  return (
    <div ref={ref} className="place-list" role="dialog" aria-label="All places">
      <Input id="place-search" inputSize="s" placeholder="Search places" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Search places" />
      <div className="place-list-scroll">
        {areas.map((a) => (
          <div key={a} className="place-list-group">
            <span className="place-list-area">{a}</span>
            {shown
              .filter((p) => p.area === a)
              .map((p) => (
                <button key={p.id} type="button" className="place-list-row" aria-pressed={p.name === selected} onClick={() => onPick(p)}>
                  <span className="place-list-name">{p.name.split(' · ')[0]}</span>
                  {planner && <span className="mono ui-muted">{`${formatLat(p.latDeg, 2)} ${formatLon(p.lonEastDeg, 2)}`}</span>}
                </button>
              ))}
          </div>
        ))}
        {shown.length === 0 && <p className="ui-muted ui-small">No place matches “{q}”.</p>}
      </div>
    </div>
  )
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

/* ------------------------------------------------------------------ step 1: home */

function HomePanel({ onNext }: { onNext: () => void }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const [mode, setMode] = useState<'list' | 'coords'>('list')
  const [listOpen, setListOpen] = useState(false)
  const planner = audience === 'planner'
  const places = usePlaces()
  // A fixed number of equal tiles; the chosen place always shows as a tile.
  const max = planner ? 6 : 4
  const base = places.filter((p) => planner || (p.id !== 'sp-ref' && p.id !== 'apollo15')).slice(0, max)
  const chosen = places.find((p) => p.name === input.siteName)
  const tiles = chosen && !base.some((p) => p.id === chosen.id) ? [...base.slice(0, max - 1), chosen] : base

  return (
    <div className="moon-side">
      <h1 className="ui-display is-s">{planner ? 'Landing site and date' : 'Where shall we land?'}</h1>
      <Card as="section" className="home-card" aria-label="Place and day">
        <div className="ui-card-head">
          <h2 className="ui-title">{planner ? 'Landing site' : 'Pick a place'}</h2>
          {planner && (
            <span className="moon-card-tool">
              <Segmented
                label="How to choose the site"
                size="s"
                tone="sunk"
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'list', label: 'From the list' },
                  { value: 'coords', label: 'Coordinates' },
                ]}
              />
            </span>
          )}
        </div>
        {planner && mode === 'coords' ? (
          <CoordinateEditor key={`${input.site.latDeg},${input.site.lonEastDeg}`} />
        ) : (
          <div className="place-picker">
            <div className={`ui-site-grid${planner ? ' is-dense' : ''}`}>
              {tiles.map((p) => (
                <SiteTile
                  key={p.id}
                  name={planner ? p.short : p.name.split(' · ')[0]}
                  meta={planner ? `${Math.abs(p.latDeg).toFixed(1)}°${p.latDeg < 0 ? 'S' : 'N'} ${Math.abs(p.lonEastDeg).toFixed(1)}°${p.lonEastDeg < 0 ? 'W' : 'E'}` : undefined}
                  selected={input.siteName === p.name}
                  onSelect={() => selectSite(p)}
                />
              ))}
            </div>
            <div className="place-more">
              <span className="ui-field-hint">
                {input.siteName === null
                  ? `${CUSTOM_SITE_NAME}: ${formatLat(input.site.latDeg, 2)}, ${formatLon(input.site.lonEastDeg, 2)}`
                  : planner
                    ? 'Or click anywhere on the globe.'
                    : 'Or tap any point on the Moon.'}
              </span>
              <button type="button" className="ui-dial-link" aria-haspopup="dialog" aria-expanded={listOpen} onClick={() => setListOpen((o) => !o)}>
                All places ({places.length})
              </button>
            </div>
            {listOpen && (
              <PlaceList
                places={places}
                selected={input.siteName}
                planner={planner}
                onPick={(p) => {
                  selectSite(p)
                  setListOpen(false)
                }}
                onClose={() => setListOpen(false)}
              />
            )}
          </div>
        )}

        <div className="home-divider" />

        <div className="ui-card-head">
          <h2 className="ui-title">{planner ? 'Date and time (UTC)' : 'Pick a day'}</h2>
        </div>
        <StartDial label={planner ? 'Date and time, UTC' : 'Day'} minutes={planner} strip />
        {planner ? (
          <details className="home-more">
            <summary>More options</summary>
            <PlannerExtras />
          </details>
        ) : (
          <p className="ui-field-hint">Scroll through the days and watch the light move on the Moon. Times are UTC.</p>
        )}
      </Card>

      <Button size="l" block onClick={onNext} icon={<ArrowIcon />}>
        Show the Moon
      </Button>

    </div>
  )
}

/* ------------------------------------------------------------------ step 3: ranking */

type Pick = (site: { latDeg: number; lonEastDeg: number; name: string }) => void

function Metrics({ r, audience }: { r: Ranked; audience: Audience }) {
  const p = r.previous
  const pct = (v: number) => `${Math.round(v * 100)}%`
  const d = (now: number, before: number | undefined, better: 'higher' | 'lower' = 'higher', unit = '') =>
    before === undefined ? null : <Delta value={now - before} unit={unit} better={better} />
  if (audience === 'teacher') {
    return (
      <span className="ranking-meta">
        <span>Sun {pct(r.sunFraction)} {d(r.sunFraction * 100, p && p.sunFraction * 100)}</span>
        <span>Earth {pct(r.earthFraction)} {d(r.earthFraction * 100, p && p.earthFraction * 100)}</span>
        <span>Night {Math.round(r.longestNightH / 24)} d</span>
      </span>
    )
  }
  return (
    <span className="ranking-meta mono">
      <span>Sun {pct(r.sunFraction)} {d(r.sunFraction * 100, p && p.sunFraction * 100)}</span>
      <span>Earth {pct(r.earthFraction)} {d(r.earthFraction * 100, p && p.earthFraction * 100)}</span>
      <span>Both {pct(r.bothFraction)} {d(r.bothFraction * 100, p && p.bothFraction * 100)}</span>
      <span>Night {r.longestNightH} h {d(r.longestNightH, p?.longestNightH, 'lower', ' h')}</span>
    </span>
  )
}

function RankingPanel({ ranked, audience, onPick }: { ranked: Ranked[]; audience: Audience; onPick: Pick }) {
  const rankBy = useStore((s) => s.rankBy)
  const siteName = useStore((s) => s.scenarios.A.input.siteName)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const catalog = useStore((s) => s.regions)
  const label = RANK_LABELS[rankBy][audience === 'student' ? 'student' : 'other']
  const shown = ranked.slice(0, TOP_N[audience])
  const best = shown[0]?.value ?? 1
  const headline = (r: Ranked) => (rankBy === 'overall' ? String(r.score) : `${Math.round(r.value * 100)}%`)

  return (
    <section className="ranking ui-card" aria-label="Ranking">
      <header className="ranking-head">
        <h2 className="ui-title">{audience === 'planner' ? 'Ranking' : 'Best places to land'}</h2>
        <span className="ui-small ui-muted">
          {audience === 'student' ? label : `${label} · changes vs ${previousMonthName(startMs)}`}
          {catalog?.origin === 'demo' ? ' · practice data' : ''}
        </span>
      </header>
      {!catalog ? (
        <p className="ui-muted">Loading the regions…</p>
      ) : (
        <ol className={`ranking-list is-${audience}`}>
          {shown.map((r) => (
            <li key={r.id}>
              <button type="button" className="ranking-row" aria-pressed={r.name === siteName} onClick={() => onPick({ ...r.center, name: r.name })}>
                <span className="ranking-line">
                  <span className="ranking-n">{r.rank}</span>
                  <span className="ranking-name">{r.name.split(' · ')[0]}</span>
                  {r.rank === 1 && (
                    <span className="ranking-best">
                      <Trophy size={16} strokeWidth={1.75} aria-hidden="true" />
                      Best
                    </span>
                  )}
                  {audience !== 'student' && <span className="ranking-value mono">{headline(r)}</span>}
                </span>
                {audience === 'student' ? (
                  <span className="ranking-bar" aria-hidden="true">
                    <span style={{ width: `${(r.value / best) * 100}%` }} />
                  </span>
                ) : (
                  <Metrics r={r} audience={audience} />
                )}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ step 2: box */

function ExploreBox({ ranked, onOpen, onPick }: { ranked: Ranked[]; onOpen: () => void; onPick: Pick }) {
  const audience = useStore((s) => s.audience)
  const rankBy = useStore((s) => s.rankBy)
  const area = useStore((s) => s.area)
  const input = useStore((s) => s.scenarios.A.input)
  const catalog = useStore((s) => s.regions)
  const planner = audience === 'planner'
  const all = catalog?.regions ?? []
  const current = all.find((r) => r.name === input.siteName)
  const labelKey = audience === 'student' ? 'student' : 'other'

  return (
    <section className="explore-box ui-card" aria-label="Place, day and ranking">
      <div className="explore-fields">
        <Field label="Place" htmlFor="ex-place">
          <Select
            id="ex-place"
            inputSize="s"
            value={current?.id ?? ''}
            onChange={(e) => {
              const r = all.find((x) => x.id === e.target.value)
              if (r) onPick({ ...r.center, name: r.name })
            }}
          >
            {!current && <option value="">{input.siteName ?? `${CUSTOM_SITE_NAME} · ${formatLat(input.site.latDeg, 2)}`}</option>}
            {(ranked.length ? ranked : all).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="ui-field">
          <span className="ui-field-label">{planner ? 'Date and time (UTC)' : 'Day'}</span>
          <StartDial label={planner ? 'Date and time, UTC' : 'Day'} minutes={planner} strip={false} />
        </div>
        <div className="ui-field">
          <span className="ui-field-label">Rank by</span>
          <Segmented<RankBy>
            label="Rank by"
            size="s"
            tone="sunk"
            value={rankBy}
            onChange={(v) => setState({ rankBy: v })}
            options={(['overall', 'sun', 'earth', 'both'] as const).map((v) => ({
              value: v,
              label: audience === 'student' ? { overall: 'Best', sun: 'Sunniest', earth: 'Radio', both: 'Both' }[v] : RANK_LABELS[v][labelKey],
            }))}
          />
        </div>
        {audience !== 'student' && (
          <div className="ui-field">
            <span className="ui-field-label">Area</span>
            <Segmented<AreaFilter>
              label="Area"
              size="s"
              tone="sunk"
              value={area}
              onChange={(v) => setState({ area: v })}
              options={[
                { value: 'south-pole', label: 'South pole' },
                { value: 'equatorial', label: 'Equator' },
                { value: 'all', label: 'All' },
              ]}
            />
          </div>
        )}
      </div>
      {planner && (
        <details className="home-more">
          <summary>Period and observer</summary>
          <PlannerExtras />
        </details>
      )}
      <Button size="m" icon={<ArrowIcon />} onClick={onOpen} className="explore-go">
        {audience === 'student' ? 'Fly down here' : 'Open horizon'}
      </Button>
    </section>
  )
}

/* ------------------------------------------------------------------ screen */

export function MoonScreen({ mode }: { mode: 'moon' | 'explore' }) {
  const audience = useStore((s) => s.audience)
  const input = useStore((s) => s.scenarios.A.input)
  const catalog = useStore((s) => s.regions)
  const rankBy = useStore((s) => s.rankBy)
  const area = useStore((s) => s.area)
  const [realLight, setRealLight] = useState(true)
  const [coverage, setCoverage] = useState(false)
  const [hover, setHover] = useState('')
  const [zoomed, setZoomed] = useState(false)
  const planner = audience === 'planner'
  const explore = mode === 'explore'

  const ranked = useMemo(() => (catalog ? rank(catalog.regions, rankBy, area) : []), [catalog, rankBy, area])

  const markers = useMemo<GlobeMarker[]>(() => {
    if (explore) return ranked.slice(0, TOP_N[audience]).map((r) => ({ id: r.id, label: r.name, rank: r.rank, ...r.center }))
    return EXAMPLE_SITES.filter((s) => planner || s.id !== 'sp-ref').map((s) => ({ id: s.id, label: s.short, latDeg: s.latDeg, lonEastDeg: s.lonEastDeg }))
  }, [explore, ranked, audience, planner])

  const selectedId = (explore ? ranked.find((r) => r.name === input.siteName)?.id : EXAMPLE_SITES.find((s) => s.name === input.siteName)?.id) ?? null

  // Explore frames the chosen area in the space left free by the panels;
  // picking a region moves closer to it. The camera only slides, it never turns.
  const free: [number, number] = [-0.32, 0.24]
  const focus: GlobeFocus | null = !explore
    ? null
    : zoomed
      ? { ...input.site, distanceM: 260_000, screen: free }
      : area === 'all'
        ? null
        : { ...(area === 'south-pole' ? { latDeg: -87.5, lonEastDeg: 20 } : { latDeg: 8, lonEastDeg: 15 }), distanceM: area === 'south-pole' ? 760_000 : 2_600_000, screen: free }

  const openHorizon = () => {
    setState({ cursorOffsetMs: 0 })
    goTo('site')
  }

  // In the ranking view, choosing a region moves the camera closer to it.
  const pick: Pick = (site) => {
    selectSite(site)
    if (explore) setZoomed(true)
  }
  if (!explore && zoomed) setZoomed(false)

  const pickMarker = (id: string) => {
    const r = catalog?.regions.find((x) => x.id === id)
    if (r) return pick({ ...r.center, name: r.name })
    const s = EXAMPLE_SITES.find((x) => x.id === id)
    if (s) pick(s)
  }

  return (
    <div className={`moon-page is-${mode}`}>
      {!explore && <TopBar />}
      <div className="moon-layout">
        {!explore && <HomePanel onNext={() => goTo('explore')} />}
        <div className="moon-stage">
          <SpaceWindow className="moon-window" aria-label="The Moon">
            <Suspense fallback={<div className="moon-globe-loading">Loading the Moon…</div>}>
              <MoonGlobe
                markers={markers}
                selected={{ ...input.site, label: input.siteName?.split(' · ')[0] ?? CUSTOM_SITE_NAME, id: selectedId }}
                focus={focus}
                lightMs={realLight ? input.startMs : null}
                showCoverage={planner && coverage}
                onPickMarker={pickMarker}
                onPickPoint={(site) => setScenarioInput('A', { site, siteName: null })}
                onHover={planner ? setHover : undefined}
              />
            </Suspense>

            {explore && (
              <div className="explore-top">
                <div className="explore-top-start">
                  <Button variant="quiet" pill size="s" icon={<BackIcon />} onClick={() => goTo('moon')}>
                    Back
                  </Button>
                  <span className="explore-logo">
                    <Logo size={32} tone="dark" />
                  </span>
                  <DemoChip />
                </div>
                <AudienceSwitch size="s" />
              </div>
            )}

            <div className={`moon-window-toggles${explore ? ' is-explore' : ''}`}>
              <Toggle checked={realLight} onChange={setRealLight} onDark>
                Sunlight on this day
              </Toggle>
              {planner && (
                <Toggle checked={coverage} onChange={setCoverage} onDark>
                  DEM coverage
                </Toggle>
              )}
            </div>

            {explore && zoomed && (
              <Button variant="quiet" pill size="s" icon={<Minimize2 size={20} strokeWidth={1.75} aria-hidden="true" />} className="explore-all" onClick={() => setZoomed(false)}>
                All sites
              </Button>
            )}
            {explore && <RankingPanel ranked={ranked} audience={audience} onPick={pick} />}
            {explore && <ExploreBox ranked={ranked} onOpen={openHorizon} onPick={pick} />}
            {planner && hover && <span className={`ui-space-caption moon-hover${explore ? ' is-explore' : ''} mono`}>{hover}</span>}
          </SpaceWindow>
          {!explore && !planner && <p className="moon-caption">{caption(input.site.latDeg, audience)}</p>}
          {!explore && (
            <p className="moon-foot ui-small ui-muted">
              LRO imagery and LOLA relief via NASA Moon Trek. Independent tool, not endorsed by NASA. <a href="#/kit">Brand kit</a>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
