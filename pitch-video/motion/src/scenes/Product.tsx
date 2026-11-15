import { AbsoluteFill, Sequence, interpolate, useCurrentFrame } from 'remotion'
import { C, MONO, TEXT, f } from '../theme'
import { Chip, Dot, Headline, Shot, Stars, Word, clamp, easeOut, ridgePath, useHit } from '../kit'

function SlideIn({ at, children, dx = 420 }: { at: number; children: React.ReactNode; dx?: number }) {
  const s = useHit(at, { damping: 15, stiffness: 120, mass: 0.8 })
  return <AbsoluteFill style={{ transform: `translateX(${(1 - s) * dx}px)`, opacity: interpolate(s, [0, 0.3], [0, 1], clamp) }}>{children}</AbsoluteFill>
}

/** Beats 26–34: pick a place on the 3D Moon. */
export function Globe() {
  const frame = useCurrentFrame()
  const second = frame >= f(4)
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Stars count={90} drift={0.08} />
      <div style={{ position: 'absolute', left: 120, top: 220, width: 620 }}>
        <Headline size={100}>
          <Word at={0}>Pick any</Word> <Word at={0.5}>place</Word> <Word at={1}>on a real</Word>{' '}
          <Word at={1.5} style={{ color: C.earthSky }}>
            3D Moon.
          </Word>
        </Headline>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16, marginTop: 56, fontFamily: TEXT }}>
          <Chip at={2.5}>
            <Dot color={C.spaceInk2} /> NASA LRO and LOLA terrain
          </Chip>
          <Chip at={3}>
            <Dot color={C.earthSky} /> 13 Artemis candidate regions
          </Chip>
          <Chip at={3.5}>
            <Dot color={C.sun} /> 9 historic landing sites
          </Chip>
        </div>
      </div>
      {!second ? (
        <SlideIn at={0}>
          <Shot src="home" x={760} y={242} w={1060} h={596} dur={4} zoom={[1, 1.06]} origin={[0.62, 0.5]} />
        </SlideIn>
      ) : (
        <Sequence from={f(4)} layout="none">
          <Shot src="globe-south" x={760} y={242} w={1060} h={596} dur={4} zoom={[1.45, 1.75]} origin={[0.86, 0.55]} />
        </Sequence>
      )}
    </AbsoluteFill>
  )
}

/** Beats 34–40: ranked shortlist. */
export function Shortlist() {
  const card = useHit(0.5, { damping: 15, stiffness: 140, mass: 0.7 })
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Shot src="explore" x={0} y={0} w={1920} h={1080} radius={0} dur={6} zoom={[1.02, 1.32]} origin={[0.9, 0.32]} style={{ boxShadow: 'none', outline: 'none' }} />
      <div
        style={{
          position: 'absolute',
          left: 96,
          bottom: 96,
          padding: '48px 56px',
          borderRadius: 24,
          background: C.space,
          transform: `translateY(${(1 - card) * 120}px)`,
          opacity: interpolate(card, [0, 0.3], [0, 1], clamp),
        }}
      >
        <Headline size={96}>
          <Word at={1}>29 sites.</Word>
          <br />
          <Word at={2}>Ranked for</Word>{' '}
          <Word at={2.5} style={{ color: C.sun }}>
            your mission.
          </Word>
        </Headline>
        <div style={{ fontFamily: MONO, fontSize: 28, color: C.spaceInk2, marginTop: 24 }}>
          <Word at={3.5}>sunlight · Earth in view · longest night</Word>
        </div>
      </div>
    </AbsoluteFill>
  )
}

// ----- live horizon -------------------------------------------------------------
const DEG = 46 // px per degree
const ZERO = 640 // y of the 0° line
const ridge = (x: number) =>
  ZERO - DEG * (1.1 + 1.2 * Math.sin(x / 210 + 0.6) + 0.6 * Math.sin(x / 83 + 2.1) + 0.25 * Math.sin(x / 31) + (x > 980 && x < 1260 ? 2.4 * Math.sin(((x - 980) / 280) * Math.PI) : 0))
const ridgeD = (() => {
  const pts: string[] = []
  for (let x = -20; x <= 1940; x += 6) pts.push(`${x},${ridge(x).toFixed(1)}`)
  return pts
})()
const sunAt = (u: number) => ({ x: 120 + 1700 * u, el: 2.6 + 1.6 * Math.sin(u * Math.PI * 1.2 + 0.2) })
const earthAt = (u: number) => ({ x: 760 + 360 * Math.sin(u * Math.PI * 2), el: 2.4 + 2.2 * Math.sin(u * Math.PI * 2 + 1.4) })
const visible = (x: number, el: number) => ZERO - el * DEG < ridge(x) - 8

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function LiveHorizon() {
  const frame = useCurrentFrame()
  const u = interpolate(frame, [0, f(6)], [0, 1], clamp)
  const sun = sunAt(u)
  const earth = earthAt(u)
  const sunVis = visible(sun.x, sun.el)
  const earthVis = visible(earth.x, earth.el)
  const minutes = Math.round((u * 30 * 24 * 60) / 10) * 10
  const d = new Date(Date.UTC(2026, 10, 15) + minutes * 60000)
  const stamp = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`
  const trail = Array.from({ length: 60 }, (_, i) => sunAt((u * i) / 59))
  // timeline: sample visibility along the month
  const N = 120
  const rows = [
    { label: 'Sunlight', color: C.sun, fn: (t: number) => visible(sunAt(t).x, sunAt(t).el) },
    { label: 'Earth', color: C.earthSky, fn: (t: number) => visible(earthAt(t).x, earthAt(t).el) },
    { label: 'Both', color: C.spaceInk2, fn: (t: number) => visible(sunAt(t).x, sunAt(t).el) && visible(earthAt(t).x, earthAt(t).el) },
  ]
  const head = useHit(0)
  return (
    <AbsoluteFill style={{ background: C.space }}>
      <Stars count={80} drift={0} />
      <svg width={1920} height={1080} style={{ position: 'absolute' }}>
        {[0, 5].map((deg) => (
          <g key={deg}>
            <line x1={0} x2={1920} y1={ZERO - deg * DEG} y2={ZERO - deg * DEG} stroke={C.spaceLine} strokeWidth={2} strokeDasharray={deg === 0 ? '6 10' : undefined} />
            <text x={24} y={ZERO - deg * DEG - 12} fill={C.spaceInk2} fontFamily={MONO} fontSize={22}>
              {deg}°
            </text>
          </g>
        ))}
        <polyline points={trail.map((p) => `${p.x},${ZERO - p.el * DEG}`).join(' ')} fill="none" stroke={C.sun} strokeWidth={3} strokeDasharray="2 10" strokeLinecap="round" opacity={0.7} />
        <circle cx={sun.x} cy={ZERO - sun.el * DEG} r={26} fill={C.sun} />
        <g>
          <circle cx={earth.x} cy={ZERO - earth.el * DEG} r={20} fill={C.earthSky} />
        </g>
        <path d={`M-20,1080 L${ridgeD.join(' L')} L1940,1080 Z`} fill={C.rockMid} />
        <polyline points={ridgeD.join(' ')} fill="none" stroke={C.spaceInk} strokeWidth={2.5} />
        <path d={ridgePath('hz-near', 860, 30)} fill={C.rockNear} />
        {['S 180°', 'W 270°', 'N 0°', 'E 90°', 'S 180°'].map((t, i) => (
          <text key={i} x={96 + i * 432} y={812} fill={C.spaceInk2} fontFamily={MONO} fontSize={22} textAnchor="middle">
            {t}
          </text>
        ))}
      </svg>
      {/* timeline */}
      <div style={{ position: 'absolute', left: 96, right: 96, bottom: 48, padding: '24px 24px', borderRadius: 24, background: C.space, display: 'flex', flexDirection: 'column', gap: 12, fontFamily: MONO, fontSize: 22, color: C.spaceInk2 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <span style={{ width: 120 }}>{r.label}</span>
            <div style={{ flex: 1, height: 14, position: 'relative', borderRadius: 7, background: C.space2, overflow: 'hidden' }}>
              {Array.from({ length: N }, (_, i) => i / N)
                .filter((t) => t <= u && r.fn(t))
                .map((t) => (
                  <div key={t} style={{ position: 'absolute', left: `${t * 100}%`, width: `${100 / N + 0.1}%`, top: 0, bottom: 0, background: r.color }} />
                ))}
            </div>
          </div>
        ))}
        <div style={{ position: 'absolute', left: `calc(168px + (100% - 192px) * ${u})`, top: 16, bottom: 16, width: 3, background: C.spaceInk }} />
      </div>
      <div style={{ position: 'absolute', left: 120, top: 88, opacity: head }}>
        <Headline size={92}>
          <Word at={0}>Stand on</Word> <Word at={0.5}>the horizon.</Word>
        </Headline>
        <div style={{ fontFamily: MONO, fontSize: 28, color: C.spaceInk2, marginTop: 16 }}>
          <Word at={1.5}>Peak Near Shackleton · 88.81° S · 30 days</Word>
        </div>
      </div>
      <div style={{ position: 'absolute', right: 120, top: 100, fontFamily: MONO, fontSize: 28, color: C.spaceInk2, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end' }}>
        <div style={{ color: C.spaceInk }}>{stamp}</div>
        <div>
          <span style={{ color: C.sun }}>Sun</span> {sunVis ? 'in view' : 'behind the ridge'}
        </div>
        <div>
          <span style={{ color: C.earthSky }}>Earth</span> {earthVis ? 'in view' : 'behind the ridge'}
        </div>
        <div style={{ color: sunVis && earthVis ? C.spaceInk : C.spaceInk2 }}>{sunVis && earthVis ? 'land here: power and link' : sunVis ? 'power, no link' : earthVis ? 'link, no power' : 'dark and silent'}</div>
      </div>
    </AbsoluteFill>
  )
}

/** Beats 40–50: live horizon, then the real screen. */
export function Horizon() {
  const frame = useCurrentFrame()
  if (frame < f(6)) return <LiveHorizon />
  return (
    <AbsoluteFill style={{ background: C.ground }}>
      <div style={{ position: 'absolute', left: 200, top: 56 }}>
        <Headline size={72} color={C.ink}>
          <Word at={6}>Every number from</Word>{' '}
          <Word at={6.5} style={{ color: C.primary }}>
            real NASA terrain.
          </Word>
        </Headline>
      </div>
      <Sequence from={f(6)} layout="none">
        <Shot src="site" x={200} y={180} w={1520} h={855} dur={4} zoom={[1, 1.12]} origin={[0.25, 0.75]} style={{ boxShadow: '0 40px 100px rgba(23,26,38,0.18)', outline: `1px solid ${C.ground}` }} />
      </Sequence>
    </AbsoluteFill>
  )
}
