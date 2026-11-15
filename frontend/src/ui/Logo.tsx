import { useId } from 'react'

interface MarkProps {
  size?: number
  /** `light` for light grounds, `dark` inside the space window. */
  tone?: 'light' | 'dark'
}

/** Craters on the lunar cap: centre, half-width, half-height (foreshortened near the limb). */
const CRATERS: [number, number, number, number][] = [
  [13, 39.5, 3.8, 2.4],
  [27.5, 35.6, 3, 1.6],
  [35.5, 41.6, 4.2, 2.6],
  [21.5, 43.6, 2.2, 1.4],
  [6.5, 44.6, 1.8, 1.1],
  [41.8, 36.8, 1.6, 0.9],
]

/**
 * Twin suns over the Moon, after the Tatooine sunset. Seen from the Moon the
 * Earth is about four times wider than the Sun, so the large disc is the Earth
 * (blue) and the small one the Sun (amber), as everywhere in the app. Below
 * them, the curved edge of a grey, cratered Moon. No background, flat shapes
 * only: no gradients, no glow.
 */
export function MoonriseMark({ size = 44, tone = 'light' }: MarkProps) {
  const id = useId()
  const moonClip = id + 'moon'
  const light = tone === 'light'
  const regolith = light ? '#8a8fa0' : 'var(--space-ink-2)'
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <defs>
        <clipPath id={moonClip}>
          <rect x="0" y="0" width="48" height="46" />
        </clipPath>
      </defs>
      {/* The Sun, small and high; the Earth, large, well clear of the horizon */}
      <circle cx="12.5" cy="8" r="4" fill="var(--sun)" />
      <circle cx="30" cy="16.5" r="7.5" fill="var(--earth)" />
      {/* The Moon: the top of a large grey disc, with craters (lit rim, dark floor) */}
      <g clipPath={`url(#${moonClip})`}>
        <circle cx="24" cy="66" r="36" fill={regolith} />
        {CRATERS.map(([x, y, rx, ry]) => (
          <g key={`${x},${y}`}>
            <ellipse cx={x} cy={y} rx={rx} ry={ry} fill="#fff" opacity="0.3" />
            <ellipse cx={x + rx * 0.12} cy={y + ry * 0.15} rx={rx * 0.78} ry={ry * 0.72} fill="#000" opacity="0.26" />
          </g>
        ))}
      </g>
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
      <MoonriseMark size={size} tone={tone} />
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
