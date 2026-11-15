/**
 * Date and time picker built for scrolling through time: a strip of days that
 * moves with the mouse wheel or trackpad, an hour (and minute) that scrolls
 * the same way, and a month grid for long jumps. All times are UTC.
 */
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'

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
      // A mouse wheel sends one big delta per notch: one notch, one step.
      if (e.deltaMode === 1 || Math.abs(d) >= 50) {
        acc = 0
        stepRef.current(d > 0 ? 1 : -1)
        return
      }
      acc += d
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

/* ------------------------------------------------------------------ time field */

interface TimeFieldProps {
  value: number
  max: number
  label: string
  onStep: (dir: 1 | -1) => void
  onSet: (n: number) => void
  /** Called once two digits have been typed, to move on to the next field. */
  onFilled?: () => void
  inputRef?: Ref<HTMLInputElement>
}

/**
 * Two digits you can type, scroll or step with the arrow keys. What you type
 * is kept as a draft and applied on the second digit, on Enter or on leaving
 * the field; a value out of range is dropped and the field shows the time again.
 */
function TimeField({ value, max, label, onStep, onSet, onFilled, inputRef }: TimeFieldProps) {
  const [el, setEl] = useState<HTMLInputElement | null>(null)
  const [draft, setDraftState] = useState<string | null>(null)
  // Mirrors `draft` for handlers that run before the next render (blur fired by a focus move).
  const draftRef = useRef<string | null>(null)
  const setDraft = (text: string | null) => {
    draftRef.current = text
    setDraftState(text)
  }
  useWheelSteps(el, onStep)

  const commit = () => {
    const text = draftRef.current
    setDraft(null)
    if (text === null || text === '') return
    const n = Number(text)
    if (Number.isInteger(n) && n >= 0 && n <= max) onSet(n)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      setDraft(null)
      onStep(e.key === 'ArrowUp' ? 1 : -1)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      commit()
      e.currentTarget.blur()
    } else if (e.key === 'Escape') {
      setDraft(null)
      e.currentTarget.blur()
    }
  }
  const setRefs = (node: HTMLInputElement | null) => {
    setEl(node)
    if (typeof inputRef === 'function') inputRef(node)
    else if (inputRef) (inputRef as { current: HTMLInputElement | null }).current = node
  }

  return (
    <input
      ref={setRefs}
      className="ui-dial-spin"
      type="text"
      inputMode="numeric"
      autoComplete="off"
      maxLength={2}
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      value={draft ?? pad(value)}
      title="Type, scroll or use the arrow keys"
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, 2)
        setDraft(digits)
        if (digits.length === 2) {
          commit()
          onFilled?.()
        }
      }}
      onBlur={commit}
      onKeyDown={onKey}
    />
  )
}

/* ------------------------------------------------------------------ month grid */

interface MonthGridProps {
  value: number
  onPick: (dayMs: number) => void
  onClose?: () => void
  /** Part of the page instead of a popover: no outside-click close, no Close button. */
  inline?: boolean
}

function MonthGrid({ value, onPick, onClose, inline = false }: MonthGridProps) {
  const d = new Date(value)
  const [month, setMonth] = useState({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  const ref = useRef<HTMLDivElement>(null)
  const first = Date.UTC(month.y, month.m, 1)
  const daysIn = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate()
  const lead = (new Date(first).getUTCDay() + 6) % 7
  const selected = dayStart(value)
  const today = dayStart(Date.now())
  const shift = (k: number) => setMonth((p) => ({ y: p.y + Math.floor((p.m + k) / 12), m: (((p.m + k) % 12) + 12) % 12 }))

  // Inline, the calendar follows the value when it moves to another month (strip, wheel, Today).
  const shownMonth = `${d.getUTCFullYear()}-${d.getUTCMonth()}`
  useEffect(() => {
    if (!inline) return
    const [y, m] = shownMonth.split('-').map(Number)
    setMonth({ y, m })
  }, [inline, shownMonth])

  useEffect(() => {
    if (inline || !onClose) return
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
  }, [inline, onClose])

  return (
    <div ref={ref} className={`ui-dial-month${inline ? ' is-inline' : ''}`} role={inline ? 'group' : 'dialog'} aria-label="Choose a day">
      <div className="ui-dial-month-head">
        <button type="button" className="ui-dial-icon" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft {...ICON} />
        </button>
        <span className="ui-dial-month-title">
          {MONTHS[month.m]} {month.y}
        </span>
        {inline && (
          <button type="button" className="ui-dial-link" onClick={() => onPick(today)}>
            Today
          </button>
        )}
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
      {!inline && (
        <div className="ui-dial-month-foot">
          <button type="button" className="ui-dial-link" onClick={() => onPick(today)}>
            Today
          </button>
          <button type="button" className="ui-dial-link" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </div>
  )
}

/** A month calendar laid out in the page; picking a day keeps the time of day. */
export function MonthCalendar({ value, onChange }: { value: number; onChange: (ms: number) => void }) {
  const timeOfDay = value - dayStart(value)
  return <MonthGrid value={value} inline onPick={(dayMs) => onChange(dayMs + timeOfDay)} />
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
  /** Same day, the typed hour and minute. */
  const setTime = (h: number, m: number) => {
    latest.current = dayStart(latest.current) + h * HOUR + m * MIN
    onChange(latest.current)
  }
  const minuteRef = useRef<HTMLInputElement>(null)
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
          <TimeField
            value={d.getUTCHours()}
            max={23}
            label="Hour, UTC"
            onStep={(dir) => shiftBy(dir * HOUR)}
            onSet={(h) => setTime(h, new Date(latest.current).getUTCMinutes())}
            onFilled={minutes ? () => minuteRef.current?.focus() : undefined}
          />
          <span aria-hidden="true">:</span>
          {minutes ? (
            <TimeField
              inputRef={minuteRef}
              value={d.getUTCMinutes()}
              max={59}
              label="Minutes, UTC"
              onStep={(dir) => shiftBy(dir * 5 * MIN)}
              onSet={(m) => setTime(new Date(latest.current).getUTCHours(), m)}
            />
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
          {/* The seven days sit in their own grid so they line up with the row above. */}
          <div className="ui-dial-days">
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
          </div>
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
