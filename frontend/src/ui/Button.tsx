import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'quiet' | 'inverse'
type Size = 's' | 'm' | 'l'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Leading numbered badge, for the step-by-step call to action. */
  step?: number
  icon?: ReactNode
  block?: boolean
  pill?: boolean
}

/**
 * One primary button per view: indigo with white text. Secondary is an ink
 * outline. Quiet is a white button for use on the grey ground.
 */
export function Button({
  variant = 'primary',
  size = 'm',
  step,
  icon,
  block = false,
  pill = false,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const cls = ['ui-button', `is-${variant}`, `is-${size}`, block && 'is-block', pill && 'is-pill', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {step !== undefined && <span className={`ui-step${variant === 'primary' ? ' is-inverse' : ''}`}>{step}</span>}
      {icon}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  variant?: 'primary' | 'secondary'
  size?: 's' | 'm'
  children: ReactNode
}

export function IconButton({ variant = 'primary', size = 'm', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button type={type} className={['ui-icon-button', `is-${variant}`, `is-${size}`, className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  )
}

export function StepBadge({ n, inverse = false }: { n: number; inverse?: boolean }) {
  return (
    <span className={`ui-step${inverse ? ' is-inverse' : ''}`} aria-hidden="true">
      {n}
    </span>
  )
}

/* Icons drawn on a 24-unit grid, 2.5 stroke, round caps. */

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4l12 8-12 8z" fill="currentColor" />
    </svg>
  )
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 4v16M16 4v16" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StepBackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M13 6l-6 6 6 6M19 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function StepForwardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11 6l6 6-6 6M5 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
