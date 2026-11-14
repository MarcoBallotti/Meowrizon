import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

/* ---------------------------------------------------------------- segmented */

export interface SegmentOption<T extends string | number> {
  value: T
  label: ReactNode
  title?: string
}

interface SegmentedProps<T extends string | number> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
  size?: 's' | 'm'
  tone?: 'card' | 'sunk' | 'on-dark'
}

/** Pill switch for 2–4 mutually exclusive choices. */
export function Segmented<T extends string | number>({ options, value, onChange, label, size = 'm', tone = 'card' }: SegmentedProps<T>) {
  const cls = ['ui-segmented', size === 's' && 'is-s', tone === 'sunk' && 'is-sunk', tone === 'on-dark' && 'is-on-dark']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className="ui-segment"
          aria-pressed={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------------------------------------- field */

interface FieldProps {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div className="ui-field">
      <label className="ui-field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="ui-field-hint">{hint}</p>
      )}
    </div>
  )
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  inputSize?: 's' | 'm'
  data?: boolean
  unit?: string
}

export function Input({ inputSize = 'm', data = false, unit, className, ...rest }: InputProps) {
  const input = <input className={['ui-input', inputSize === 's' && 'is-s', data && 'is-data', className].filter(Boolean).join(' ')} {...rest} />
  if (!unit) return input
  return (
    <span className="ui-input-unit">
      {input}
      <span>{unit}</span>
    </span>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  inputSize?: 's' | 'm'
}

export function Select({ inputSize = 'm', className, children, ...rest }: SelectProps) {
  return (
    <select className={['ui-input', inputSize === 's' && 'is-s', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  )
}

/* ---------------------------------------------------------------- toggle */

interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  onDark?: boolean
}

export function Toggle({ checked, onChange, children, onDark = false }: ToggleProps) {
  return (
    <label className={`ui-toggle${onDark ? ' is-on-dark' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="ui-toggle-track" aria-hidden="true" />
      <span>{children}</span>
    </label>
  )
}

/* ---------------------------------------------------------------- site tile */

interface SiteTileProps {
  name: string
  meta?: ReactNode
  selected: boolean
  onSelect: () => void
}

/** Big tappable place button. Selected = indigo border on soft indigo. */
export function SiteTile({ name, meta, selected, onSelect }: SiteTileProps) {
  return (
    <button type="button" className="ui-site-tile" aria-pressed={selected} onClick={onSelect}>
      <span>{name}</span>
      {meta && <span className="ui-site-tile-meta">{meta}</span>}
    </button>
  )
}
