/**
 * Site panels, placed by SiteScreen on its grid. Same engine results, said
 * three ways: a story (student), the story plus numbers and class prompts
 * (teacher), numbers with exact times and an A/B comparison (planner).
 */
import type { ReactNode } from 'react'
import { provider } from '../api'
import { dataApi } from '../api'
import { useEffect, useState } from 'react'
import type { ScenarioEvaluation, TerrainAnalysis } from '../api/types'
import { bestProductFor } from '../domain/coverage'
import { formatAngle, formatCountdown, formatDuration, formatPercent, formatSignedAngle, formatUtc, previousMonthName } from '../domain/format'
import { bodyAt, intervalStats, type BodyAtTime } from '../domain/sampling'
import { spanAt, type Span } from '../domain/sky'
import { classPrompts, headline, studentLine, teacherLine } from '../domain/story'
import { setScenarioInput, setState, useStore, type Audience, type ScenarioKey } from '../state/store'
import { Button, Card, Delta, DownloadIcon, EarthIcon, Metric, Select, StoryCard, SunIcon, Toggle } from '../ui'

interface Now {
  t: number
  sun: BodyAtTime
  earth: BodyAtTime
  sunSpan: Span
  earthSpan: Span
}

function nowOf(evaluation: ScenarioEvaluation, t: number): Now {
  return {
    t,
    sun: bodyAt(evaluation, evaluation.sun, evaluation.intervals.sun, t),
    earth: bodyAt(evaluation, evaluation.earth, evaluation.intervals.earth, t),
    sunSpan: spanAt(evaluation.intervals.sun, t),
    earthSpan: spanAt(evaluation.intervals.earth, t),
  }
}

function periodStats(evaluation: ScenarioEvaluation, startMs: number, endMs: number) {
  return {
    sun: intervalStats(evaluation.intervals.sun, startMs, endMs),
    earth: intervalStats(evaluation.intervals.earth, startMs, endMs),
    both: intervalStats(evaluation.intervals.both, startMs, endMs),
  }
}

type Stats = ReturnType<typeof periodStats>

const H = 3_600_000

function useSite() {
  const A = useStore((s) => s.scenarios.A)
  const offset = useStore((s) => s.cursorOffsetMs)
  const durationDays = useStore((s) => s.durationDays)
  const evaluation = A.run.evaluation
  if (!evaluation) return null
  const span = durationDays * 86_400_000
  const startMs = A.input.startMs
  return {
    now: nowOf(evaluation, startMs + offset),
    stats: periodStats(evaluation, startMs, startMs + span),
    prev: A.run.previous ? periodStats(A.run.previous, startMs - span, startMs) : null,
    durationDays,
    month: previousMonthName(startMs),
  }
}

function Fact({ label, value, delta }: { label: string; value: string; delta?: ReactNode }) {
  return (
    <div className="report-fact">
      <dt>{label}</dt>
      <dd>
        <span className="mono">{value}</span> {delta}
      </dd>
    </div>
  )
}

/* ------------------------------------------------------------------ now (beside the scene) */

/** What is true at the cursor: two stories, or the planner's live readout. */
export function NowPanel({ audience }: { audience: Audience }) {
  const site = useSite()
  if (!site) return null
  const { now } = site
  if (audience === 'planner') return <PlannerNow now={now} />
  const line = (body: 'sun' | 'earth') => (audience === 'public' ? studentLine(body, now[body]) : teacherLine(body, now[body], body === 'sun' ? now.sunSpan : now.earthSpan))
  return (
    <div className="now-panel">
      <StoryCard eyebrow="Power" tone="sun" headline={headline('sun', now.sunSpan, now.t)}>
        {line('sun')}
      </StoryCard>
      <StoryCard eyebrow="Calling home" tone="earth" headline={headline('earth', now.earthSpan, now.t)}>
        {line('earth')}
      </StoryCard>
    </div>
  )
}

/* ------------------------------------------------------------------ period (teacher) */

/** The month in numbers, each with the change from the month before. */
export function MonthPanel() {
  const site = useSite()
  if (!site) return null
  const { stats, prev, durationDays, month } = site
  const d = (now: number, before: number | null | undefined, unit = "", better: "higher" | "lower" = "higher") =>
    before === undefined || before === null ? undefined : <Delta value={now - before} unit={unit} better={better} />
  return (
    <Card as="article" className="panel-card">
      <header className="panel-head">
        <h3 className="ui-title">The selected period in numbers</h3>
        <p className="ui-small ui-muted">
          {durationDays} days from the start date · changes vs {month}
        </p>
      </header>
      <dl className="report-facts">
        <Fact label="Sunlight" value={formatPercent(stats.sun.fraction)} delta={d(stats.sun.fraction * 100, prev && prev.sun.fraction * 100)} />
        <Fact label="Earth in view" value={formatPercent(stats.earth.fraction)} delta={d(stats.earth.fraction * 100, prev && prev.earth.fraction * 100)} />
        <Fact label="Sun and Earth together" value={formatPercent(stats.both.fraction)} delta={d(stats.both.fraction * 100, prev && prev.both.fraction * 100)} />
        <Fact label="Longest night" value={formatDuration(stats.sun.longestOffMs)} delta={d(stats.sun.longestOffMs / H, prev && prev.sun.longestOffMs / H, ' h', 'lower')} />
        <Fact label="Longest silence" value={formatDuration(stats.earth.longestOffMs)} delta={d(stats.earth.longestOffMs / H, prev && prev.earth.longestOffMs / H, ' h', 'lower')} />
        <Fact label="Longest light and link" value={formatDuration(stats.both.longestOnMs)} delta={d(stats.both.longestOnMs / H, prev && prev.both.longestOnMs / H, ' h')} />
      </dl>
    </Card>
  )
}

/* ------------------------------------------------------------------ class (teacher) */

export function PromptsPanel() {
  const site = useSite()
  if (!site) return null
  const prompts = classPrompts(site.now.sun, site.now.earth)
  return (
    <Card as="article" tone="dark" className="panel-card">
      <header className="panel-head">
        <h3 className="ui-title">For the class</h3>
      </header>
      <dl className="prompt-list">
        {prompts.map((p) => (
          <div key={p.title}>
            <dt>{p.title}</dt>
            <dd>{p.body}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

/* ------------------------------------------------------------------ why (student) */

export function WhyPanel() {
  return (
    <Card as="article" tone="dark" className="panel-card">
      <header className="panel-head">
        <h3 className="ui-title">Why it matters</h3>
      </header>
      <p className="report-why">Land a few kilometres away, or a week later, and both numbers change completely. That is why mission teams compare places and dates before choosing.</p>
    </Card>
  )
}

/* ------------------------------------------------------------------ planner */

function BodyRow({ name, at, icon }: { name: string; at: BodyAtTime; icon: ReactNode }) {
  const margin = at.elevationDeg - at.horizonDeg
  return (
    <tr>
      <td>
        <span className="report-rowname">
          {icon}
          {name}
        </span>
      </td>
      <td>{at.azimuthDeg.toFixed(1)}°</td>
      <td>{formatAngle(at.elevationDeg, 2)}</td>
      <td>{formatAngle(at.horizonDeg, 2)}</td>
      <td className={margin >= 0 ? 'is-pos' : 'is-neg'}>{formatSignedAngle(margin)}</td>
    </tr>
  )
}

function EventMetric({ body, span, t }: { body: 'sun' | 'earth'; span: Span; t: number }) {
  const label = span.on ? (body === 'sun' ? 'Sunset in' : 'Earthset in') : body === 'sun' ? 'Sunrise in' : 'Earthrise in'
  return (
    <Metric
      tone={body}
      label={label}
      value={span.untilMs === null ? '—' : formatCountdown(span.untilMs - t)}
      detail={span.untilMs === null ? 'No change in this period' : `${formatUtc(span.untilMs)} UTC`}
    />
  )
}

function useScenarioStats(key: ScenarioKey) {
  const sc = useStore((s) => s.scenarios[key])
  const durationDays = useStore((s) => s.durationDays)
  if (!sc.run.evaluation) return null
  const span = durationDays * 86_400_000
  return {
    now: periodStats(sc.run.evaluation, sc.input.startMs, sc.input.startMs + span),
    prev: sc.run.previous ? periodStats(sc.run.previous, sc.input.startMs - span, sc.input.startMs) : null,
  }
}

interface Row {
  label: string
  show: (s: Stats) => string
  /** Comparable number in display units, and its unit. */
  num: (s: Stats) => number
  unit: string
  better: 'higher' | 'lower'
}

function PlannerNow({ now }: { now: Now }) {
  return (
    <Card className="panel-card now-card">
      <header className="panel-head is-row">
        <h3 className="ui-title">Now</h3>
        <span className="mono ui-small ui-muted">{formatUtc(now.t)} UTC</span>
      </header>
      <table className="ui-table">
        <thead>
          <tr>
            <th scope="col">Body</th>
            <th scope="col">Az</th>
            <th scope="col">El</th>
            <th scope="col">H(az)</th>
            <th scope="col">Margin</th>
          </tr>
        </thead>
        <tbody>
          <BodyRow name="Sun" at={now.sun} icon={<SunIcon size={16} />} />
          <BodyRow name="Earth" at={now.earth} icon={<EarthIcon size={16} />} />
        </tbody>
      </table>
      <div className="now-metrics">
        <EventMetric body="sun" span={now.sunSpan} t={now.t} />
        <EventMetric body="earth" span={now.earthSpan} t={now.t} />
      </div>
    </Card>
  )
}

/** Planner: period metrics for A (and B), each with the change vs the month before. */
export function PeriodPanel() {
  const sites = useStore((s) => s.sites)
  const compare = useStore((s) => s.compare)
  const durationDays = useStore((s) => s.durationDays)
  const nameA = useStore((s) => s.scenarios.A.input.siteName)
  const B = useStore((s) => s.scenarios.B)
  const evaluation = useStore((s) => s.scenarios.A.run.evaluation)
  const statsA = useScenarioStats('A')
  const statsB = useScenarioStats('B')
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const cols: [string, ReturnType<typeof useScenarioStats>][] = compare ? [['A', statsA], ['B', statsB]] : [['A', statsA]]
  const month = previousMonthName(startMs)

  const rows: Row[] = [
    { label: 'Sun visible', show: (s) => formatPercent(s.sun.fraction), num: (s) => s.sun.fraction * 100, unit: '', better: 'higher' },
    { label: 'Earth visible', show: (s) => formatPercent(s.earth.fraction), num: (s) => s.earth.fraction * 100, unit: '', better: 'higher' },
    { label: 'Sun + Earth', show: (s) => formatPercent(s.both.fraction), num: (s) => s.both.fraction * 100, unit: '', better: 'higher' },
    { label: 'Longest night', show: (s) => formatDuration(s.sun.longestOffMs), num: (s) => s.sun.longestOffMs / H, unit: ' h', better: 'lower' },
    { label: 'Longest no-link', show: (s) => formatDuration(s.earth.longestOffMs), num: (s) => s.earth.longestOffMs / H, unit: ' h', better: 'lower' },
    { label: 'Longest Sun + Earth', show: (s) => formatDuration(s.both.longestOnMs), num: (s) => s.both.longestOnMs / H, unit: ' h', better: 'higher' },
    { label: 'Sunrises', show: (s) => String(s.sun.count), num: (s) => s.sun.count, unit: '', better: 'higher' },
  ]

  return (
    <Card as="article" className="panel-card">
      <header className="panel-head">
        <h3 className="ui-title">This period</h3>
        <p className="ui-small ui-muted">
          {durationDays} days · changes vs {month}
        </p>
      </header>
      <table className="ui-table period-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            {cols.map(([k]) => (
              <th key={k} scope="col">
                {compare ? <span className={`report-key is-${k}`}>{k}</span> : 'Value'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td>{r.label}</td>
              {cols.map(([k, st]) => (
                <td key={k}>
                  {st ? r.show(st.now) : '…'}
                  {st?.prev && (
                    <>
                      {' '}
                      <Delta value={r.num(st.now) - r.num(st.prev)} unit={r.unit} better={r.better} />
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="report-actions">
        <Toggle checked={compare} onChange={(v) => setState({ compare: v })}>
          Compare with B
        </Toggle>
        {evaluation && (
          <Button variant="secondary" size="s" icon={<DownloadIcon />} onClick={() => downloadCsv(evaluation, nameA)}>
            Intervals CSV
          </Button>
        )}
      </div>
      {compare && (
        <div className="report-compare">
          <span className="report-key is-A">A</span>
          <span className="ui-small">{nameA ?? 'Custom point'}</span>
          <span className="report-key is-B">B</span>
          <Select
            inputSize="s"
            aria-label="Site B"
            value={B.input.selectionId ?? (provider.kind === 'demo' ? sites.find((s) => s.name === B.input.siteName)?.id : null) ?? ''}
            onChange={(e) => {
              const site = sites.find((s) => s.id === e.target.value)
              if (site) setScenarioInput('B', { site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg }, siteName: site.name, selectionId: site.id })
            }}
          >
            <option value="">Custom point / choose a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </Card>
  )
}

/** Planner: where the numbers come from and what they do not cover. */
export function DataPanel() {
  const terrain = useStore((s) => s.scenarios.A.run.terrain)
  const evaluation = useStore((s) => s.scenarios.A.run.evaluation)
  return <><DataSources terrain={terrain} evaluation={evaluation} /><SourceDataPanel /></>
}

function SourceDataPanel() {
  const [datasets, setDatasets] = useState<{id:string;name:string;status:string;retrieved_at?:string}[]>([])
  const [error, setError] = useState('')
  useEffect(() => { if (provider.kind === 'api') void dataApi.getDatasets().then(setDatasets).catch(e => setError(String(e))) }, [])
  if (provider.kind !== 'api') return null
  return <Card as="article" className="panel-card"><header className="panel-head"><h3 className="ui-title">Saved source data</h3></header>
    {error ? <p role="alert">{error}</p> : <ul>{datasets.map(d => <li key={d.id}><a href={`${import.meta.env.VITE_API_BASE_URL ?? '/api'}/data/datasets/${d.id}/raw`} target="_blank" rel="noreferrer">{d.name}</a> · {d.status}{d.retrieved_at ? ` · ${d.retrieved_at}` : ''}</li>)}</ul>}
    {!datasets.length && !error && <p>Sources have not been collected yet.</p>}
  </Card>
}

function DataSources({ terrain, evaluation }: { terrain?: TerrainAnalysis; evaluation?: ScenarioEvaluation }) {
  const coverage = useStore((s) => s.coverage)
  const lat = useStore((s) => s.scenarios.A.input.site.latDeg)
  const products = coverage?.products ?? []
  const profile = terrain?.profile
  const product = (profile && products.find((p) => p.id === profile.dem.productIds[0])) ?? bestProductFor(lat, products)
  return (
    <Card as="article" className="panel-card">
      <header className="panel-head">
        <h3 className="ui-title">Data and caveats</h3>
      </header>
        <dl className="ui-datalist">
          <dt>Terrain</dt>
          <dd>
            {product ? (
              <a href={product.url} target="_blank" rel="noreferrer">
                {product.title}
              </a>
            ) : (
              '—'
            )}
          </dd>
          <dt>Pixel</dt>
          <dd className="mono">{profile ? `${profile.dem.effectivePixelSizeM} m` : product ? `${product.pixelSizeM} m` : '—'}</dd>
          {profile && (
            <>
              <dt>Sampling</dt>
              <dd className="mono">
                {profile.params.azimuthStepDeg}° · {profile.params.maxDistanceKm} km
              </dd>
              <dt>Observer</dt>
              <dd className="mono">{profile.observer.heightAboveSurfaceM} m above surface</dd>
              <dt>Algorithm</dt>
              <dd className="mono">{profile.algorithmVersion}</dd>
            </>
          )}
          {evaluation && (
            <>
              <dt>Ephemeris</dt>
              <dd>
                {evaluation.ephemeris.source} <span className="mono">{evaluation.ephemeris.version}</span>
              </dd>
              <dt>Corrections</dt>
              <dd>{evaluation.ephemeris.corrections}</dd>
            </>
          )}
        </dl>
        <ul className="report-caveats">
          {profile?.warnings.map((w) => <li key={w}>{w}</li>)}
          {evaluation?.approximations.map((a) => <li key={a}>{a}</li>)}
          <li>Visibility is geometric. Radio links need antennas and a link budget; power needs panel orientation. Neither is computed here.</li>
        </ul>
    </Card>
  )
}

function downloadCsv(evaluation: ScenarioEvaluation, siteName: string | null) {
  const lines = ['body,start_utc,end_utc,duration_h']
  for (const body of ['sun', 'earth', 'both'] as const) {
    for (const iv of evaluation.intervals[body]) {
      lines.push(`${body},${new Date(iv.startMs).toISOString()},${new Date(iv.endMs).toISOString()},${((iv.endMs - iv.startMs) / 3_600_000).toFixed(3)}`)
    }
  }
  const blob = new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${(siteName ?? 'custom-point').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${evaluation.origin}-intervals.csv`
  a.click()
  URL.revokeObjectURL(url)
}

