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
import { subSolarPoint } from '../domain/approxEphemeris'
import { formatLat, formatLon } from '../domain/format'
import { EXAMPLE_SITES, normalizeLon } from '../domain/sites'
import { getState, setScenarioInput, useStore } from '../state/store'
import { globeHandle } from './globeHandle'

const MOON = Ellipsoid.MOON
const R = 1_737_400

const TREK = 'https://trek.nasa.gov/tiles/Moon/EQ'
const WAC_LAYER = 'LRO_WAC_Mosaic_Global_303ppd_v02'
const SHADE_LAYER = 'LRO_LOLA_Shade_Global_256ppd_v06'

const FONT = '"Figtree", system-ui, sans-serif'
const SPACE = Color.fromCssColorString('#0b0c1a')
const INK = Color.fromCssColorString('#171a2b')

const COVERAGE_LINES = [
  { lat: -80, label: 'LOLA 20 m · 80°S' },
  { lat: -87, label: 'LOLA 5 m · 87°S' },
  { lat: -60, label: 'SLDEM2015 · 60°S' },
  { lat: 60, label: 'SLDEM2015 · 60°N' },
]

const RING = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56"><circle cx="28" cy="28" r="20" fill="none" stroke="#0b0d1a" stroke-width="8" stroke-opacity="0.5"/><circle cx="28" cy="28" r="20" fill="none" stroke="#ffffff" stroke-width="4"/><circle cx="28" cy="28" r="7" fill="#ffffff"/></svg>',
)}`


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

/** Camera looking at the Moon's centre from above a latitude tilted towards the site. */
function overviewPose(lat: number, lon: number) {
  const viewLat = lat < -55 ? -52 : lat > 55 ? 52 : lat
  const unit = Cartesian3.normalize(Cartesian3.fromDegrees(lon, viewLat, 0, MOON), new Cartesian3())
  const destination = Cartesian3.multiplyByScalar(unit, R * 2.75, new Cartesian3())
  const direction = Cartesian3.negate(unit, new Cartesian3())
  const z = Cartesian3.UNIT_Z
  const up = Cartesian3.normalize(
    Cartesian3.subtract(z, Cartesian3.multiplyByScalar(direction, Cartesian3.dot(z, direction), new Cartesian3()), new Cartesian3()),
    new Cartesian3(),
  )
  return { destination, orientation: { direction, up } }
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
  /** Light the globe as on the chosen date (approximate Sun direction). */
  realLight: boolean
  showCoverage: boolean
  onHover?: (text: string) => void
}

export default function MoonGlobe({ realLight, showCoverage, onHover }: MoonGlobeProps) {
  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const selected = useRef<Entity | null>(null)
  const siteEntities = useRef<Map<string, Entity>>(new Map())
  const coverage = useRef<Entity[]>([])
  const hoverRef = useRef(onHover)
  const [imageryError, setImageryError] = useState(false)

  const site = useStore((s) => s.scenarios.A.input.site)
  const siteName = useStore((s) => s.scenarios.A.input.siteName)
  const startMs = useStore((s) => s.scenarios.A.input.startMs)

  useEffect(() => {
    hoverRef.current = onHover
  }, [onHover])

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

    for (const s of EXAMPLE_SITES) {
      const e = viewer.entities.add({
        position: Cartesian3.fromDegrees(s.lonEastDeg, s.latDeg, 0, MOON),
        point: { pixelSize: 9, color: Color.WHITE, outlineColor: SPACE, outlineWidth: 2 },
        label: {
          text: s.short,
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
      siteEntities.current.set(s.name, e)
    }

    coverage.current = COVERAGE_LINES.map((c) =>
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

    selected.current = viewer.entities.add({
      billboard: { image: RING, width: 44, height: 44, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: {
        text: '',
        font: `700 17px ${FONT}`,
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
      const known = picked?.id ? EXAMPLE_SITES.find((s) => siteEntities.current.get(s.name) === picked.id) : undefined
      if (known) {
        setScenarioInput('A', { site: { latDeg: known.latDeg, lonEastDeg: known.lonEastDeg }, siteName: known.name })
        return
      }
      const p = pick(e.position)
      if (!p) return
      const round = (v: number) => Math.round(v * 1e4) / 1e4
      setScenarioInput('A', { site: { latDeg: round(p.latDeg), lonEastDeg: round(p.lonEastDeg) }, siteName: null })
    }, ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const p = pick(e.endPosition)
      hoverRef.current?.(p ? `${formatLat(p.latDeg, 2)}  ${formatLon(p.lonEastDeg, 2)}` : '')
    }, ScreenSpaceEventType.MOUSE_MOVE)

    const { site: s0 } = getState().scenarios.A.input
    viewer.camera.setView(overviewPose(s0.latDeg, s0.lonEastDeg))

    globeHandle.flyDown = (lat, lon) =>
      new Promise<void>((resolve) => {
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(lon, lat, 18_000, MOON),
          orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
          duration: 2.1,
          complete: () => resolve(),
          cancel: () => resolve(),
        })
      })

    const entities = siteEntities.current
    return () => {
      globeHandle.flyDown = null
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      entities.clear()
    }
  }, [])

  // Selected site: ring, label, and a gentle turn of the globe towards it.
  useEffect(() => {
    const viewer = viewerRef.current
    const e = selected.current
    if (!viewer || !e) return
    placeEntity(e, site.latDeg, site.lonEastDeg)
    setLabel(e, siteName ?? 'Custom point')
    for (const [name, ent] of siteEntities.current) setShow(ent, name !== siteName)
    viewer.camera.flyTo({ ...overviewPose(site.latDeg, site.lonEastDeg), duration: 1.4 })
    viewer.scene.requestRender()
  }, [site, siteName])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    viewer.scene.globe.enableLighting = realLight
    viewer.scene.light = sunLight(startMs)
    viewer.scene.requestRender()
  }, [realLight, startMs])

  useEffect(() => {
    for (const e of coverage.current) setShow(e, showCoverage)
    viewerRef.current?.scene.requestRender()
  }, [showCoverage])

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
