import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { C, DISPLAY, MONO, TEXT, f } from '../theme'
import { Headline, Stars, Word, clamp, easeInOut, easeOut, ridgePath, useHit } from '../kit'
import { DomeCat, Wordmark } from '../Logo'

const center = { justifyContent: 'center', alignItems: 'center' } as const

/** Beats 0–8: the hook. */
export function Hook() {
  const frame = useCurrentFrame()
  const rise = interpolate(frame, [0, f(8)], [0, 140], { ...clamp, easing: easeOut })
  const strike = interpolate(frame, [f(5), f(5) + 6], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Stars />
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <circle cx={960} cy={1080 + 1250 - rise} r={1300} fill={C.space2} />
      </svg>
      {frame < f(4) ? (
        <AbsoluteFill style={center}>
          <Headline size={156}>
            <Word at={0}>Landing</Word> <Word at={1}>on</Word> <Word at={2}>the</Word>{' '}
            <Word at={3} from="zoom" style={{ color: C.earthSky }}>
              Moon?
            </Word>
          </Headline>
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{ ...center, flexDirection: 'column', gap: 24 }}>
          <div style={{ position: 'relative', opacity: interpolate(strike, [0, 1], [1, 0.45]) }}>
            <Headline size={260}>
              <Word at={4} from="zoom">
                Easy.
              </Word>
            </Headline>
            <div style={{ position: 'absolute', left: -20, top: '54%', height: 20, borderRadius: 10, width: `calc(${strike * 100}% + 40px)`, background: C.red }} />
          </div>
          <Headline size={120}>
            <Word at={6}>Not at the</Word>{' '}
            <Word at={7} style={{ color: C.sun }}>
              south pole.
            </Word>
          </Headline>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  )
}

const earthDisc = (cx: number, cy: number, r: number) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill={C.earthSky} />
    <path d={`M${cx} ${cy - r} A${r} ${r} 0 0 1 ${cx} ${cy + r} A${r * 0.45} ${r} 0 0 0 ${cx} ${cy - r} Z`} fill={C.earthNight} />
  </g>
)

/** Beats 8–16: Sun and Earth drop behind the ridge. */
export function Problem() {
  const frame = useCurrentFrame()
  const sunT = interpolate(frame, [0, f(3.6)], [0, 1], { ...clamp, easing: easeInOut })
  const sunX = 380 + 820 * sunT
  const sunY = 330 + 470 * sunT * sunT
  const earthIn = useHit(3.5)
  const earthT = interpolate(frame, [f(4), f(6.8)], [0, 1], { ...clamp, easing: easeInOut })
  const earthY = 380 + 480 * earthT * earthT
  const sunEl = interpolate(sunT, [0, 1], [1.24, -0.82])
  const earthEl = interpolate(earthT, [0, 1], [0.61, -2.14])
  const day = interpolate(frame, [0, f(8)], [3.1, 9.6])
  const dark = interpolate(frame, [f(2.6), f(3.6)], [0, 0.35], clamp)
  const second = frame >= f(4)
  const read = (label: string, v: number, color: string) => (
    <div style={{ display: 'flex', gap: 24, alignItems: 'baseline' }}>
      <span style={{ color, width: 170 }}>{label}</span>
      <span style={{ color: v < 0 ? C.red : C.spaceInk, width: 170, textAlign: 'right' }}>
        {v >= 0 ? '+' : '−'}
        {Math.abs(v).toFixed(2)}°
      </span>
    </div>
  )
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Stars drift={0.05} />
      <AbsoluteFill style={{ background: '#05060c', opacity: dark }} />
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        <line x1={0} x2={1920} y1={660} y2={660} stroke={C.spaceInk2} strokeDasharray="6 10" strokeWidth={2} opacity={0.5} />
        <circle cx={sunX} cy={sunY} r={34} fill={C.sun} />
        <g opacity={earthIn} transform={`translate(0 ${(1 - earthIn) * -80})`}>
          {earthDisc(1120, earthY, 46)}
        </g>
        <path d={ridgePath('far', 700, 95)} fill={C.rockFar} />
        <path d={ridgePath('mid', 820, 70)} fill={C.rockMid} />
        <path d={ridgePath('near', 940, 45)} fill={C.rockNear} />
        <text x={40} y={648} fill={C.spaceInk2} fontFamily={MONO} fontSize={24} opacity={0.7}>
          flat horizon 0°
        </text>
      </svg>
      <div style={{ position: 'absolute', left: 120, top: 110 }}>
        {!second ? (
          <Headline size={92}>
            <Word at={0}>The Sun skims the hills</Word>
            <br />
            <Word at={2}>and hides</Word>{' '}
            <Word at={2.5} style={{ color: C.sun }}>
              for days.
            </Word>
          </Headline>
        ) : (
          <Headline size={92}>
            <Word at={4}>
              <span style={{ color: C.earthSky }}>Earth</span> drops out of view.
            </Word>
            <br />
            <Word at={6}>No light.</Word> <Word at={6.5}>No radio.</Word>
          </Headline>
        )}
      </div>
      <div style={{ position: 'absolute', right: 120, top: 124, fontFamily: MONO, fontSize: 30, color: C.spaceInk2, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ color: C.spaceInk }}>day {day.toFixed(1)} of 30</div>
        {read('Sun el', sunEl, C.sun)}
        {read('Earth el', earthEl, C.earthSky)}
      </div>
    </AbsoluteFill>
  )
}

/** Beats 16–20: the question riser. */
export function Riser() {
  const frame = useCurrentFrame()
  const beat = Math.floor(frame / f(1))
  const words = ['Where?', 'When?', 'How long?', 'Which site?']
  const bgs = [C.ground, C.space, C.primary, C.ground]
  const inks = [C.ink, C.spaceInk, C.spaceInk, C.ink]
  const local = frame - f(beat)
  const z = interpolate(local, [0, f(1)], [1.25, 1], { ...clamp, easing: easeOut })
  if (frame >= f(3.75)) return <AbsoluteFill style={{ background: '#05060c' }} />
  return (
    <AbsoluteFill style={{ background: bgs[beat], ...center }}>
      <div style={{ transform: `scale(${z})`, fontFamily: DISPLAY, fontWeight: 800, fontSize: 300, letterSpacing: -9, color: inks[beat] }}>{words[beat]}</div>
    </AbsoluteFill>
  )
}

/** Beats 20–26: the drop — logo build. */
export function LogoReveal() {
  const frame = useCurrentFrame()
  const ridge = useHit(0, { damping: 16, stiffness: 120, mass: 0.8 })
  const push = interpolate(frame, [f(4.5), f(6)], [1, 1.08], { ...clamp, easing: easeInOut })
  const flash = interpolate(frame, [0, 6], [1, 0], clamp)
  const tag = useHit(3.5)
  return (
    <AbsoluteFill style={{ background: C.primary }}>
      <Stars count={70} color={C.primarySoft} drift={0.1} />
      <svg width={1920} height={1080} style={{ position: 'absolute', transform: `translateY(${(1 - ridge) * 300}px)` }}>
        <path d={ridgePath('logo', 960, 40)} fill={C.primaryDeep} />
      </svg>
      <AbsoluteFill style={{ ...center, flexDirection: 'column', gap: 40, transform: `scale(${push})` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <DomeCat at={0} size={260} />
          <Wordmark at={1.5} size={200} />
        </div>
        <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 56, color: C.primarySoft, opacity: tag, transform: `translateY(${(1 - tag) * 30}px)` }}>
          Before you land, look up.
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: C.spaceInk, opacity: flash }} />
    </AbsoluteFill>
  )
}
