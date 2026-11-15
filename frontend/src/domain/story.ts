/**
 * Words for each audience. The same fact, said three ways:
 * students get a sentence, teachers get the sentence plus the number,
 * planners get the number with its unit and timestamp.
 */
import type { BodyAtTime } from './sampling'
import { EARTH_DIAMETER_DEG, SUN_DIAMETER_DEG, type Span } from './sky'
import { formatAngle, formatFriendlyDuration, formatUtcShort } from './format'

export type Body = 'sun' | 'earth'

export const BODY_NAME: Record<Body, string> = { sun: 'Sun', earth: 'Earth' }
export const BODY_TOPIC: Record<Body, string> = { sun: 'Power', earth: 'Calling home' }

export function headline(body: Body, span: Span, now: number): string {
  if (span.on) {
    if (span.untilMs === null) return body === 'sun' ? 'Sunlight all period' : 'Radio link all period'
    const left = formatFriendlyDuration(span.untilMs - now)
    return body === 'sun' ? `${cap(left)} of sunlight left` : `${cap(left)} of radio link left`
  }
  if (span.untilMs === null) return body === 'sun' ? 'No sunlight this period' : 'No direct link this period'
  const wait = formatFriendlyDuration(span.untilMs - now)
  return body === 'sun' ? `Dark for ${wait} more` : `No link for ${wait} more`
}

/** How high above (or below) the hills, measured in the body's own width. */
export function heightInWidths(body: Body, at: BodyAtTime): string {
  const margin = at.elevationDeg - at.horizonDeg
  const width = body === 'sun' ? SUN_DIAMETER_DEG : EARTH_DIAMETER_DEG
  const n = Math.abs(margin) / width
  const name = BODY_NAME[body]
  const count = n < 0.75 ? 'less than one' : n < 1.5 ? 'about one' : `about ${Math.round(n)}`
  const unit = n < 1.5 ? `${name}-width` : `${name}-widths`
  return margin >= 0 ? `${count} ${unit} above the hills` : `${count} ${unit} below the hills`
}

export function studentLine(body: Body, at: BodyAtTime): string {
  if (body === 'sun') {
    return at.visible
      ? `The Sun is in view. It sits ${heightInWidths('sun', at)}.`
      : 'The Sun is mostly hidden by the hills, so solar generation may be limited.'
  }
  return at.visible
    ? 'Earth is in view, which makes a direct radio link geometrically possible.'
    : 'Earth is behind the hills. Radio waves need a clear line, so the lander must wait.'
}

export function teacherLine(body: Body, at: BodyAtTime, span: Span): string {
  const margin = at.elevationDeg - at.horizonDeg
  const where = `${formatAngle(Math.abs(margin))} ${margin >= 0 ? 'above' : 'below'} the hills`
  const change = span.untilMs === null ? 'No change in this period.' : `${span.on ? (body === 'sun' ? 'Sunset' : 'Earthset') : body === 'sun' ? 'Sunrise' : 'Earthrise'} on ${formatUtcShort(span.untilMs)} UTC.`
  return `${BODY_NAME[body]} is ${where}. ${change}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export interface Prompt {
  title: string
  body: string
}

/** Discussion prompts for the class, picked from the current sky. */
export function classPrompts(sun: BodyAtTime, earth: BodyAtTime): Prompt[] {
  const out: Prompt[] = []
  if (!sun.visible && sun.elevationDeg > 0) {
    out.push({
      title: 'Ask the class',
      body: 'The Sun is above the flat horizon but we cannot see it. What is in the way?',
    })
  } else if (sun.visible) {
    out.push({
      title: 'Ask the class',
      body: `The Sun is only ${formatAngle(sun.elevationDeg)} high. How long would a shadow of a 1 m stick be?`,
    })
  } else {
    out.push({
      title: 'Ask the class',
      body: 'It is dark here now. Will the Sun come back from the same direction it left?',
    })
  }
  out.push({
    title: 'Notice',
    body: earth.visible
      ? 'Earth barely moves in the lunar sky. Watch it while you press play: it wobbles, but stays put.'
      : 'Earth never sets like the Sun does. It only hides when a hill sits in front of it.',
  })
  return out
}
