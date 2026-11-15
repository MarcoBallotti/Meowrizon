interface MarkProps {
  size?: number
  /** `light` for light grounds, `dark` inside the space window. */
  tone?: 'light' | 'dark'
}

/**
 * The dome-cat: a dome with two ears resting on the horizon, with twin suns
 * setting to its right. Dome, ears and horizon share one colour so the
 * silhouette reads as a single shape; the small upper sun is ochre, the
 * larger lower one sky blue.
 */
export function DomeCatMark({ size = 44, tone = 'light' }: MarkProps) {
  const ink = tone === 'light' ? 'var(--ink)' : 'var(--space-ink)'
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M6.5 31 L7.5 18 L15 26.5 Z" fill={ink} />
      <path d="M25.5 31 L24.5 18 L17 26.5 Z" fill={ink} />
      <path d="M4 38 A12 12 0 0 1 28 38 Z" fill={ink} />
      <path d="M3 38 H45" stroke={ink} strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="33" cy="14" r="4" fill="var(--sun)" />
      <circle cx="40.5" cy="26.5" r="5" fill="var(--earth-sky)" />
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
      <DomeCatMark size={size} tone={tone} />
      {markOnly ? (
        <span className="sr-only">Moonrizon</span>
      ) : (
        <span className="ui-logo-word" style={{ fontSize: size * 0.64 }}>
          Moonrizon
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
