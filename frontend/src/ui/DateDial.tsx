/**
 * Date and time picker built for scrolling through time: a strip of days that
 * moves with the mouse wheel or trackpad, an hour (and minute) that scrolls
 * the same way, and a month grid for long jumps. All times are UTC.
 */
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'

const DAY = 86_400_000
const HOUR = 3_600_000
const MIN = 60_000
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const
/** Wheel distance (px) for one step; trackpads send many small deltas. */
const WHEEL_STEP = 40

const pad = (n: number) => String(n).padStart(2, '0')
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY

function longDate(ms: number): string {
  const d = new Date(ms)
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`
}

/** Calls `step(±1)` for every WHEEL_STEP of wheel or trackpad travel over `el`. */
function useWheelSteps(el: HTMLElement | null, step: (dir: 1 | -1) => void) {
  const stepRef = useRef(step)
  useEffect(() => {
    stepRef.current = step
  })
  useEffect(() => {
    if (!el) return
    let acc = 0
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      acc += e.deltaMode === 1 ? d * 16 : d
      while (acc >= WHEEL_STEP) {
        acc -= WHEEL_STEP
        stepRef.current(1)
      }
      while (acc <= -WHEEL_STEP) {
        acc += WHEEL_STEP
        stepRef.current(-1)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [el])
}

/* ------------------------------------------------------------------ spin field */

function Spin({ value, label, onStep, children }: { value: number; label: string; onStep: (dir: 1 | -1) => void; children: ReactNode }) {
  const [el, setEl] = useState<HTMLSpanElement | null>(null)
  useWheelSteps(el, onStep)
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowUp') onStep(1)
    else if (e.key === 'ArrowDown') onStep(-1)
    else return
    e.preventDefault()
  }
  return (
    <span ref={setEl} className="ui-dial-spin" role="spinbutton" tabIndex={0} aria-label={label} aria-valuenow={value} onKeyDown={onKey} title="Scroll or use the arrow keys">
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ month grid */

function MonthGrid({ value, onPick, onClose }: { value: number; onPick: (dayMs: number) => void; onClose: () => void }) {
  const d = new Date(value)
  const [month, setMonth] = useState({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  const ref = useRef<HTMLDivElement>(null)
  const first = Date.UTC(month.y, month.m, 1)
  const daysIn = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate()
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const selected = dayStart(value)
  const today = dayStart(Date.now())
  const shift = (k: number) => setMonth((p) => ({ y: p.y + Math.floor((p.m + k) / 12), m: (((p.m + k) % 12) + 12) % 12 }))

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div ref={ref} className="ui-dial-month" role="dialog" aria-label="Choose a day">
      <div className="ui-dial-month-head">
        <button type="button" className="ui-dial-icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft {...ICON} />
        </button>
        <span className="ui-dial-month-title">
          {MONTHS[month.m]} {month.y}
        </span>
        <button type="button" className="ui-dial-icon" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight {...ICON} />
        </button>
      </div>
      <div className="ui-dial-month-grid">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => (
          <span key={w} className="ui-dial-month-dow">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: daysIn }, (_, i) => {
          const ms = first + i * DAY
          return (
            <button
              key={ms}
              type="button"
              className={`ui-dial-month-day${ms === today ? ' is-today' : ''}`}
              aria-pressed={ms === selected}
              onClick={() => onPick(ms)}
            >
              {i + 1}
            </button>
          )
        })}
      </div>
      <div className="ui-dial-month-foot">
        <button type="button" className="ui-dial-link" onClick={() => onPick(today)}>
          Today
        </button>
        <button type="button" className="ui-dial-link" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ dial */

interface DateDialProps {
  /** UTC epoch milliseconds. */
  value: number
  onChange: (ms: number) => void
  label: string
  /** Show and scroll minutes (5-minute steps); otherwise whole hours. */
  minutes?: boolean
  /** Show the strip of days under the date. */
  strip?: boolean
}

export function DateDial({ value, onChange, label, minutes = false, strip = true }: DateDialProps) {
  const [open, setOpen] = useState(false)
  const [stripEl, setStripEl] = useState<HTMLDivElement | null>(null)
  const [dateEl, setDateEl] = useState<HTMLButtonElement | null>(null)
  const d = new Date(value)
  const timeOfDay = value - dayStart(value)
  // Several wheel steps can land before the next render: chain them on the latest value.
  const latest = useRef(value)
  useEffect(() => {
    latest.current = value
  }, [value])
  const shiftBy = (ms: number) => {
    latest.current += ms
    onChange(latest.current)
  }
  const moveDays = (k: number) => shiftBy(k * DAY)
  useWheelSteps(stripEl, (dir) => moveDays(dir))
  useWheelSteps(dateEl, (dir) => moveDays(dir))

  const onStripKey = (e: KeyboardEvent) => {
    const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : e.key === 'PageDown' ? 7 : e.key === 'PageUp' ? -7 : 0
    if (!k) return
    e.preventDefault()
    moveDays(k)
  }

  const visible = Array.from({ length: 7 }, (_, i) => dayStart(value) + (i - 3) * DAY + timeOfDay)

  return (
    <div className="ui-dial" role="group" aria-label={label}>
      <div className="ui-dial-head">
        {!strip && (
          <button type="button" className="ui-dial-icon" onClick={() => moveDays(-1)} aria-label="Previous day">
            <ChevronLeft {...ICON} />
          </button>
        )}
        <button
          ref={setDateEl}
          type="button"
          className="ui-dial-date"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          title="Scroll to change the day, click for the month"
        >
          <CalendarDays {...ICON} />
          {longDate(value)}
        </button>
        {!strip && (
          <button type="button" className="ui-dial-icon" onClick={() => moveDays(1)} aria-label="Next day">
            <ChevronRight {...ICON} />
          </button>
        )}
        <span className="ui-dial-time">
          <Spin value={d.getUTCHours()} label="Hour, UTC" onStep={(dir) => shiftBy(dir * HOUR)}>
            {pad(d.getUTCHours())}
          </Spin>
          <span aria-hidden="true">:</span>
          {minutes ? (
            <Spin value={d.getUTCMinutes()} label="Minutes" onStep={(dir) => shiftBy(dir * 5 * MIN)}>
              {pad(d.getUTCMinutes())}
            </Spin>
          ) : (
            <span className="ui-dial-fixed">{pad(d.getUTCMinutes())}</span>
          )}
          <span className="ui-dial-utc">UTC</span>
        </span>
      </div>

      {strip && (
        <div ref={setStripEl} className="ui-dial-strip" onKeyDown={onStripKey} title="Scroll sideways or up and down to move through the days">
          <button type="button" className="ui-dial-icon" onClick={() => moveDays(-1)} aria-label="Previous day">
            <ChevronLeft {...ICON} />
          </button>
          {visible.map((ms) => {
            const day = new Date(ms)
            const sel = ms === value
            return (
              <button key={ms} type="button" className="ui-dial-day" aria-pressed={sel} aria-label={longDate(ms)} onClick={() => onChange(ms)}>
                <span className="ui-dial-dow">{day.getUTCDate() === 1 ? MONTHS[day.getUTCMonth()].slice(0, 3) : WEEKDAYS[day.getUTCDay()]}</span>
                <span className="ui-dial-num">{day.getUTCDate()}</span>
              </button>
            )
          })}
          <button type="button" className="ui-dial-icon" onClick={() => moveDays(1)} aria-label="Next day">
            <ChevronRight {...ICON} />
          </button>
        </div>
      )}

      {open && (
        <MonthGrid
          value={value}
          onPick={(dayMs) => {
            onChange(dayMs + timeOfDay)
            setOpen(false)
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}
