/**
 * The site report, one per audience. Same engine results, three ways to say
 * them: a story (student), the story plus the numbers and class prompts
 * (teacher), the numbers with exact times and an A/B comparison (planner).
 */
import type { ReactNode } from 'react'
import type { ScenarioEvaluation, TerrainAnalysis } from '../api/types'
import { bestProductFor } from '../domain/coverage'
import { formatAngle, formatCountdown, formatDuration, formatPercent, formatSignedAngle, formatUtc } from '../domain/format'
import { bodyAt, intervalStats, type BodyAtTime } from '../domain/sampling'
import { EXAMPLE_SITES } from '../domain/sites'
import { spanAt, type Span } from '../domain/sky'
import { classPrompts, headline, studentLine, teacherLine } from '../domain/story'
import { setScenarioInput, setState, useStore, type Audience, type ScenarioKey } from '../state/store'
import { Button, Card, Chip, DownloadIcon, EarthIcon, Metric, Select, StoryCard, SunIcon, Toggle } from '../ui'

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

export function Report({ audience }: { audience: Audience }) {
  const A = useStore((s) => s.scenarios.A)
  const offset = useStore((s) => s.cursorOffsetMs)
  const durationDays = useStore((s) => s.durationDays)
  const evaluation = A.run.evaluation
  if (!evaluation) return null
  const t = A.input.startMs + offset
  const now = nowOf(evaluation, t)
  const endMs = A.input.startMs + durationDays * 86_400_000
  const stats = periodStats(evaluation, A.input.startMs, endMs)

  if (audience === 'student') return <StudentReport now={now} />
  if (audience === 'teacher') return <TeacherReport now={now} stats={stats} durationDays={durationDays} />
  return <PlannerReport now={now} />
}

/* ------------------------------------------------------------------ student */

function StudentReport({ now }: { now: Now }) {
  return (
    <div className="report">
      <StoryCard eyebrow="Power" tone="sun" headline={headline('sun', now.sunSpan, now.t)}>
        {studentLine('sun', now.sun)}
      </StoryCard>
      <StoryCard eyebrow="Calling home" tone="earth" headline={headline('earth', now.earthSpan, now.t)}>
        {studentLine('earth', now.earth)}
      </StoryCard>
      <Card tone="dark" as="article">
        <span className="ui-eyebrow">Why it matters</span>
        <p className="report-why">Land a few kilometres away, or a week later, and both numbers change completely.</p>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------ teacher */

type Stats = ReturnType<typeof periodStats>

function TeacherReport({ now, stats, durationDays }: { now: Now; stats: Stats; durationDays: number }) {
  const prompts = classPrompts(now.sun, now.earth)
  return (
    <div className="report">
      <StoryCard
        eyebrow="Power"
        tone="sun"
        headline={headline('sun', now.sunSpan, now.t)}
        extra={
          <>
            <Chip tone="sun" icon={<SunIcon size={16} />}>
              Sunlight {formatPercent(stats.sun.fraction)} of {durationDays} days
            </Chip>
            <Chip tone="neutral">Longest night {formatDuration(stats.sun.longestOffMs)}</Chip>
          </>
        }
      >
        {teacherLine('sun', now.sun, now.sunSpan)}
      </StoryCard>
      <StoryCard
        eyebrow="Calling home"
        tone="earth"
        headline={headline('earth', now.earthSpan, now.t)}
        extra={
          <>
            <Chip tone="earth" icon={<EarthIcon size={16} />}>
              Earth in view {formatPercent(stats.earth.fraction)}
            </Chip>
            <Chip tone="neutral">Longest silence {formatDuration(stats.earth.longestOffMs)}</Chip>
          </>
        }
      >
        {teacherLine('earth', now.earth, now.earthSpan)}
      </StoryCard>
      <Card as="article">
        <span className="ui-eyebrow">Light and link together</span>
        <p className="ui-story-headline">{formatPercent(stats.both.fraction)} of the time</p>
        <p className="ui-story-body">
          Sun and Earth are both above the hills for {formatDuration(stats.both.totalMs)} in {durationDays} days. The longest stretch lasts{' '}
          {formatDuration(stats.both.longestOnMs)}.
        </p>
      </Card>
      {prompts.map((p) => (
        <Card key={p.title} tone="dark" as="article">
          <span className="ui-eyebrow">{p.title}</span>
          <p className="report-why">{p.body}</p>
        </Card>
      ))}
    </div>
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
  return periodStats(sc.run.evaluation, sc.input.startMs, sc.input.startMs + durationDays * 86_400_000)
}

function PlannerReport({ now }: { now: Now }) {
  const compare = useStore((s) => s.compare)
  const durationDays = useStore((s) => s.durationDays)
  const nameA = useStore((s) => s.scenarios.A.input.siteName)
  const B = useStore((s) => s.scenarios.B)
  const terrain = useStore((s) => s.scenarios.A.run.terrain)
  const evaluation = useStore((s) => s.scenarios.A.run.evaluation)
  const statsA = useScenarioStats('A')
  const statsB = useScenarioStats('B')
  const cols: [string, Stats | null][] = compare ? [['A', statsA], ['B', statsB]] : [['A', statsA]]

  const rows: [string, (s: Stats) => string][] = [
    ['Sun visible', (s) => formatPercent(s.sun.fraction)],
    ['Earth visible', (s) => formatPercent(s.earth.fraction)],
    ['Sun + Earth', (s) => formatPercent(s.both.fraction)],
    ['Longest night', (s) => formatDuration(s.sun.longestOffMs)],
    ['Longest no-link', (s) => formatDuration(s.earth.longestOffMs)],
    ['Longest Sun + Earth', (s) => formatDuration(s.both.longestOnMs)],
    ['Sunrises', (s) => String(s.sun.count)],
  ]

  return (
    <div className="report">
      <Card>
        <div className="report-head">
          <h2 className="ui-title">Now</h2>
          <span className="mono ui-small ui-muted">{formatUtc(now.t)} UTC</span>
        </div>
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
        <div className="ui-metric-grid">
          <EventMetric body="sun" span={now.sunSpan} t={now.t} />
          <EventMetric body="earth" span={now.earthSpan} t={now.t} />
        </div>
      </Card>

      <Card>
        <div className="report-head">
          <h2 className="ui-title">This period</h2>
          <span className="ui-small ui-muted">{durationDays} days · centre of disc</span>
        </div>
        <table className="ui-table">
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
            {rows.map(([label, fn]) => (
              <tr key={label}>
                <td>{label}</td>
                {cols.map(([k, s]) => (
                  <td key={k}>{s ? fn(s) : '…'}</td>
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
              value={EXAMPLE_SITES.find((s) => s.name === B.input.siteName)?.id ?? ''}
              onChange={(e) => {
                const site = EXAMPLE_SITES.find((s) => s.id === e.target.value)
                if (site) setScenarioInput('B', { site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg }, siteName: site.name })
              }}
            >
              {EXAMPLE_SITES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        )}
      </Card>

      <DataSources terrain={terrain} evaluation={evaluation} />
    </div>
  )
}

function DataSources({ terrain, evaluation }: { terrain?: TerrainAnalysis; evaluation?: ScenarioEvaluation }) {
  const coverage = useStore((s) => s.coverage)
  const lat = useStore((s) => s.scenarios.A.input.site.latDeg)
  const products = coverage?.products ?? []
  const profile = terrain?.profile
  const product = (profile && products.find((p) => p.id === profile.dem.productIds[0])) ?? bestProductFor(lat, products)
  return (
    <Card>
      <details className="ui-disclosure">
        <summary>Data and caveats</summary>
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
      </details>
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

