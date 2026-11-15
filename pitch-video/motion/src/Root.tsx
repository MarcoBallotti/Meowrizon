import { Composition } from 'remotion'
import { Promo } from './Promo'
import { FPS, TOTAL_BEATS, f } from './theme'

export const Root = () => (
  <Composition id="Promo" component={Promo} durationInFrames={f(TOTAL_BEATS)} fps={FPS} width={1920} height={1080} />
)
