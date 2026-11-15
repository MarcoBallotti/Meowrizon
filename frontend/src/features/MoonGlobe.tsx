/**
 * The 3D Moon (CesiumJS), loaded lazily. Rendering only: a smooth reference
 * sphere dressed with the LRO WAC mosaic and a LOLA hillshade so craters read
 * in relief. Optional lighting uses an approximate Sun direction for the
 * chosen date. Nothing drawn here feeds any classification.
 */
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Credit,
  DirectionalLight,
  Ellipsoid,
  Entity,
  GeographicProjection,
  GeographicTilingScheme,
  Globe,
  HorizontalOrigin,
  ImageryLayer,
  LabelStyle,
  Math as CesiumMath,
  NearFarScalar,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer,
  WebMapTileServiceImageryProvider,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { useEffect, useRef, useState } from 'react'
import type { DemProduct, SiteCoordinates } from '../api/types'
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
const INK = Color.fromCssColorString('#171a2b')

const svgUri = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`

const RING = svgUri(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="20" fill="none" stroke="#0b0d1a" stroke-width="8" stroke-opacity="0.5"/><circle cx="28" cy="28" r="20" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="28" cy="28" r="7" fill="#ffffff"/></svg>',
)

/** Numbered badge for ranked regions. The leader is indigo. */
function rankBadge(n: number): string {
  const lead = n === 1
  return svgUri(
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="16" fill="${lead ? '#2B2FA8' : '#ffffff'}" stroke="#0b0d1a" stroke-opacity="0.55" stroke-width="3"/><text x="20" y="26" text-anchor="middle" font-family="Figtree, Arial, sans-serif" font-weight="800" font-size="17" fill="${lead ? '#ffffff' : '#171A2B'}">${n}</text></svg>`,
  )
}

export interface GlobeMarker extends SiteCoordinates {
  id: string
  label: string
  /** When set, a numbered badge replaces the dot and label. */
  rank?: number
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
  const destination = Cartesian3.multiplyByScalar(unit, R * 2.75, new Cartesian3())
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

function setLabel(entity: Entity, text: string) {
  if (entity.label) entity.label.text = new ConstantProperty(text)
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
  showCoverage: boolean
  coverageProducts: DemProduct[]
  onPickMarker: (id: string) => void
  onPickPoint: (site: SiteCoordinates) => void
  onHover?: (text: string) => void
}

export default function MoonGlobe({ markers, selected, focus, lightMs, showCoverage, coverageProducts, onPickMarker, onPickPoint, onHover }: MoonGlobeProps) {
  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const ring = useRef<Entity | null>(null)
  const markerEntities = useRef<Map<string, Entity>>(new Map())
  const coverage = useRef<Entity[]>([])
  const handlers = useRef({ onPickMarker, onPickPoint, onHover })
  const [imageryError, setImageryError] = useState(false)

  useEffect(() => {
    handlers.current = { onPickMarker, onPickPoint, onHover }
  }, [onPickMarker, onPickPoint, onHover])

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
    })
    const relief = viewer.imageryLayers.addImageryProvider(shade)
    relief.alpha = 0.55
    relief.brightness = 1.15

    viewer.scene.backgroundColor = SPACE
    viewer.scene.fog.enabled = false
    if (viewer.scene.sun) viewer.scene.sun.show = false
    if (viewer.scene.moon) viewer.scene.moon.show = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 15_000
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 9_000_000
    viewerRef.current = viewer



    ring.current = viewer.entities.add({
      billboard: { image: RING, width: 44, height: 44, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: '',
        font: `600 17px ${FONT}`,
        fillColor: INK,
        showBackground: true,
        backgroundColor: Color.WHITE,
        backgroundPadding: new Cartesian2(14, 9),
        pixelOffset: new Cartesian2(30, -30),
        horizontalOrigin: HorizontalOrigin.LEFT,
        verticalOrigin: VerticalOrigin.CENTER,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    const pick = (pos: Cartesian2) => {
      const cart = viewer.camera.pickEllipsoid(pos, MOON)
      if (!cart) return null
      const c = MOON.cartesianToCartographic(cart)
      return { latDeg: CesiumMath.toDegrees(c.latitude), lonEastDeg: normalizeLon(CesiumMath.toDegrees(c.longitude)) }
    }
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const picked = viewer.scene.pick(e.position) as { id?: Entity } | undefined
      for (const [id, ent] of markerEntities.current) {
        if (picked?.id === ent) {
          handlers.current.onPickMarker(id)
          return
        }
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

    viewer.camera.setView(HOME)

    const entities = markerEntities.current
    return () => {
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
      const e =
        m.rank !== undefined
          ? viewer.entities.add({
              position,
              billboard: { image: rankBadge(m.rank), width: 30, height: 30, disableDepthTestDistance: Number.POSITIVE_INFINITY },
            })
          : viewer.entities.add({
              position,
              point: { pixelSize: 9, color: Color.WHITE, outlineColor: SPACE, outlineWidth: 2 },
              label: {
                text: m.label,
                font: `600 15px ${FONT}`,
                fillColor: Color.WHITE,
                outlineColor: SPACE,
                outlineWidth: 4,
                style: LabelStyle.FILL_AND_OUTLINE,
                pixelOffset: new Cartesian2(10, 0),
                horizontalOrigin: HorizontalOrigin.LEFT,
                verticalOrigin: VerticalOrigin.CENTER,
                translucencyByDistance: new NearFarScalar(1.5e6, 1, 5e6, 0.0),
              },
            })
      markerEntities.current.set(m.id, e)
    }
    viewer.scene.requestRender()
  }, [markers])

  // Selection ring and label; hide the plain marker underneath it.
  useEffect(() => {
    const viewer = viewerRef.current
    const e = ring.current
    if (!viewer || !e) return
    placeEntity(e, selected.latDeg, selected.lonEastDeg)
    setLabel(e, selected.label)
    for (const [id, ent] of markerEntities.current) {
      const m = markers.find((x) => x.id === id)
      setShow(ent, id !== selected.id || m?.rank !== undefined)
    }
    viewer.scene.requestRender()
  }, [selected.latDeg, selected.lonEastDeg, selected.label, selected.id, markers])

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

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    for (const entity of coverage.current) viewer.entities.remove(entity)
    coverage.current = coverageProducts.filter((p) => p.available).flatMap((p) => [
      { lat: p.latMinDeg, label: p.title }, { lat: p.latMaxDeg, label: p.title },
    ]).filter((c) => Math.abs(c.lat) < 90).map((c) =>
      viewer.entities.add({
        show: false,
        polyline: { positions: parallel(c.lat), width: 1.5, arcType: ArcType.RHUMB, material: Color.fromCssColorString('#9fb8ff').withAlpha(0.7) },
        position: Cartesian3.fromDegrees(0, c.lat, 0, MOON),
        label: {
          text: c.label,
          font: `500 12px "JetBrains Mono", ui-monospace, monospace`,
          fillColor: Color.fromCssColorString('#cfdcff'),
          outlineColor: SPACE,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -4),
        },
      }),
    )
    viewer.scene.requestRender()
  }, [coverageProducts])

  useEffect(() => {
    for (const e of coverage.current) setShow(e, showCoverage)
    viewerRef.current?.scene.requestRender()
  }, [showCoverage, coverageProducts])

  return (
    <div className="moon-globe">
      <div ref={container} className="moon-globe-canvas" />
      {imageryError && (
        <p className="moon-globe-warning" role="status">
          LRO images are unreachable: the globe shows the reference shape only.
        </p>
      )}
    </div>
  )
}
