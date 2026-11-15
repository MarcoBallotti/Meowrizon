import { useState } from 'react'
import { DEFAULT_MISSION, missionIssue, type MissionProfile, type PowerProfile } from '../domain/mission'
import { setMission, useStore } from '../state/store'
import { Button, Field, Input, Toggle } from '../ui'

type LimitKey = Exclude<keyof MissionProfile, 'power'>
const LIMITS: { key: LimitKey; label: string; unit: string; scale?: number; optional?: boolean; max?: number }[] = [
  { key: 'minSunFraction', label: 'Minimum sunlight', unit: '%', scale: 100, max: 100 },
  { key: 'minEarthFraction', label: 'Minimum Earth visibility', unit: '%', scale: 100, max: 100 },
  { key: 'minBothFraction', label: 'Minimum simultaneous visibility', unit: '%', scale: 100, max: 100 },
  { key: 'maxSunOutageH', label: 'Maximum Sun outage', unit: 'h', optional: true },
  { key: 'maxEarthOutageH', label: 'Maximum Earth outage', unit: 'h', optional: true },
  { key: 'minJointWindowH', label: 'Minimum continuous shared window', unit: 'h', optional: true },
  { key: 'maxSlopeDeg', label: 'Maximum local slope', unit: '°', optional: true, max: 90 },
  { key: 'maxRoughnessM', label: 'Maximum surface residual RMS', unit: 'm', optional: true },
  { key: 'maxDemPixelM', label: 'Maximum horizon DEM pixel size', unit: 'm', optional: true },
  { key: 'eventMarginMinutes', label: 'Allowance at each event boundary', unit: 'min' },
]
const POWER: { key: Exclude<keyof PowerProfile, 'enabled'>; label: string; unit: string; scale?: number; max?: number }[] = [
  { key: 'arrayPowerW', label: 'Net array output at 1 AU', unit: 'W' },
  { key: 'loadW', label: 'Continuous electrical load', unit: 'W' },
  { key: 'batteryWh', label: 'Battery capacity', unit: 'Wh' },
  { key: 'initialCharge', label: 'Initial battery charge', unit: '%', scale: 100, max: 100 },
  { key: 'reserveCharge', label: 'Minimum battery reserve', unit: '%', scale: 100, max: 100 },
  { key: 'chargeEfficiency', label: 'Charging efficiency', unit: '%', scale: 100, max: 100 },
  { key: 'dischargeEfficiency', label: 'Discharging efficiency', unit: '%', scale: 100, max: 100 },
]

export function MissionControls() {
  const saved = useStore(s => s.mission)
  const [draft, setDraft] = useState(() => structuredClone(saved))
  const [message, setMessage] = useState('')
  const issue = missionIssue(draft)
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft)
  return <details className="mission-settings" onToggle={e => {
    if (e.currentTarget.open) { setDraft(structuredClone(saved)); setMessage('') }
  }}>
    <summary>Mission requirements</summary>
    <form onSubmit={e => {
      e.preventDefault()
      if (issue) return
      setMission(structuredClone(draft))
      setMessage('Requirements applied. Completed measurements are reused; changing the sunlight screen reevaluates skipped sites.')
    }}>
      <p className="ui-small ui-muted">The selected date and duration define the mission window. Blank limits are disabled. Defaults are starting values for this tool, not NASA requirements.</p>
      <div className="mission-fields">
        {LIMITS.map(f => <Field key={f.key} label={f.label} htmlFor={`mission-${f.key}`}>
          <Input id={`mission-${f.key}`} type="number" min={0} max={f.max} step="any" inputSize="s" unit={f.unit}
            required={!f.optional} placeholder={f.optional ? 'No limit' : undefined}
            value={draft[f.key] === null || !Number.isFinite(draft[f.key]) ? '' : draft[f.key]! * (f.scale ?? 1)}
            onChange={e => setDraft({ ...draft, [f.key]: e.target.value === '' ? (f.optional ? null : NaN) : Number(e.target.value) / (f.scale ?? 1) })} />
        </Field>)}
      </div>
      <p className="ui-small ui-muted">Slope and surface residuals describe a 100 m patch. Rocks, landing-footprint hazards and uncertainty in the terrain are not resolved by this fit. The event allowance is an operating margin, not an error estimate.</p>
      <Toggle checked={draft.power.enabled} onChange={enabled => setDraft({ ...draft, power: { ...draft.power, enabled } })}>Check energy and battery reserve</Toggle>
      {draft.power.enabled && <>
        <p className="ui-small ui-muted">Illustrative starting parameters: enter your vehicle values. The model assumes an ideal Sun-tracking array, constant load, and the supplied net output and efficiencies. It uses visible solar-disc fractions and Sun distance, including terrain shadows and eclipses. Thermal limits, degradation and brief events between samples need separate analysis.</p>
        <div className="mission-fields">
          {POWER.map(f => <Field key={f.key} label={f.label} htmlFor={`power-${f.key}`}>
            <Input id={`power-${f.key}`} type="number" min={0} max={f.max} step="any" required inputSize="s" unit={f.unit}
              value={Number.isFinite(draft.power[f.key]) ? draft.power[f.key] * (f.scale ?? 1) : ''}
              onChange={e => setDraft({ ...draft, power: { ...draft.power, [f.key]: e.target.value === '' ? NaN : Number(e.target.value) / (f.scale ?? 1) } })} />
          </Field>)}
        </div>
      </>}
      {issue && <p className="ui-field-error" role="alert">{issue}</p>}
      <div className="mission-actions">
        <Button type="submit" size="s" disabled={!!issue || !dirty}>Apply requirements</Button>
        <Button type="button" size="s" onClick={() => setDraft(structuredClone(DEFAULT_MISSION))}>Reset draft</Button>
      </div>
      {message && <p className="ui-small" role="status">{message}</p>}
    </form>
  </details>
}
