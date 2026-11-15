/**
 * The 3D Moon (CesiumJS), loaded lazily. Rendering only: a smooth reference
 * sphere dressed with the LRO WAC mosaic and a LOLA hillshade so craters read
 * in relief. Optional lighting uses an approximate Sun direction for the
 * chosen date. Nothing drawn here feeds any classification.
 */
import {
  ArcType,
  CameraEventType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Credit,
  DirectionalLight,
  Ellipsoid,
  EllipsoidalOccluder,
  Entity,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  PolygonHierarchy,
  SceneTransforms,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  WebMapTileServiceImageryProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import type { SiteCoordinates } from '../api/types'
import { subSolarPoint } from '../domain/approxEphemeris'
import { formatLat, formatLon } from '../domain/format'
import { normalizeLon } from '../domain/sites'

const MOON = Ellipsoid.MOON
const R = 1_737_400

const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ'
const WAC_LAYER = 'LRO_WAC_Mosaic_Global_303ppd_v02'
const SHADE_LAYER = 'LRO_LOLA_Shade_Global_256ppd_v06'

const FONT = '"Figtree", system-ui, sans-serif'
const SPACE = Color.fromCssColorString('#0b0c1a')

/** Landing sites: an opaque sky-blue disc with a darker rim. */
const SITE_FILL = Color.fromCssColorString('#6cc4f5')
const SITE_RIM = Color.fromCssColorString('#12507c')
const REGION_LINE = Color.fromCssColorString('#a9dcfa')
/** Sites that cannot be chosen in the current step: same disc, in grey. */
const SITE_OFF_FILL = Color.fromCssColorString('#9a9fb0')
const SITE_OFF_RIM = Color.fromCssColorString('#3a3e4e')
const SITE_OFF_LABEL = Color.fromCssColorString('#b4b9c8')

/** How far from a site's symbol a click still chooses that site, px. */
const MARKER_HIT_PX = 12

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const ringImage = (fill: string, rim: string) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="20" fill="none" stroke="#0b0d1a" stroke-width="8" stroke-opacity="0.5"/><circle cx="28" cy="28" r="20" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="28" cy="28" r="9" fill="${fill}" stroke="${rim}" stroke-width="4"/></svg>`,
  )
const RING = ringImage('#6cc4f5', '#12507c')
const RING_OFF = ringImage('#9a9fb0', '#3a3e4e')

/** Robotic lander targets (CLPS): an amber triangle, so they never read as crewed Artemis regions. */
const ROBOTIC_FILL = '#f2b45a'
const ROBOTIC_LABEL = Color.fromCssColorString('#f7d29c')
/** Planned: an outlined triangle. Landed: the same triangle, filled. */
const triangleImage = (stroke: string, filled = false) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><path d="M16 4 L29 27 H3 Z" fill="#0b0d1a" fill-opacity="0.55" stroke="#0b0d1a" stroke-opacity="0.6" stroke-width="7" stroke-linejoin="round"/><path d="M16 4 L29 27 H3 Z" fill="${filled ? stroke : 'none'}" stroke="${stroke}" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
  )
/** Artemis III candidate regions: a small square, the shape NASA gives them on its maps. */
const squareImage = (fill: string, rim: string) =>
  svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect x="7" y="7" width="18" height="18" rx="2" fill="${fill}" stroke="${rim}" stroke-width="4"/></svg>`,
  )
const SYMBOL_IMAGE = {
  artemis: { on: squareImage('#6cc4f5', '#12507c'), off: squareImage('#9a9fb0', '#3a3e4e') },
  robotic: { on: triangleImage(ROBOTIC_FILL), off: triangleImage('#9a9fb0') },
  'robotic-landed': { on: triangleImage(ROBOTIC_FILL, true), off: triangleImage('#9a9fb0', true) },
} as const

/**
 * A fixed star field behind the globe: dots of different size and brightness,
 * many faint and a few bright. Seeded, so it never changes between renders.
 */
const STARS = (() => {
  let seed = 20261115
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  return Array.from({ length: 140 }, () => {
    const b = rnd() ** 3 // most stars are faint
    return { x: +(rnd() * 100).toFixed(2), y: +(rnd() * 100).toFixed(2), r: +(0.5 + b * 1.3).toFixed(2), o: +(0.25 + b * 0.75).toFixed(2) }
  })
})()

/** The two areas of the region catalogue, as the latitudes that bound them. */
export interface RegionBands {
  /** Northern edge of the south-pole area, degrees (negative). */
  southPoleLat: number | null
  /** Half-width of the equatorial band, degrees. */
  equatorialLat: number | null
}

/** The real outline of a region: closed rings of [east longitude, latitude] in degrees. */
export interface RegionShape {
  id: string
  rings: [number, number][][]
  /** Written once, at the northernmost point of the outline. */
  label?: string
  /** A single region: lightly filled, with a thin edge. */
  filled?: boolean
}

const NO_SHAPES: RegionShape[] = []

/** Numbered badge for ranked regions, in the colour of its place in the ranking. */
function rankBadge(n: number, color = '#ffffff'): string {
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="${color}" stroke="#0b0d1a" stroke-opacity="0.7" stroke-width="3"/><text x="20" y="26" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="17" fill="#171A2B">${n}</text></svg>`,
  )
}

/**
 * How a marker is drawn: 'artemis' = an Artemis III candidate region (crewed),
 * 'robotic' = a planned robotic lander, 'robotic-landed' = a robotic lander
 * that has landed, 'site' = a crewed landing or any other site.
 */
export type MarkerSymbol = 'artemis' | 'robotic' | 'robotic-landed' | 'site'

/** Name beside a numbered badge, so every ranked site is named on the Moon too. */
function rankLabel(text: string) {
  return {
    text,
    font: `600 26px ${FONT}`,
    scale: 0.5,
    fillColor: Color.WHITE,
    outlineColor: SPACE,
    outlineWidth: 8,
    style: LabelStyle.FILL_AND_OUTLINE,
    pixelOffset: new Cartesian2(19, 0),
    horizontalOrigin: HorizontalOrigin.LEFT,
    verticalOrigin: VerticalOrigin.CENTER,
    disableDepthTestDistance: Number.POSITIVE_INFINITY,
  }
}

export interface GlobeMarker extends SiteCoordinates {
  id: string
  label: string
  /** When set, a numbered badge replaces the dot and label. */
  rank?: number
  /** Fill of the numbered badge. */
  color?: string
  symbol?: MarkerSymbol
}

function trek(layer: string, format: 'jpg' | 'png', credit: string) {
  return new WebMapTileServiceImageryProvider({
    url: `${TREK}/${layer}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.${format}`,
    layer,
    style: 'default',
    tileMatrixSetID: 'default028mm',
    format: format === 'jpg' ? 'image/jpeg' : 'image/png',
    tilingScheme: new GeographicTilingScheme({ ellipsoid: MOON, numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 }),
    maximumLevel: 7,
    credit: new Credit(credit),
  })
}

/**
 * The one resting view: the near side tilted towards the south pole, so the
 * polar sites and the Apollo sites are all visible without turning the Moon.
 */
const HOME_VIEW = { lat: -48, lon: 15 }

function homePose() {
  const unit = Cartesian3.normalize(Cartesian3.fromDegrees(HOME_VIEW.lon, HOME_VIEW.lat, 0, MOON), new Cartesian3())
  // Far enough for the whole disc to fit the window, limb included.
  const destination = Cartesian3.multiplyByScalar(unit, R * 3.3, new Cartesian3())
  const direction = Cartesian3.negate(unit, new Cartesian3())
  const z = Cartesian3.UNIT_Z
  const up = Cartesian3.normalize(
    Cartesian3.subtract(z, Cartesian3.multiplyByScalar(direction, Cartesian3.dot(z, direction), new Cartesian3()), new Cartesian3()),
    new Cartesian3(),
  )
  return { destination, orientation: { direction, up } }
}

const HOME = homePose()
const DOLLY_MS = 600

export interface GlobeFocus extends SiteCoordinates {
  /** Distance from the target along the view direction, metres. */
  distanceM: number
  /** Where the target should sit on screen, -1..1 from the centre (x right, y up). */
  screen?: [number, number]
}

/**
 * Camera position that shows `focus` at the requested screen point while
 * keeping the home orientation: the camera only translates, never turns.
 */
function framedPosition(viewer: Viewer, focus: GlobeFocus): Cartesian3 {
  const { direction, up } = HOME.orientation
  const right = Cartesian3.normalize(Cartesian3.cross(direction, up, new Cartesian3()), new Cartesian3())
  const f = viewer.camera.frustum as { fov?: number; aspectRatio?: number }
  const fov = f.fov ?? Math.PI / 3
  const aspect = f.aspectRatio ?? 1.6
  const tanX = aspect >= 1 ? Math.tan(fov / 2) : Math.tan(fov / 2) * aspect
  const tanY = aspect >= 1 ? Math.tan(fov / 2) / aspect : Math.tan(fov / 2)
  const [sx, sy] = focus.screen ?? [0, 0]
  const t = Cartesian3.fromDegrees(focus.lonEastDeg, focus.latDeg, 0, MOON)
  const pos = Cartesian3.subtract(t, Cartesian3.multiplyByScalar(direction, focus.distanceM, new Cartesian3()), new Cartesian3())
  Cartesian3.subtract(pos, Cartesian3.multiplyByScalar(right, sx * focus.distanceM * tanX, new Cartesian3()), pos)
  Cartesian3.subtract(pos, Cartesian3.multiplyByScalar(up, sy * focus.distanceM * tanY, new Cartesian3()), pos)
  return pos
}

function sunLight(ms: number): DirectionalLight {
  const [lat, lon] = subSolarPoint(ms)
  const toSun = Cartesian3.normalize(Cartesian3.fromDegrees(lon, lat, 0, MOON), new Cartesian3())
  return new DirectionalLight({ direction: Cartesian3.negate(toSun, new Cartesian3()), intensity: 2.2 })
}

function parallel(lat: number): Cartesian3[] {
  const pts: number[] = []
  for (let lon = -180; lon <= 180; lon += 2) pts.push(lon, lat)
  return Cartesian3.fromDegreesArray(pts, MOON)
}

// Cesium entities are imperative scene objects owned by the viewer.
function placeEntity(entity: Entity, lat: number, lon: number) {
  entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(lon, lat, 0, MOON))
}

function setShow(entity: Entity, show: boolean) {
  entity.show = show
}

interface MoonGlobeProps {
  markers: GlobeMarker[]
  selected: SiteCoordinates & { label: string; id: string | null }
  /** What to frame; null = the resting view of the whole Moon. */
  focus: GlobeFocus | null
  /** Light the globe as on this date (approximate Sun direction); null = flat light. */
  lightMs: number | null
  /** Outlines of the catalogue areas; null hides them. */
  regions: RegionBands | null
  /** Change it to put the camera back on the current framing. */
  resetNonce: number
  /** Real region outlines (the Artemis III candidate regions); drawn instead of the bands. */
  regionShapes?: RegionShape[]
  /** False while the step does not let you choose a site: grey dots, clicks ignored. */
  selectable?: boolean
  onPickMarker: (id: string) => void
  onPickPoint: (site: SiteCoordinates) => void
  onHover?: (text: string) => void
}

export default function MoonGlobe({ markers, selected, focus, lightMs, regions, regionShapes = NO_SHAPES, resetNonce, selectable = true, onPickMarker, onPickPoint, onHover }: MoonGlobeProps) {
  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const ring = useRef<Entity | null>(null)
  const markerEntities = useRef<Map<string, Entity>>(new Map())
  const regionEntities = useRef<Entity[]>([])
  const handlers = useRef({ onPickMarker, onPickPoint, onHover, selectable })
  // The selection chip is HTML (crisp, rounded), so it is placed on the screen each frame.
  const chip = useRef<HTMLDivElement>(null)
  const chipAnchor = useRef<Cartesian3 | null>(null)
  const [imageryError, setImageryError] = useState(false)

  useEffect(() => {
    handlers.current = { onPickMarker, onPickPoint, onHover, selectable }
  }, [onPickMarker, onPickPoint, onHover, selectable])

  useEffect(() => {
    if (!container.current) return
    Ellipsoid.default = MOON

    const wac = trek(WAC_LAYER, 'jpg', 'LRO WAC mosaic · NASA/GSFC/Arizona State University')
    const shade = trek(SHADE_LAYER, 'png', 'LOLA hillshade · NASA/GSFC · via NASA Moon Trek')
    let tileErrors = 0
    wac.errorEvent.addEventListener(() => {
      tileErrors += 1
      if (tileErrors > 6) setImageryError(true)
    })

    const globe = new Globe(MOON)
    globe.baseColor = Color.fromCssColorString('#5a5a66')
    globe.showGroundAtmosphere = false
    globe.enableLighting = false
    globe.dynamicAtmosphereLighting = false
    // Keep lighting at every zoom level (defaults are tuned for Earth).
    globe.lightingFadeOutDistance = 1
    globe.lightingFadeInDistance = 2

    const viewer = new Viewer(container.current, {
      globe,
      baseLayer: new ImageryLayer(wac),
      mapProjection: new GeographicProjection(MOON),
      scene3DOnly: true,
      skyAtmosphere: false,
      skyBox: false,
      animation: false,
      timeline: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      // A see-through canvas: the star field behind it is plain DOM.
      contextOptions: { webgl: { alpha: true } },
      orderIndependentTranslucency: false,
    })
    const relief = viewer.imageryLayers.addImageryProvider(shade)
    relief.alpha = 0.55
    relief.brightness = 1.15

    viewer.scene.backgroundColor = Color.TRANSPARENT
    viewer.scene.fog.enabled = false
    if (viewer.scene.sun) viewer.scene.sun.show = false
    if (viewer.scene.moon) viewer.scene.moon.show = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 15_000
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 9_000_000
    viewerRef.current = viewer

    ring.current = viewer.entities.add({
      billboard: { image: RING, width: 44, height: 44, disableDepthTestDistance: Number.POSITIVE_INFINITY },
    })

    // Put the chip beside the ring; hide it when the ring is on the far side of the Moon.
    const placeChip = () => {
      const el = chip.current
      const pos = chipAnchor.current
      if (!el || !pos) return
      const toCamera = Cartesian3.subtract(viewer.camera.position, pos, new Cartesian3())
      const facing = Cartesian3.dot(Cartesian3.normalize(pos, new Cartesian3()), toCamera) > 0
      const win = facing ? SceneTransforms.worldToWindowCoordinates(viewer.scene, pos) : undefined
      if (!win) {
        el.style.display = 'none'
        return
      }
      // Beside the ring on the right, or on its left when the chip would run off the window.
      el.style.display = 'block'
      const room = el.parentElement?.clientWidth ?? 0
      const flip = win.x + 30 + el.offsetWidth > room - 16
      const x = flip ? win.x - 30 : win.x + 30
      el.style.transform = `translate(${x}px, ${win.y - 30}px) translate(${flip ? '-100%' : '0'}, -50%)`
    }
    viewer.scene.postRender.addEventListener(placeChip)

    // Symbols and names are drawn over the terrain, so the relief never cuts
    // them; the ones beyond the horizon (the far side) are hidden here instead.
    const facing = new Map<Entity, boolean>()
    const hideFarSide = () => {
      const occluder = new EllipsoidalOccluder(MOON, viewer.camera.positionWC)
      const now = viewer.clock.currentTime
      for (const e of markerEntities.current.values()) {
        const pos = e.position?.getValue(now)
        if (!pos) continue
        // A point lifted 1 km is tested, so sites right on the horizon are not lost.
        const visible = occluder.isPointVisible(Cartesian3.multiplyByScalar(Cartesian3.normalize(pos, new Cartesian3()), R + 1_000, new Cartesian3()))
        if (facing.get(e) === visible) continue
        facing.set(e, visible)
        const show = new ConstantProperty(visible)
        if (e.label) e.label.show = show
        if (e.billboard) e.billboard.show = show
        if (e.point) e.point.show = show
      }
    }
    viewer.scene.postRender.addEventListener(hideFarSide)


    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    const pick = (pos: Cartesian2) => {
      const cart = viewer.camera.pickEllipsoid(pos, MOON)
      if (!cart) return null
      const c = MOON.cartesianToCartographic(cart)
      return { latDeg: CesiumMath.toDegrees(c.latitude), lonEastDeg: normalizeLon(CesiumMath.toDegrees(c.longitude)) }
    }
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      if (!handlers.current.selectable) return
      // A site is chosen only by clicking its symbol. Its name is pickable too,
      // but a click on a label means "this point here": the pointer must stay
      // exactly where the click was, not jump to the centre of the named site.
      const picked = viewer.scene.pick(e.position) as { id?: Entity } | undefined
      for (const [id, ent] of markerEntities.current) {
        if (picked?.id !== ent) continue
        const at = ent.position?.getValue(viewer.clock.currentTime)
        const win = at ? SceneTransforms.worldToWindowCoordinates(viewer.scene, at) : undefined
        if (win && Cartesian2.distance(win, e.position) <= MARKER_HIT_PX) {
          handlers.current.onPickMarker(id)
          return
        }
        break
      }
      const p = pick(e.position)
      if (!p) return
      const round = (v: number) => Math.round(v * 1e4) / 1e4
      handlers.current.onPickPoint({ latDeg: round(p.latDeg), lonEastDeg: round(p.lonEastDeg) })
    }, ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const p = pick(e.endPosition)
      handlers.current.onHover?.(p ? `${formatLat(p.latDeg, 2)}  ${formatLon(p.lonEastDeg, 2)}` : '')
    }, ScreenSpaceEventType.MOUSE_MOVE)

    // Wheel zoom runs straight along the line of sight, so whatever is at the
    // centre of the window stays there: the Moon only comes closer or moves away.
    // (Cesium's own wheel zoom aims at the pointer and slides the Moon sideways.)
    const controller = viewer.scene.screenSpaceCameraController
    controller.zoomEventTypes = [CameraEventType.PINCH]
    const canvas = viewer.scene.canvas
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const camera = viewer.camera
      const centre = new Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
      const hit = camera.pickEllipsoid(centre, MOON)
      const range = hit ? Cartesian3.distance(camera.position, hit) : Cartesian3.magnitude(camera.position)
      const delta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY
      const next = Math.min(8_000_000, Math.max(controller.minimumZoomDistance, range * Math.exp(delta * 0.0015)))
      camera.move(camera.direction, range - next)
      viewer.scene.requestRender()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })

    viewer.camera.setView(HOME)

    const entities = markerEntities.current
    return () => {
      canvas.removeEventListener('wheel', onWheel)
      viewer.scene.postRender.removeEventListener(placeChip)
      viewer.scene.postRender.removeEventListener(hideFarSide)
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      entities.clear()
    }
  }, [])

  // Markers: dots with names, or numbered badges for a ranking.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    for (const e of markerEntities.current.values()) viewer.entities.remove(e)
    markerEntities.current.clear()
    for (const m of markers) {
      const position = Cartesian3.fromDegrees(m.lonEastDeg, m.latDeg, 0, MOON)
      const symbol = m.symbol ?? 'site'
      const robotic = symbol === 'robotic' || symbol === 'robotic-landed'
      const e =
        m.rank !== undefined
          ? viewer.entities.add({
              position,
              billboard: { image: rankBadge(m.rank, m.color), width: 30, height: 30, disableDepthTestDistance: Number.POSITIVE_INFINITY },
              label: rankLabel(m.label),
            })
          : viewer.entities.add({
              position,
              point:
                symbol === 'site'
                  ? { pixelSize: 13, color: selectable ? SITE_FILL : SITE_OFF_FILL, outlineColor: selectable ? SITE_RIM : SITE_OFF_RIM, outlineWidth: 3, disableDepthTestDistance: Number.POSITIVE_INFINITY }
                  : undefined,
              billboard:
                symbol === 'site'
                  ? undefined
                  : { image: SYMBOL_IMAGE[symbol][selectable ? 'on' : 'off'], width: 16, height: 16, disableDepthTestDistance: Number.POSITIVE_INFINITY },
              label: {
                text: m.label,
                // Drawn at 2x and scaled down by half: the text stays sharp on dense screens.
                font: `${robotic ? 'italic 500' : '600'} 26px ${FONT}`,
                scale: 0.5,
                fillColor: !selectable ? SITE_OFF_LABEL : robotic ? ROBOTIC_LABEL : Color.WHITE,
                outlineColor: SPACE,
                outlineWidth: 8,
                style: LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cartesian2(14, 0),
                horizontalOrigin: HorizontalOrigin.LEFT,
                verticalOrigin: VerticalOrigin.CENTER,
                // Every name stays visible at any distance (only the far side of the Moon hides it).
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            })
      markerEntities.current.set(m.id, e)
    }
    if (ring.current?.billboard) ring.current.billboard.image = new ConstantProperty(selectable ? RING : RING_OFF)
    viewer.scene.requestRender()
  }, [markers, selectable])

  // Selection ring and label; hide the plain marker underneath it.
  useEffect(() => {
    const viewer = viewerRef.current
    const e = ring.current
    if (!viewer || !e) return
    placeEntity(e, selected.latDeg, selected.lonEastDeg)
    chipAnchor.current = Cartesian3.fromDegrees(selected.lonEastDeg, selected.latDeg, 0, MOON)
    for (const [id, ent] of markerEntities.current) {
      const m = markers.find((x) => x.id === id)
      setShow(ent, id !== selected.id || m?.rank !== undefined)
    }
    viewer.scene.requestRender()
  }, [selected.latDeg, selected.lonEastDeg, selected.id, markers, selectable])

  // Camera: a short straight dolly, never a rotation (motion sickness).
  const focusKey = focus ? `${focus.latDeg},${focus.lonEastDeg},${focus.distanceM},${focus.screen?.join(',') ?? ''}` : ''
  const focusRef = useRef(focus)
  useEffect(() => {
    focusRef.current = focus
  })
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const f = focusRef.current
    const to = f ? framedPosition(viewer, f) : HOME.destination
    const from = Cartesian3.clone(viewer.camera.position)
    const { direction, up } = HOME.orientation
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || Cartesian3.distance(from, to) < 1) {
      viewer.camera.setView({ destination: to, orientation: { direction, up } })
      return
    }
    let raf = 0
    const t0 = performance.now()
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / DOLLY_MS)
      const e = 1 - Math.pow(1 - k, 4)
      viewer.camera.setView({ destination: Cartesian3.lerp(from, to, e, new Cartesian3()), orientation: { direction, up } })
      viewer.scene.requestRender()
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [focusKey])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.scene.globe.enableLighting = lightMs !== null
    if (lightMs !== null) viewer.scene.light = sunLight(lightMs)
    viewer.scene.requestRender()
  }, [lightMs])

  // Reset: straight back to the current framing, whatever the user dragged.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || resetNonce === 0) return
    const f = focusRef.current
    viewer.camera.setView({ destination: f ? framedPosition(viewer, f) : HOME.destination, orientation: HOME.orientation })
    viewer.scene.requestRender()
  }, [resetNonce])

  // Region outlines. With real shapes, each region is drawn as it is; without
  // them, the parallels that bound the catalogue's two areas stand in.
  const southLat = regionShapes.length ? null : (regions?.southPoleLat ?? null)
  const equatorLat = regionShapes.length ? null : (regions?.equatorialLat ?? null)
  const shapeEntities = useRef<Entity[]>([])
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    for (const e of shapeEntities.current) viewer.entities.remove(e)
    shapeEntities.current = regionShapes.flatMap((shape) =>
      shape.rings.map((ring, i) =>
        viewer.entities.add({
          position: Cartesian3.fromDegrees(...ring.reduce((top, p) => (p[1] > top[1] ? p : top)), 0, MOON),
          label:
            shape.label && i === 0
              ? {
                  text: shape.label,
                  font: `600 28px ${FONT}`,
                  scale: 0.5,
                  fillColor: Color.fromCssColorString('#d9eefc'),
                  outlineColor: SPACE,
                  outlineWidth: 8,
                  style: LabelStyle.FILL_AND_OUTLINE,
                  verticalOrigin: VerticalOrigin.BOTTOM,
                  pixelOffset: new Cartesian2(0, -24),
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                }
              : undefined,
          // Each region as NASA publishes it: a light fill with a thin edge, never merged with the others.
          polyline: {
            positions: Cartesian3.fromDegreesArray(ring.flat(), MOON),
            width: shape.filled ? 1.5 : 2.5,
            arcType: ArcType.GEODESIC,
            material: shape.filled ? REGION_LINE.withAlpha(0.9) : REGION_LINE,
          },
          polygon: shape.filled
            ? { hierarchy: new PolygonHierarchy(Cartesian3.fromDegreesArray(ring.flat(), MOON)), material: SITE_FILL.withAlpha(0.22), arcType: ArcType.GEODESIC }
            : undefined,
        }),
      ),
    )
    viewer.scene.requestRender()
  }, [regionShapes])
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    for (const e of regionEntities.current) viewer.entities.remove(e)
    const lines: { lat: number; label?: string }[] = []
    if (southLat !== null) lines.push({ lat: southLat, label: `South pole · ${Math.abs(southLat)}–90°S` })
    if (equatorLat !== null) lines.push({ lat: equatorLat }, { lat: -equatorLat, label: `Equatorial band · ±${equatorLat}°` })
    regionEntities.current = lines.map((l) =>
      viewer.entities.add({
        polyline: { positions: parallel(l.lat), width: 2, arcType: ArcType.RHUMB, material: REGION_LINE.withAlpha(0.85) },
        position: Cartesian3.fromDegrees(HOME_VIEW.lon, l.lat, 0, MOON),
        label: l.label
          ? {
              text: l.label,
              font: `600 28px ${FONT}`,
              scale: 0.5,
              fillColor: Color.fromCssColorString('#d9eefc'),
              outlineColor: SPACE,
              outlineWidth: 8,
              style: LabelStyle.FILL_AND_OUTLINE,
              verticalOrigin: VerticalOrigin.TOP,
              pixelOffset: new Cartesian2(0, 8),
              translucencyByDistance: new NearFarScalar(1.5e6, 0, 3e6, 1),
            }
          : undefined,
      }),
    )
    viewer.scene.requestRender()
  }, [southLat, equatorLat])

  return (
    <div className="moon-globe">
      <svg className="moon-stars" aria-hidden="true">
        {STARS.map((s, i) => (
          <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} opacity={s.o} />
        ))}
      </svg>
      <div ref={container} className="moon-globe-canvas" />
      <div ref={chip} className="globe-chip" aria-hidden="true">
        {selected.label}
      </div>
      {imageryError && (
        <p className="moon-globe-warning" role="status">
          LRO images are unreachable: the globe shows the reference shape only.
        </p>
      )}
    </div>
  )
}
