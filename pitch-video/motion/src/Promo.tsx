import { AbsoluteFill, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { Audio } from '@remotion/media'
import { S, f } from './theme'
import { Hook, LogoReveal, Problem, Riser } from './scenes/Opening'
import { Globe, Horizon, Shortlist } from './scenes/Product'
import { Audiences, Numbers, Outro, Proof } from './scenes/Closing'

const scenes = [
  ['hook', Hook],
  ['problem', Problem],
  ['riser', Riser],
  ['logo', LogoReveal],
  ['globe', Globe],
  ['shortlist', Shortlist],
  ['horizon', Horizon],
  ['numbers', Numbers],
  ['audiences', Audiences],
  ['proof', Proof],
  ['outro', Outro],
] as const
const order = Object.keys(S) as (keyof typeof S)[]

/** Small scale kick on every beat while the groove plays. */
function usePulse() {
  const frame = useCurrentFrame()
  if (frame < f(S.logo) || frame >= f(S.outro)) return 1
  const t = (frame % f(1)) / 30
  return 1 + 0.006 * Math.exp(-t * 14)
}

export function Promo() {
  const pulse = usePulse()
  return (
    <AbsoluteFill style={{ background: '#05060c' }}>
      <AbsoluteFill style={{ transform: `scale(${pulse})` }}>
        {scenes.map(([key, Scene]) => {
          const next = order[order.indexOf(key) + 1]
          return (
            <Sequence key={key} name={key} from={f(S[key])} durationInFrames={f(S[next] - S[key])}>
              <Scene />
            </Sequence>
          )
        })}
      </AbsoluteFill>
      <Audio src={staticFile('music.wav')} />
    </AbsoluteFill>
  )
}
