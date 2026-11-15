import type { DemProduct } from '../api/types'

/** Finest declared product whose latitude band covers the point. */
export function bestProductFor(latDeg: number, products: DemProduct[]): DemProduct | undefined {
  const covering = products.filter((p) => p.available && latDeg >= p.latMinDeg && latDeg <= p.latMaxDeg)
  covering.sort((a, b) => a.pixelSizeM - b.pixelSizeM)
  return covering[0]
}
