// Synthesises the promo soundtrack (120 BPM, A minor) to public/music.wav.
// Every cut in the video sits on a beat (1 beat = 0.5 s = 15 frames at 30 fps).
import { writeFileSync } from 'node:fs'

const SR = 44100
const BEAT = 0.5
const TOTAL = 44 // seconds, matches the composition
const N = Math.ceil(TOTAL * SR)
const L = new Float32Array(N)
const R = new Float32Array(N)
const duck = new Float32Array(N).fill(1) // sidechain envelope driven by kicks

let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
const b = (n) => n * BEAT
const put = (i, v, pan = 0) => {
  if (i < 0 || i >= N) return
  L[i] += v * Math.min(1, 1 - pan)
  R[i] += v * Math.min(1, 1 + pan)
}
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12)

function kick(t0, g = 1, deep = false) {
  const s0 = Math.round(t0 * SR), dur = deep ? 1.6 : 0.42
  let ph = 0
  for (let i = 0; i < dur * SR; i++) {
    const t = i / SR
    const f = deep ? 30 + 90 * Math.exp(-t * 18) : 46 + 110 * Math.exp(-t * 30)
    ph += (2 * Math.PI * f) / SR
    const a = Math.exp(-t * (deep ? 2.6 : 7.5))
    put(s0 + i, g * (Math.sin(ph) * a * 0.95 + rnd() * Math.exp(-t * 400) * 0.25))
  }
  for (let i = 0; i < 0.3 * SR; i++) {
    const k = s0 + i
    if (k < N) duck[k] = Math.min(duck[k], 1 - 0.65 * Math.exp(-(i / SR) * 9))
  }
}

function noiseHit(t0, { dur, decay, hp = 0.9, lp = 0.6, g = 0.4, pan = 0, bursts = [0] }) {
  for (const off of bursts) {
    const s0 = Math.round((t0 + off) * SR)
    let y = 0, xp = 0, z = 0
    for (let i = 0; i < dur * SR; i++) {
      const t = i / SR, x = rnd()
      y = hp * (y + x - xp); xp = x // high-pass
      z += lp * (y - z) // low-pass
      put(s0 + i, z * Math.exp(-t * decay) * g, pan)
    }
  }
}
const clap = (t0, g = 0.5) => noiseHit(t0, { dur: 0.35, decay: 16, hp: 0.95, lp: 0.35, g, bursts: [0, 0.011, 0.022] })
const hat = (t0, open = false, g = 0.16, pan = 0.25) => noiseHit(t0, { dur: open ? 0.3 : 0.06, decay: open ? 14 : 70, hp: 0.55, lp: 0.9, g, pan })

function tone(t0, f, dur, { g = 0.2, attack = 0.005, decay = 4, wave = 'saw', cutoff = 0.2, pan = 0, sidechain = true, detune = 0 } = {}) {
  const s0 = Math.round(t0 * SR)
  const voices = detune ? [-detune, 0, detune] : [0]
  const ph = voices.map((_, v) => (v * 0.37) % 1)
  let z = 0
  for (let i = 0; i < (dur + 0.4) * SR; i++) {
    const t = i / SR
    let x = 0
    voices.forEach((d, v) => {
      ph[v] = (ph[v] + (f * (1 + d)) / SR) % 1
      const p = ph[v]
      x += wave === 'saw' ? 2 * p - 1 : wave === 'tri' ? 1 - 4 * Math.abs(p - 0.5) : Math.sin(2 * Math.PI * p)
    })
    x /= voices.length
    z += cutoff * (x - z)
    const env = Math.min(1, t / attack) * (t < dur ? Math.exp(-t * decay) : Math.exp(-dur * decay) * Math.exp(-(t - dur) * 14))
    const k = s0 + i
    put(k, z * env * g * (sidechain && k < N ? duck[k] : 1), pan)
  }
}

function riser(t0, t1, g = 0.35) {
  const s0 = Math.round(t0 * SR), len = (t1 - t0) * SR
  let z = 0, ph = 0
  for (let i = 0; i < len; i++) {
    const u = i / len
    z += (0.02 + 0.5 * u * u) * (rnd() - z)
    ph += (2 * Math.PI * (180 + 1400 * u * u)) / SR
    put(s0 + i, (z * 0.8 + Math.sin(ph) * 0.25) * u * u * g, Math.sin(u * 12) * 0.4)
  }
}

function whoosh(tc, g = 0.28) {
  const dur = 0.42, s0 = Math.round((tc - dur * 0.7) * SR)
  let z = 0
  for (let i = 0; i < dur * SR; i++) {
    const u = i / (dur * SR)
    const bell = Math.sin(Math.PI * Math.pow(u, 0.8)) ** 2
    z += (0.03 + 0.35 * bell) * (rnd() - z)
    put(s0 + i, z * bell * g, -0.6 + 1.2 * u)
  }
}

const blip = (t0, f = 1320, g = 0.12) => tone(t0, f, 0.08, { g, wave: 'sine', decay: 30, cutoff: 1, sidechain: false })

// --- arrangement (in beats) -------------------------------------------------
const chords = [
  { root: 45, notes: [57, 60, 64] }, // Am
  { root: 41, notes: [53, 57, 60] }, // F
  { root: 48, notes: [55, 60, 64] }, // C
  { root: 43, notes: [55, 59, 62] }, // G
]
const chordAt = (beat) => chords[Math.floor(beat / 4) % 4]
// catchy lead motif over 8 beats (in 8th notes), A minor pentatonic
const motif = [76, 0, 74, 72, 0, 69, 72, 74, 76, 0, 79, 76, 74, 0, 72, 0]

// hook: pads + word blips
for (let bar = 0; bar < 4; bar++) {
  const c = chordAt(bar * 4)
  c.notes.forEach((n, j) => tone(b(bar * 4), midi(n), b(4), { g: 0.07, attack: 0.25, decay: 0.15, detune: 0.006, cutoff: 0.06, pan: (j - 1) * 0.4, sidechain: false }))
}
;[0, 1, 2, 3, 4, 5, 6, 7].forEach((k) => blip(b(k), k === 3 || k === 7 ? 1760 : 1320))
kick(b(0), 0.8, true)

// problem section: half-time beat + bass + arp
for (let k = 8; k < 16; k++) {
  if (k % 2 === 0) kick(b(k), 0.85)
  hat(b(k + 0.5), false, 0.12)
  const c = chordAt(k)
  tone(b(k + 0.5), midi(c.root - 12), b(0.4), { g: 0.32, decay: 3, cutoff: 0.08 })
  c.notes.forEach((n, j) => tone(b(k + j * 0.25), midi(n + 12), 0.12, { g: 0.06, wave: 'tri', decay: 14, cutoff: 0.5, pan: (j - 1) * 0.5 }))
}
// riser into the drop: clap roll 8ths -> 16ths
riser(b(16), b(19.75), 0.4)
for (let k = 16; k < 19.75; k += k < 18 ? 0.5 : 0.25) clap(b(k), 0.12 + 0.25 * ((k - 16) / 4))

// DROP at beat 20 -> 74
kick(b(20), 1, true)
noiseHit(b(20), { dur: 1.8, decay: 2.2, hp: 0.7, lp: 0.25, g: 0.35 })
for (let k = 20; k < 74; k++) {
  const breakdown = k >= 38 && k < 40
  if (!breakdown) kick(b(k), 0.95)
  if (k % 2 === 1 && !breakdown) clap(b(k), 0.42)
  hat(b(k + 0.5), true, 0.1, 0.3)
  hat(b(k + 0.25), false, 0.07, -0.3)
  hat(b(k + 0.75), false, 0.07, -0.3)
  const c = chordAt(k)
  tone(b(k + 0.5), midi(c.root - 12), b(0.42), { g: 0.38, decay: 2.5, cutoff: 0.1, detune: 0.004 })
  tone(b(k), midi(c.root - 24), b(0.45), { g: 0.25, wave: 'sine', decay: 2, cutoff: 1 })
  if (k % 4 === 0) c.notes.forEach((n, j) => tone(b(k), midi(n), b(4), { g: 0.06, attack: 0.05, decay: 0.3, detune: 0.008, cutoff: 0.07, pan: (j - 1) * 0.5 }))
  // lead motif, 8th notes
  for (let e = 0; e < 2; e++) {
    const n = motif[((k - 20) * 2 + e) % 16]
    if (n && k >= 26) tone(b(k + e * 0.5), midi(n), 0.18, { g: 0.09, wave: 'saw', decay: 9, cutoff: 0.25, detune: 0.004, pan: 0.15 })
  }
}
riser(b(38), b(39.9), 0.25)
// outro hit
kick(b(74), 1, true)
noiseHit(b(74), { dur: 2.5, decay: 1.4, hp: 0.7, lp: 0.2, g: 0.3 })
chords[0].notes.concat([69, 76]).forEach((n, j) => tone(b(74), midi(n), 4.5, { g: 0.07, attack: 0.02, decay: 0.35, detune: 0.008, cutoff: 0.08, pan: (j - 2) * 0.3, sidechain: false }))
;[76, 74, 72, 69].forEach((n, j) => tone(b(76 + j * 0.5), midi(n + 12), 0.3, { g: 0.07, wave: 'tri', decay: 6, cutoff: 0.6, sidechain: false }))

// whooshes on the big cuts
;[26, 34, 40, 50, 58, 66].forEach((k) => whoosh(b(k)))
// numbers & proof: blips on each count
;[50, 52, 54, 56, 66, 68.5, 71].forEach((k) => blip(b(k), 1760, 0.08))

// --- master -------------------------------------------------------------------
let peak = 0
for (let i = 0; i < N; i++) {
  const fade = i > N - 1.2 * SR ? (N - i) / (1.2 * SR) : 1
  L[i] = Math.tanh(L[i] * 1.1) * fade
  R[i] = Math.tanh(R[i] * 1.1) * fade
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]))
}
const gain = 0.89 / peak
const buf = Buffer.alloc(44 + N * 4)
buf.write('RIFF', 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write('WAVE', 8)
buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22)
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34)
buf.write('data', 36); buf.writeUInt32LE(N * 4, 40)
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(L[i] * gain * 32767), 44 + i * 4)
  buf.writeInt16LE(Math.round(R[i] * gain * 32767), 46 + i * 4)
}
writeFileSync('public/music.wav', buf)
console.log('music.wav', (N / SR).toFixed(1), 's')
