/**
 * Dialog to choose two to four sites for the compare screen. Each row
 * previews the site's skyline (hover for direction and height) and its
 * sunlight share when the ranking has measured it.
 */
import { Plus, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { SiteCoordinates } from '../api/types'
import { compassWord, formatAngle, formatLat, formatLon, formatUtcDate } from '../domain/format'
import { horizonAt } from '../domain/sky'
import { CUSTOM_SITE_NAME, normalizeLon, validateSite, type ExampleSite } from '../domain/sites'
import { loadSkylines, stopSkylines } from '../state/compareRunner'
import { COMPARE_MAX, getState, goTo, setState, siteKey, useStore, type CompareSite, type Skyline } from '../state/store'
import { Button } from '../ui'
import { currentCompareSite, SLOT_LETTERS } from './compareSlots'
import './compare.css'

const ICON = { size: 18, strokeWidth: 1.75, 'aria-hidden': true } as const

const SPARK_W = 120
const SPARK_H = 32
const SPARK_MID = 16
const SPARK_PX_PER_DEG = 4.5

function initialDraft(): CompareSite[] {
  const s = getState()
  if (s.screen === 'compare' && s.compareSites.length) return s.compareSites
  const current = currentCompareSite()
  if (s.compareSites[0]?.key === current.key) return s.compareSites
  return [current]
}

function asSlot(site: ExampleSite): CompareSite {
  return { key: siteKey(site), name: site.name, site: { latDeg: site.latDeg, lonEastDeg: site.lonEastDeg } }
}

/** Pixels per degree: 4.5 when the skyline fits, less for tall ridges so nothing is cut off. */
function sparkScale(sky: Skyline): number {
  let m = 0
  for (const v of sky.elevationDeg) m = Math.max(m, Math.abs(v))
  return m > 0 ? Math.min(SPARK_PX_PER_DEG, (SPARK_MID - 2) / m) : SPARK_PX_PER_DEG
}

function sparkPoints(sky: Skyline): string {
  const k = sparkScale(sky)
  const pts: string[] = []
  for (let i = 0; i <= SPARK_W; i++) {
    const v = horizonAt(sky, (i * 360) / SPARK_W)
    pts.push(`${i},${(SPARK_MID - v * k).toFixed(1)}`)
  }
  return pts.join(' ')
}

function peakOf(sky: Skyline): { az: number; el: number } {
  let best = 0
  for (let i = 1; i < sky.elevationDeg.length; i++) if (sky.elevationDeg[i] > sky.elevationDeg[best]) best = i
  return { az: sky.azimuthDeg[best], el: sky.elevationDeg[best] }
}

interface Hover {
  key: string
  name: string
  f: number
  clientX: number
  top: number
  bottom: number
}

export function ComparePicker() {
  const open = useStore((s) => s.pickerOpen)
  const sites = useStore((s) => s.sites)
  const skylines = useStore((s) => s.skylines)
  const ranking = useStore((s) => s.ranking)
  const regions = useStore((s) => s.regions)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)
  const currentKey = useStore((s) => siteKey(s.scenarios.A.input.site))
  const ref = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<CompareSite[]>([])
  const [query, setQuery] = useState('')
  const [lat, setLat] = useState('')
  const [lon, setLon] = useState('')
  const [customError, setCustomError] = useState<string | null>(null)
  const [hover, setHover] = useState<Hover | null>(null)

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) {
      setDraft(initialDraft())
      setQuery('')
      setCustomError(null)
      d.showModal()
      void loadSkylines(getState().sites.map((s) => ({ latDeg: s.latDeg, lonEastDeg: s.lonEastDeg })))
    } else if (!open && d.open) d.close()
    if (!open) stopSkylines()
  }, [open])

  const sunShare = useMemo(() => {
    const out = new Map<string, number>()
    for (const r of ranking?.regions ?? regions?.regions ?? []) out.set(siteKey(r.center), r.sunFraction)
    return out
  }, [ranking, regions])

  const full = draft.length >= COMPARE_MAX
  const chosen = new Set(draft.map((d) => d.key))
  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const out = new Map<string, ExampleSite[]>()
    for (const s of sites) {
      if (q && !s.name.toLowerCase().includes(q) && !s.region.toLowerCase().includes(q)) continue
      const list = out.get(s.region) ?? []
      list.push(s)
      out.set(s.region, list)
    }
    return [...out.entries()]
  }, [sites, q])

  const toggle = (site: ExampleSite) => {
    const key = siteKey(site)
    if (chosen.has(key)) setDraft((d) => d.filter((x) => x.key !== key))
    else if (!full) setDraft((d) => [...d, asSlot(site)])
  }
  const remove = (key: string) => setDraft((d) => d.filter((x) => x.key !== key))
  const addCustom = () => {
    const la = Number(lat)
    const lo = Number(lon)
    const issue = lat.trim() === '' || lon.trim() === '' ? 'Enter both latitude and longitude.' : validateSite(la, lo)
    if (issue) return setCustomError(issue)
    const site: SiteCoordinates = { latDeg: la, lonEastDeg: normalizeLon(lo) }
    const key = siteKey(site)
    if (chosen.has(key)) return setCustomError('This point is already in the comparison.')
    setDraft((d) => [...d, { key, name: `${CUSTOM_SITE_NAME} · ${formatLat(la, 2)}, ${formatLon(site.lonEastDeg, 2)}`, site }])
    setLat('')
    setLon('')
    setCustomError(null)
  }
  const close = () => setState({ pickerOpen: false })
  const confirm = () => {
    setState({ compareSites: draft, pickerOpen: false })
    if (getState().screen !== 'compare') goTo('compare')
  }

  const onSparkMove = (e: PointerEvent<SVGSVGElement>, key: string, name: string) => {
    if (e.pointerType === 'touch') return
    const r = e.currentTarget.getBoundingClientRect()
    setHover({ key, name, f: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), clientX: e.clientX, top: r.top, bottom: r.bottom })
  }

  const n = draft.length
  const message = n < 2 ? `${n} of ${COMPARE_MAX} selected. Pick at least two.` : full ? `${COMPARE_MAX} of ${COMPARE_MAX} selected. Remove one to add another.` : `${n} of ${COMPARE_MAX} selected.`
  const hoverSky = hover ? skylines[hover.key] : undefined

  return (
    <dialog ref={ref} className="hc-picker" aria-labelledby="hc-picker-title" onClose={close} onCancel={close}>
      <div className="hc-picker-head">
        <div className="hc-picker-title">
          <div>
            <h2 className="ui-title is-s" id="hc-picker-title">Compare horizons</h2>
            <p className="ui-small ui-muted">From {formatUtcDate(startMs)}, same period for every site</p>
          </div>
          <button type="button" className="hc-icon-btn" onClick={close} aria-label="Close">
            <X {...ICON} />
          </button>
        </div>
        <div className="hc-tray" aria-live="polite">
          {SLOT_LETTERS.map((L, i) => {
            const d = draft[i]
            if (!d) return <span key={L} className="hc-slot is-empty">{L} · add a site</span>
            return (
              <span key={L} className="hc-slot">
                <span className="hc-badge">{L}</span>
                <span className="hc-slot-name">{d.name.split(' · ')[0]}</span>
                <button type="button" onClick={() => remove(d.key)} aria-label={`Remove ${d.name}`}>
                  <X size={16} strokeWidth={1.75} aria-hidden="true" />
                </button>
              </span>
            )
          })}
        </div>
        <label className="hc-search">
          <Search {...ICON} />
          <span className="sr-only">Search sites</span>
          <input id="hc-search" type="search" placeholder="Search sites" autoComplete="off" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>

      <div className="hc-list" onScroll={() => setHover(null)}>
        {groups.map(([region, list]) => (
          <div key={region} role="group" aria-label={region}>
            <div className="hc-group">{region}</div>
            {list.map((s) => {
              const key = siteKey(s)
              const on = chosen.has(key)
              const off = full && !on
              const sky = skylines[key]
              const share = sunShare.get(key)
              return (
                <label key={s.id} className={`hc-row${off ? ' is-off' : ''}`}>
                  <input type="checkbox" id={`hc-${s.id}`} checked={on} disabled={off} onChange={() => toggle(s)} />
                  <span className="hc-row-name">
                    <b>{s.name}</b>
                    <span className="mono ui-muted">
                      {formatLat(s.latDeg, 2)} · {formatLon(s.lonEastDeg, 2)}
                      {key === currentKey && <span className="hc-here"> · current site</span>}
                    </span>
                  </span>
                  {sky ? (
                    <svg
                      className="hc-spark"
                      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
                      aria-hidden="true"
                      onPointerMove={(e) => onSparkMove(e, key, s.short || s.name)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <line x1={0} y1={SPARK_MID} x2={SPARK_W} y2={SPARK_MID} className="hc-spark-flat" />
                      <polyline points={sparkPoints(sky)} className="hc-spark-line" />
                      {hover?.key === key && (
                        <>
                          <line x1={hover.f * SPARK_W} x2={hover.f * SPARK_W} y1={0} y2={SPARK_H} className="hc-spark-cur" />
                          <circle cx={hover.f * SPARK_W} cy={SPARK_MID - horizonAt(sky, hover.f * 360) * sparkScale(sky)} r={2.5} className="hc-spark-dot" />
                        </>
                      )}
                    </svg>
                  ) : (
                    <span className="hc-spark is-loading" aria-hidden="true" />
                  )}
                  <span className="hc-lit mono">{share !== undefined ? `${Math.round(share * 100)}% lit` : ''}</span>
                </label>
              )
            })}
          </div>
        ))}
        {!groups.length && <div className="hc-group">{sites.length ? `No site matches "${query}"` : 'The site list is still loading.'}</div>}

        <div className="hc-group">{CUSTOM_SITE_NAME}</div>
        <div className="hc-custom">
          <input id="hc-lat" className="ui-input is-s is-data" inputMode="decimal" placeholder="Lat −85.30" aria-label="Latitude in degrees" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input id="hc-lon" className="ui-input is-s is-data" inputMode="decimal" placeholder="Lon 35.00" aria-label="East longitude in degrees" value={lon} onChange={(e) => setLon(e.target.value)} />
          <Button variant="secondary" size="s" icon={<Plus {...ICON} />} disabled={full} onClick={addCustom}>
            Add point
          </Button>
          {customError && <span className="hc-error" role="alert">{customError}</span>}
        </div>
      </div>

      <div className="hc-picker-foot">
        <span className="hc-msg">{message}</span>
        <Button variant="secondary" size="s" onClick={() => setDraft([currentCompareSite()])}>
          Clear
        </Button>
        <Button size="s" disabled={n < 2} onClick={confirm}>
          {n < 2 ? 'Compare' : `Compare ${n} sites`}
        </Button>
      </div>

      {hover && hoverSky && <SkylineTip hover={hover} sky={hoverSky} />}
    </dialog>
  )
}

function SkylineTip({ hover, sky }: { hover: Hover; sky: Skyline }) {
  const tip = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: hover.clientX + 16, top: hover.top - 96 })
  const az = hover.f * 360
  const v = horizonAt(sky, az)
  const peak = peakOf(sky)

  useEffect(() => {
    const el = tip.current
    if (!el) return
    const { offsetWidth: w, offsetHeight: h } = el
    let left = hover.clientX + 16
    if (left + w > window.innerWidth - 8) left = hover.clientX - w - 16
    let top = hover.top - h - 8
    if (top < 8) top = hover.bottom + 8
    setPos((p) => (p.left === left && p.top === top ? p : { left, top }))
  }, [hover])

  return (
    <div ref={tip} className="hc-tip" style={pos} role="tooltip">
      <b>{hover.name}</b>
      <span className="mono">
        {compassWord(az)} · {Math.round(az)}°
      </span>
      <span>{v >= 0 ? `Hills rise ${formatAngle(v, 2)} above flat` : `Ground drops ${formatAngle(-v, 2)} below flat`}</span>
      <span className="ui-muted">
        Highest ridge {formatAngle(peak.el, 2)} to the {compassWord(peak.az).toLowerCase()}
      </span>
    </div>
  )
}
