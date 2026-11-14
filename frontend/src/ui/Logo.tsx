import { useId } from 'react'

interface MarkProps {
  size?: number
  /** `light` for light grounds, `dark` inside the space window. */
  tone?: 'light' | 'dark'
}

/**
 * The moon-cat: a disc with two ears whose shadow leaves an amber crescent.
 * Ears and shadow share one colour so the silhouette reads as a single shape.
 */
export function MoonCatMark({ size = 44, tone = 'light' }: MarkProps) {
  const clip = useId()
  const shadow = tone === 'light' ? 'var(--ink)' : 'var(--space-ink)'
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <defs>
        <clipPath id={clip}>
          <circle cx="24" cy="27" r="16" />
        </clipPath>
      </defs>
      <path d="M10 20 L11 5 L22 13 Z" fill={shadow} />
      <path d="M38 20 L37 5 L26 13 Z" fill={shadow} />
      <circle cx="24" cy="27" r="16" fill="var(--sun)" />
      <circle cx="20.5" cy="30" r="16.6" fill={shadow} clipPath={`url(#${clip})`} />
    </svg>
  )
}

interface LogoProps extends MarkProps {
  /** Hide the wordmark, keep the accessible name. */
  markOnly?: boolean
  href?: string
}

export function Logo({ size = 44, tone = 'light', markOnly = false, href }: LogoProps) {
  const content = (
    <>
      <MoonCatMark size={size} tone={tone} />
      {markOnly ? (
        <span className="sr-only">Meowrizon</span>
      ) : (
        <span className="ui-logo-word" style={{ fontSize: size * 0.64 }}>
          Meowrizon
        </span>
      )}
    </>
  )
  return href ? (
    <a className="ui-logo" href={href}>
      {content}
    </a>
  ) : (
    <span className="ui-logo">{content}</span>
  )
}
