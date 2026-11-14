/**
 * Lit part of a disc of radius r centred on the origin, with the Sun towards
 * +x. `lit` is the illuminated fraction 0..1.
 */
export function phasePath(r: number, lit: number): string {
  const k = Math.max(0, Math.min(1, lit))
  if (k <= 0.001) return ''
  const xt = r * (1 - 2 * k)
  const rx = Math.max(0.001, Math.abs(xt))
  const sweep = xt < 0 ? 1 : 0
  return `M 0 ${-r} A ${r} ${r} 0 0 1 0 ${r} A ${rx} ${r} 0 0 ${sweep} 0 ${-r} Z`
}
