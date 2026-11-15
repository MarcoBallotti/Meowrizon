/**
 * One outline for a group of polar regions. NASA publishes each Artemis III
 * candidate region as a small square on the south polar stereographic map;
 * thirteen squares say little on a globe, so the interface draws the single
 * area they span: their convex hull, computed on that same map projection.
 */

const R = 1_737_400
const RAD = Math.PI / 180
/** Spacing of the points along each hull edge, metres on the map. */
const EDGE_STEP_M = 2_000

type XY = [number, number]
type LonLat = [number, number]

/** South polar stereographic on the reference sphere, central meridian 0. */
function project([lonDeg, latDeg]: LonLat): XY {
  const rho = 2 * R * Math.tan(((90 + latDeg) * RAD) / 2)
  return [rho * Math.sin(lonDeg * RAD), rho * Math.cos(lonDeg * RAD)]
}

function unproject([x, y]: XY): LonLat {
  const rho = Math.hypot(x, y)
  return [Math.atan2(x, y) / RAD, (2 * Math.atan(rho / (2 * R))) / RAD - 90]
}

/** Andrew's monotone chain; returns the hull counter-clockwise, not closed. */
function convexHull(points: XY[]): XY[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const cross = (o: XY, a: XY, b: XY) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: XY[]) => {
    const out: XY[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half(pts.reverse())]
}

/**
 * The closed outline, in [east longitude, latitude] degrees, of the area that
 * contains every given ring. Rings must lie in the southern hemisphere.
 * Returns null when there is nothing to enclose.
 */
export function polarHull(rings: LonLat[][]): LonLat[] | null {
  const hull = convexHull(rings.flat().filter(([, lat]) => lat < 0).map(project))
  if (hull.length < 3) return null
  const out: LonLat[] = []
  hull.forEach((a, i) => {
    const b = hull[(i + 1) % hull.length]
    // An edge is straight on the map, not on the sphere: follow it in short steps.
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / EDGE_STEP_M))
    for (let k = 0; k < steps; k++) out.push(unproject([a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps]))
  })
  out.push(out[0])
  return out
}
