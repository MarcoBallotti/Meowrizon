import { ArrowLeft, ArrowRight, ChevronLeft, ChevronsLeft, ChevronsRight, Download, Pause, Play } from 'lucide-react'
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

/** Compact back control: a chevron that reveals its label on hover or focus. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ui-back" onClick={onClick} aria-label={label} title={label}>
      <ChevronLeft size={24} strokeWidth={1.75} aria-hidden="true" />
      <span className="ui-back-label" aria-hidden="true">
        {label}
      </span>
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

/* Line icons: all from Lucide, one stroke width. */

const ICON = { size: 20, strokeWidth: 1.75, 'aria-hidden': true } as const

export const PlayIcon = () => <Play {...ICON} />
export const PauseIcon = () => <Pause {...ICON} />
export const BackIcon = () => <ArrowLeft {...ICON} />
export const ArrowIcon = () => <ArrowRight {...ICON} />
export const StepBackIcon = () => <ChevronsLeft {...ICON} />
export const StepForwardIcon = () => <ChevronsRight {...ICON} />
export const DownloadIcon = () => <Download {...ICON} />
