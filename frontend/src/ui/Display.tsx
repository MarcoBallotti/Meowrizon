import type { CSSProperties, ReactNode } from 'react'
import type { TimeInterval } from '../api/types'

/* ---------------------------------------------------------------- card */

interface CardProps {
  tone?: 'white' | 'dark' | 'sunk'
  tight?: boolean
  as?: 'div' | 'section' | 'article' | 'aside'
  className?: string
  style?: CSSProperties
  children: ReactNode
  'aria-label'?: string
}

export function Card({ tone = 'white', tight = false, as: Tag = 'div', className, children, ...rest }: CardProps) {
  const cls = ['ui-card', tone === 'dark' && 'is-dark', tone === 'sunk' && 'is-sunk', tight && 'is-tight', className].filter(Boolean).join(' ')
  return (
    <Tag className={cls} {...rest}>
      {children}
    </Tag>
  )
}

/* ---------------------------------------------------------------- story card */

interface StoryCardProps {
  eyebrow: string
  tone?: 'sun' | 'earth' | 'neutral'
  headline: ReactNode
  children?: ReactNode
  extra?: ReactNode
  dark?: boolean
}

/** One fact, said big: eyebrow names the topic, headline states it. */
export function StoryCard({ eyebrow, tone = 'neutral', headline, children, extra, dark = false }: StoryCardProps) {
  return (
    <Card tone={dark ? 'dark' : 'white'} as="article">
      <span className={`ui-story-eyebrow${tone !== 'neutral' ? ` is-${tone}` : ''}`}>{eyebrow}</span>
      <p className="ui-story-headline">{headline}</p>
      {children && <p className="ui-story-body">{children}</p>}
      {extra && <div className="ui-story-extra">{extra}</div>}
    </Card>
  )
}

/* ---------------------------------------------------------------- metric */

interface MetricProps {
  label: string
  value: ReactNode
  unit?: string
  detail?: ReactNode
  tone?: 'sun' | 'earth' | 'neutral'
}

export function Metric({ label, value, unit, detail, tone = 'neutral' }: MetricProps) {
  return (
    <div className={`ui-metric${tone !== 'neutral' ? ` is-${tone}` : ''}`}>
      <span className="ui-metric-label">{label}</span>
      <span className="ui-metric-value">
        {value}
        {unit && <span className="ui-metric-unit">{unit}</span>}
      </span>
      {detail && <span className="ui-metric-detail">{detail}</span>}
    </div>
  )
}

/* ---------------------------------------------------------------- delta */

interface DeltaProps {
  /** Difference now − before, in display units (percentage points, hours…). */
  value: number
  unit?: string
  /** Which direction is good news. */
  better?: 'higher' | 'lower'
  /** Optional reference, e.g. "vs Oct". */
  suffix?: string
}

/** Plain signed change next to a number: "+4", "−6 h vs Oct". */
export function Delta({ value, unit = '', better = 'higher', suffix }: DeltaProps) {
  const r = Math.round(value)
  const tone = r === 0 ? 'is-flat' : (r > 0) === (better === 'higher') ? 'is-up' : 'is-down'
  const text = `${r > 0 ? '+' : r < 0 ? '−' : ''}${Math.abs(r)}${unit}`
  return (
    <span className={`ui-delta ${tone}`}>
      {text}
      {suffix && <span className="ui-delta-suffix"> {suffix}</span>}
    </span>
  )
}

/* ---------------------------------------------------------------- chip */

interface ChipProps {
  tone?: 'sun' | 'earth' | 'both' | 'off' | 'demo' | 'danger' | 'neutral' | 'on-dark'
  icon?: ReactNode
  dot?: boolean
  children: ReactNode
  title?: string
}

export function Chip({ tone = 'neutral', icon, dot = false, children, title }: ChipProps) {
  return (
    <span className={`ui-chip is-${tone}`} title={title}>
      {dot && <span className="ui-chip-dot" aria-hidden="true" />}
      {icon}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- notice */

interface NoticeProps {
  tone?: 'demo' | 'info' | 'danger'
  children: ReactNode
}

export function Notice({ tone = 'info', children }: NoticeProps) {
  return (
    <div className={`ui-notice is-${tone}`} role={tone === 'danger' ? 'alert' : 'note'}>
      <div>{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- progress */

export function Progress({ value, label }: { value?: number; label: string }) {
  const indeterminate = value === undefined
  return (
    <div
      className={`ui-progress${indeterminate ? ' is-indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
    >
      <div className="ui-progress-bar" style={indeterminate ? undefined : { transform: `scaleX(${Math.max(0.04, value)})` }} />
    </div>
  )
}

/* ---------------------------------------------------------------- track bar */

interface TrackBarProps {
  intervals: TimeInterval[]
  startMs: number
  spanMs: number
  tone: 'sun' | 'earth' | 'both' | 'eclipse'
  size?: 's' | 'm'
  label: string
}

/** Visibility over time as filled spans on a pill track. */
export function TrackBar({ intervals, startMs, spanMs, tone, size = 'm', label }: TrackBarProps) {
  return (
    <div className={`ui-track is-${tone}${size === 's' ? ' is-s' : ''}`} role="img" aria-label={label}>
      {intervals.map((iv) => {
        const a = Math.max(0, (iv.startMs - startMs) / spanMs)
        const b = Math.min(1, (iv.endMs - startMs) / spanMs)
        if (b <= a) return null
        return <span key={iv.startMs} className="ui-track-span" style={{ left: `${a * 100}%`, width: `${Math.max(0.3, (b - a) * 100)}%` }} />
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- space window */

interface SpaceWindowProps {
  children: ReactNode
  className?: string
  style?: CSSProperties
  'aria-label'?: string
}

/** The one dark surface: wherever we look into space. */
export function SpaceWindow({ children, className, ...rest }: SpaceWindowProps) {
  return (
    <div className={['ui-space', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  )
}
