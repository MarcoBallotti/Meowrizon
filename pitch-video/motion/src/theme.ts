import { loadFont as loadDisplay } from '@remotion/google-fonts/BricolageGrotesque'
import { loadFont as loadText } from '@remotion/google-fonts/Figtree'
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono'

export const DISPLAY = loadDisplay('normal', { weights: ['700', '800'], subsets: ['latin'] }).fontFamily
export const TEXT = loadText('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily
export const MONO = loadMono('normal', { weights: ['400', '600'], subsets: ['latin'] }).fontFamily

/** Moonrizon tokens (frontend/src/index.css). */
export const C = {
  space: '#12141e',
  space2: '#1b1e2a',
  spaceLine: '#2a2e3d',
  spaceInk: '#eceef4',
  spaceInk2: '#b4b9c8',
  ground: '#eceef4',
  card: '#ffffff',
  ink: '#171a26',
  ink2: '#4d5266',
  primary: '#2b2fa8',
  primaryDeep: '#1b1d6e',
  primarySoft: '#e5e7fa',
  sun: '#c2964a',
  sunInk: '#6f5424',
  earth: '#6f8fc4',
  earthSky: '#8aa6d6',
  earthInk: '#3f5f96',
  earthNight: '#2a2e3d',
  rockFar: '#2a2e3d',
  rockMid: '#3a3e4e',
  rockNear: '#4d5266',
  red: '#b8707c',
}

export const FPS = 30
/** 120 BPM: one beat is 15 frames. Every cut lands on a beat. */
export const BEAT = 15
export const f = (beats: number) => Math.round(beats * BEAT)
export const TOTAL_BEATS = 88

/** Scene starts, in beats. Keep in sync with scripts/music.mjs. */
export const S = {
  hook: 0,
  problem: 8,
  riser: 16,
  logo: 20,
  globe: 26,
  shortlist: 34,
  horizon: 40,
  numbers: 50,
  audiences: 58,
  proof: 66,
  outro: 74,
  end: 88,
}
