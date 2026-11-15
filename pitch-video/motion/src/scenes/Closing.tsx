import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { C, DISPLAY, MONO, TEXT, f } from '../theme'
import { Headline, Shot, Stars, Word, clamp, easeOut, ridgePath, useHit } from '../kit'
import { DomeCat } from '../Logo'

function Count({ at, to, decimals = 0, suffix = '', prefix = '' }: { at: number; to: number; decimals?: number; suffix?: string; prefix?: string }) {
  const frame = useCurrentFrame()
  const v = interpolate(frame, [f(at), f(at + 0.9)], [0, to], { ...clamp, easing: easeOut })
  return (
    <>
      {prefix}
      {v.toFixed(decimals)}
      {suffix}
    </>
  )
}

/** Beats 50–58: numbers, one every two beats. */
export function Numbers() {
  const frame = useCurrentFrame()
  const i = Math.min(3, Math.floor(frame / f(2)))
  const at = i * 2
  const s = useHit(at, { damping: 12, stiffness: 220, mass: 0.6 })
  const items = [
    { big: <Count at={0} to={720} />, label: 'terrain rays around every site', color: C.ink },
    { big: <><Count at={2} to={30} /> days</>, label: 'checked every 10 minutes', color: C.primary },
    { big: 'JPL', label: 'Horizons ephemerides for the Sun and Earth', color: C.earthInk },
    { big: <Count at={6} to={3} />, label: 'audiences, one engine', color: C.sunInk },
  ]
  const it = items[i]
  return (
    <AbsoluteFill style={{ background: C.ground, justifyContent: 'center', alignItems: 'center', flexDirection: 'column' }}>
      <div style={{ transform: `scale(${interpolate(s, [0, 1], [1.6, 1])})`, opacity: interpolate(s, [0, 0.25], [0, 1], clamp), textAlign: 'center' }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 340, lineHeight: 1, letterSpacing: -12, color: it.color, fontVariantNumeric: 'tabular-nums' }}>{it.big}</div>
      </div>
      <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 56, color: C.ink2, marginTop: 24, opacity: interpolate(frame - f(at), [4, 10], [0, 1], clamp) }}>{it.label}</div>
      <div style={{ position: 'absolute', bottom: 80, display: 'flex', gap: 16 }}>
        {items.map((_, k) => (
          <div key={k} style={{ width: k === i ? 48 : 16, height: 16, borderRadius: 8, background: k <= i ? C.ink : '#d9dce6' }} />
        ))}
      </div>
    </AbsoluteFill>
  )
}

/** Beats 58–66: three audiences. */
export function Audiences() {
  const frame = useCurrentFrame()
  const beat = frame / f(1)
  const idx = beat < 2 ? 0 : beat < 4 ? 1 : beat < 6 ? 2 : 0
  const labels = ['Mission Planner', 'Educator', 'General Public']
  const shots = ['site', 'site-educator', 'site-general-public']
  const switchAt = [0, 2, 4, 6].filter((b) => b <= beat).pop() ?? 0
  const bump = interpolate(frame - f(switchAt), [0, 8], [1.03, 1], { ...clamp, easing: easeOut })
  const widths = [210, 150, 200]
  const left = widths.slice(0, idx).reduce((a, b) => a + b, 0)
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <div style={{ position: 'absolute', left: 200, top: 64 }}>
        <Headline size={60} color={C.ink}>
          <Word at={0}>One engine.</Word>{' '}
          <Word at={1} style={{ color: C.primary }}>
            Three audiences.
          </Word>
        </Headline>
      </div>
      <div style={{ position: 'absolute', right: 200, top: 72, display: 'flex', padding: 8, borderRadius: 999, background: C.card, fontFamily: TEXT, fontWeight: 600, fontSize: 22 }}>
        <div style={{ position: 'absolute', top: 8, bottom: 8, left: 8 + left, width: widths[idx], borderRadius: 999, background: C.ink }} />
        {labels.map((l, k) => (
          <div key={l} style={{ position: 'relative', width: widths[k], textAlign: 'center', padding: '14px 0', color: k === idx ? C.card : C.ink }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', inset: 0, transform: `scale(${bump})` }}>
        <Shot src={shots[idx]} x={200} y={190} w={1520} h={855} dur={8} zoom={[1, 1]} style={{ boxShadow: '0 40px 100px rgba(23,26,38,0.18)', outline: `1px solid ${C.ground}` }} />
      </div>
    </AbsoluteFill>
  )
}

/** Beats 66–74: proof. */
export function Proof() {
  const cards = [
    { at: 0.5, big: <Count at={0.5} to={97.5} decimals={1} suffix="%" />, color: C.sun, label: 'slope agreement with NASA PGDA', sub: 'Malapert Massif, 118 of 121 points' },
    { at: 2.5, big: <><Count at={2.5} to={184} />/184</>, color: C.earthSky, label: 'backend tests pass', sub: '99 of them on the engine' },
    { at: 4.5, big: <Count at={4.5} to={0.9} decimals={1} suffix=" s" />, color: C.spaceInk, label: 'same answer from cache', sub: '11.3 s on a first run' },
  ]
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Stars count={60} drift={0.05} />
      <div style={{ position: 'absolute', left: 160, top: 150 }}>
        <Headline size={96}>
          <Word at={0}>Checked,</Word>{' '}
          <Word at={0.5} style={{ color: C.spaceInk2 }}>
            not guessed.
          </Word>
        </Headline>
      </div>
      <div style={{ position: 'absolute', left: 160, right: 160, top: 400, display: 'flex', gap: 32 }}>
        {cards.map((c) => (
          <ProofCard key={c.label} {...c} />
        ))}
      </div>
      <div style={{ position: 'absolute', left: 160, bottom: 120, fontFamily: MONO, fontSize: 26, color: C.spaceInk2 }}>
        <Word at={6}>Supports early comparison. Does not certify landing safety.</Word>
      </div>
    </AbsoluteFill>
  )
}

function ProofCard({ at, big, color, label, sub }: { at: number; big: React.ReactNode; color: string; label: string; sub: string }) {
  const s = useHit(at, { damping: 13, stiffness: 170, mass: 0.6 })
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        padding: 48,
        borderRadius: 24,
        background: C.space2,
        outline: `1px solid ${C.spaceLine}`,
        opacity: interpolate(s, [0, 0.3], [0, 1], clamp),
        transform: `translateY(${(1 - s) * 140}px)`,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 108, lineHeight: 1, letterSpacing: -3, color, fontVariantNumeric: 'tabular-nums' }}>{big}</div>
      <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 36, color: C.spaceInk, marginTop: 32 }}>{label}</div>
      <div style={{ fontFamily: TEXT, fontWeight: 400, fontSize: 28, color: C.spaceInk2, marginTop: 8 }}>{sub}</div>
    </div>
  )
}

/** Beats 74–88: end card. */
export function Outro() {
  const frame = useCurrentFrame()
  const ridge = useHit(0, { damping: 16, stiffness: 110, mass: 0.8 })
  const flash = interpolate(frame, [0, 6], [0.9, 0], clamp)
  const sub = useHit(4)
  const fadeOut = interpolate(frame, [f(12.5), f(14)], [0, 1], clamp)
  return (
    <AbsoluteFill style={{ background: C.primary }}>
      <Stars count={70} color={C.primarySoft} drift={0.06} />
      <svg width={1920} height={1080} style={{ position: 'absolute', transform: `translateY(${(1 - ridge) * 300}px)` }}>
        <path d={ridgePath('outro', 980, 36)} fill={C.primaryDeep} />
      </svg>
      <div style={{ position: 'absolute', left: 200, top: 190 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <DomeCat at={0} size={120} />
          <div style={{ fontFamily: DISPLAY, fontWeight: 800, fontSize: 64, letterSpacing: -2, color: C.spaceInk }}>
            <Word at={0.75}>Moonrizon</Word>
          </div>
        </div>
        <Headline size={200} style={{ marginTop: 48 }}>
          <Word at={1}>Before you land,</Word>
          <br />
          <Word at={2} from="zoom">
            look up.
          </Word>
        </Headline>
        <div style={{ fontFamily: TEXT, fontWeight: 600, fontSize: 40, color: C.primarySoft, marginTop: 48, opacity: sub, transform: `translateY(${(1 - sub) * 20}px)` }}>
          NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator
        </div>
      </div>
      <AbsoluteFill style={{ background: C.spaceInk, opacity: flash }} />
      <AbsoluteFill style={{ background: '#05060c', opacity: fadeOut }} />
    </AbsoluteFill>
  )
}
