import { useState, type FormEvent } from 'react'
import { provider } from '../api'
import { formatLat, formatLon, fromUtcInput, toUtcInput } from '../domain/format'
import { EXAMPLE_SITES, normalizeLon, validateSite } from '../domain/sites'
import { runScenario } from '../state/runner'
import { setScenarioInput, setState, useStore, type ScenarioKey } from '../state/store'
import { DataQuality } from './DataQuality'
import { RunStatus } from './RunStatus'

const DURATIONS = [7, 14, 30, 60, 90]
const STEPS = [10, 30, 60, 120]

function SiteEditor({ k }: { k: ScenarioKey }) {
  const input = useStore((s) => s.scenarios[k].input)
  // Drafts start from the stored site; the parent remounts this editor
  // (via `key`) whenever the site changes on the globe or from the list.
  const [lat, setLat] = useState(() => String(Number(input.site.latDeg.toFixed(5))))
  const [lon, setLon] = useState(() => String(Number(input.site.lonEastDeg.toFixed(5))))
  const [error, setError] = useState<string | null>(null)

  const commit = (e?: FormEvent) => {
    e?.preventDefault()
    const la = Number(lat.replace(',', '.'))
    const lo = Number(lon.replace(',', '.'))
    const problem = validateSite(la, lo)
    setError(problem)
    if (problem) return
    const site = { latDeg: la, lonEastDeg: normalizeLon(lo) }
    if (site.latDeg === input.site.latDeg && site.lonEastDeg === input.site.lonEastDeg) return
    setScenarioInput(k, { site, siteName: null })
    setState({ flyRequest: { key: k, nonce: Date.now() } })
  }

  const exampleId = EXAMPLE_SITES.find((s) => s.name === input.siteName)?.id ?? ''

  return (
    <section className="panel-section">
      <h3 className="section-title">Punto</h3>
      <label className="field">
        <span className="field-label">Sito di esempio</span>
        <select
          value={exampleId}
          onChange={(e) => {
            const site = EXAMPLE_SITES.find((s) => s.id === e.target.value)
            if (!site) return
            setScenarioInput(k, { site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg }, siteName: site.name })
            setState({ flyRequest: { key: k, nonce: Date.now() } })
          }}
        >
          <option value="">Coordinate libere</option>
          {(['Polo Sud', 'Fascia equatoriale'] as const).map((region) => (
            <optgroup key={region} label={region}>
              {EXAMPLE_SITES.filter((s) => s.region === region).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <form className="coord-grid" onSubmit={commit}>
        <label className="field">
          <span className="field-label">Latitudine °</span>
          <input inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} onBlur={() => commit()} />
        </label>
        <label className="field">
          <span className="field-label">Longitudine Est °</span>
          <input inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} onBlur={() => commit()} />
        </label>
        <button type="submit" hidden />
      </form>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : (
        <p className="field-hint">
          {formatLat(input.site.latDeg)} · {formatLon(input.site.lonEastDeg)} — oppure clicca sul globo.
        </p>
      )}
      <label className="field">
        <span className="field-label">Altezza osservatore sul terreno</span>
        <span className="input-unit">
          <input
            type="number"
            min={0}
            max={500}
            step={0.5}
            value={input.observerHeightM}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (Number.isFinite(v) && v >= 0 && v <= 500) setScenarioInput(k, { observerHeightM: v })
            }}
          />
          <span>m</span>
        </span>
      </label>
    </section>
  )
}

function PeriodEditor({ k }: { k: ScenarioKey }) {
  const startMs = useStore((s) => s.scenarios[k].input.startMs)
  const durationDays = useStore((s) => s.durationDays)
  const stepMinutes = useStore((s) => s.stepMinutes)
  const compare = useStore((s) => s.compare)

  return (
    <section className="panel-section">
      <h3 className="section-title">Periodo</h3>
      <label className="field">
        <span className="field-label">Inizio (UTC)</span>
        <input
          type="datetime-local"
          value={toUtcInput(startMs)}
          onChange={(e) => {
            const ms = fromUtcInput(e.target.value)
            if (Number.isFinite(ms)) setScenarioInput(k, { startMs: ms })
          }}
        />
      </label>
      <div className="coord-grid">
        <label className="field">
          <span className="field-label">Durata</span>
          <select
            value={durationDays}
            onChange={(e) => {
              setState({ durationDays: Number(e.target.value), cursorOffsetMs: 0 })
            }}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d} giorni
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Passo</span>
          <select value={stepMinutes} onChange={(e) => setState({ stepMinutes: Number(e.target.value) })}>
            {STEPS.map((m) => (
              <option key={m} value={m}>
                {m < 60 ? `${m} min` : `${m / 60} h`}
              </option>
            ))}
          </select>
        </label>
      </div>
      {compare && <p className="field-hint">Durata e passo sono comuni ai due scenari, per confronti su scala coerente.</p>}
    </section>
  )
}

export function ControlPanel() {
  const active = useStore((s) => s.active)
  const compare = useStore((s) => s.compare)
  const nameA = useStore((s) => s.scenarios.A.input.siteName)
  const nameB = useStore((s) => s.scenarios.B.input.siteName)
  const site = useStore((s) => s.scenarios[s.active].input.site)

  return (
    <aside className="control-panel" aria-label="Impostazioni dello scenario">
      <div className="panel-section scenario-switch">
        <label className="toggle">
          <input
            type="checkbox"
            checked={compare}
            onChange={(e) => setState({ compare: e.target.checked, active: e.target.checked ? active : 'A' })}
          />
          <span className="toggle-track" aria-hidden="true" />
          <span>Confronta due scenari</span>
        </label>
        {compare && (
          <div className="segmented" role="tablist" aria-label="Scenario in modifica">
            {(['A', 'B'] as const).map((key) => (
              <button
                key={key}
                role="tab"
                aria-selected={active === key}
                className={`segment scenario-${key}`}
                onClick={() => setState({ active: key, flyRequest: { key, nonce: Date.now() } })}
              >
                <span className="scenario-dot" aria-hidden="true">
                  {key}
                </span>
                <span className="segment-name">{(key === 'A' ? nameA : nameB) ?? 'Coordinate libere'}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <SiteEditor key={`site-${active}-${site.latDeg}-${site.lonEastDeg}`} k={active} />
      <PeriodEditor k={active} />

      <section className="panel-section">
        <RunStatus k={active} onRetry={() => void runScenario(active)} />
      </section>

      <DataQuality k={active} />

      <footer className="panel-footer">
        <p>
          Fonte dati: <strong>{provider.label}</strong>. Strumento indipendente, non approvato dalla NASA.
        </p>
      </footer>
    </aside>
  )
}
