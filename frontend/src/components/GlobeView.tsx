/**
 * Lunar globe (CesiumJS), loaded lazily. Rendering only: the globe is a
 * smooth Moon ellipsoid with LRO WAC imagery, so its GPU shading never feeds
 * any scientific classification. Picking returns planetocentric lat/lon on
 * the reference sphere (R = 1737.4 km).
 */
import {
  ArcType,
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  Credit,
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
import { formatLat, formatLon } from '../domain/format'
import { EXAMPLE_SITES, normalizeLon } from '../domain/sites'
import { getState, setScenarioInput, setState, useStore, type ScenarioKey } from '../state/store'

const MOON = Ellipsoid.MOON

const WAC_URL =
  'https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.jpg'

const SCENARIO_COLOR: Record<ScenarioKey, string> = { A: '#f3f4f6', B: '#b4a7ff' }

/** Bands of the DEM catalogue, drawn as parallels for orientation. */
const COVERAGE_LINES = [
  { lat: -80, label: 'LOLA 20 m · 80°S' },
  { lat: -87, label: 'LOLA 5 m · 87°S' },
  { lat: -60, label: 'SLDEM2015 · 60°S' },
  { lat: 60, label: 'SLDEM2015 · 60°N' },
]

function parallel(lat: number): Cartesian3[] {
  const pts: number[] = []
  for (let lon = -180; lon <= 180; lon += 2) pts.push(lon, lat)
  return Cartesian3.fromDegreesArray(pts, MOON)
}

function flyTo(viewer: Viewer, lat: number, lon: number, duration = 1.6) {
  const polar = Math.abs(lat) > 75
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(lon, lat, polar ? 420_000 : 900_000, MOON),
    orientation: { heading: 0, pitch: CesiumMath.toRadians(-90), roll: 0 },
    duration,
  })
}

// Cesium entities are imperative scene objects owned by the viewer.
function placeEntity(entity: Entity, lat: number, lon: number, show: boolean) {
  entity.position = new ConstantPositionProperty(Cartesian3.fromDegrees(lon, lat, 0, MOON))
  entity.show = show
}

function setEntityVisible(entity: Entity, show: boolean) {
  entity.show = show
}

export default function GlobeView() {
  const container = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const markers = useRef<Partial<Record<ScenarioKey, Entity>>>({})
  const hoverRef = useRef<HTMLSpanElement>(null)
  const [imageryError, setImageryError] = useState(false)
  const [showCoverage, setShowCoverage] = useState(true)
  const coverageEntities = useRef<Entity[]>([])

  const siteA = useStore((s) => s.scenarios.A.input.site)
  const siteB = useStore((s) => s.scenarios.B.input.site)
  const compare = useStore((s) => s.compare)
  const active = useStore((s) => s.active)
  const flyRequest = useStore((s) => s.flyRequest)

  // Create the viewer once.
  useEffect(() => {
    if (!container.current) return
    Ellipsoid.default = MOON

    const imagery = new WebMapTileServiceImageryProvider({
      url: WAC_URL,
      layer: 'LRO_WAC_Mosaic_Global_303ppd_v02',
      style: 'default',
      tileMatrixSetID: 'default028mm',
      format: 'image/jpeg',
      tilingScheme: new GeographicTilingScheme({ ellipsoid: MOON, numberOfLevelZeroTilesX: 2, numberOfLevelZeroTilesY: 1 }),
      maximumLevel: 7,
      credit: new Credit('LRO WAC mosaic · NASA/GSFC/Arizona State University · via NASA Moon Trek'),
    })
    let tileErrors = 0
    imagery.errorEvent.addEventListener(() => {
      tileErrors += 1
      if (tileErrors > 6) setImageryError(true)
    })

    const globe = new Globe(MOON)
    globe.baseColor = Color.fromCssColorString('#3a3d43')
    globe.showGroundAtmosphere = false
    globe.enableLighting = false

    const viewer = new Viewer(container.current, {
      globe,
      baseLayer: new ImageryLayer(imagery),
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
    viewer.scene.backgroundColor = Color.fromCssColorString('#0b0c0e')
    viewer.scene.fog.enabled = false
    if (viewer.scene.sun) viewer.scene.sun.show = false
    if (viewer.scene.moon) viewer.scene.moon.show = false
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 20_000
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 12_000_000
    viewerRef.current = viewer

    for (const site of EXAMPLE_SITES) {
      viewer.entities.add({
        position: Cartesian3.fromDegrees(site.lonEastDeg, site.latDeg, 0, MOON),
        point: { pixelSize: 5, color: Color.fromCssColorString('#9aa1ab'), outlineColor: Color.BLACK, outlineWidth: 1 },
        label: {
          text: site.name,
          font: '500 11px "IBM Plex Sans", system-ui, sans-serif',
          fillColor: Color.fromCssColorString('#c9ced6'),
          outlineColor: Color.fromCssColorString('#0b0c0e'),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cartesian2(8, 0),
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          translucencyByDistance: new NearFarScalar(4e5, 1, 3e6, 0),
        },
      })
    }

    coverageEntities.current = COVERAGE_LINES.map((c) =>
      viewer.entities.add({
        polyline: {
          positions: parallel(c.lat),
          width: 1.2,
          arcType: ArcType.RHUMB,
          material: Color.fromCssColorString('#7fb6ff').withAlpha(0.45),
        },
        position: Cartesian3.fromDegrees(0, c.lat, 0, MOON),
        label: {
          text: c.label,
          font: '500 10px "IBM Plex Mono", ui-monospace, monospace',
          fillColor: Color.fromCssColorString('#9cc6ff'),
          outlineColor: Color.fromCssColorString('#0b0c0e'),
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: VerticalOrigin.BOTTOM,
          pixelOffset: new Cartesian2(0, -4),
        },
      }),
    )

    const handler = new ScreenSpaceEventHandler(viewer.scene.canvas)
    const pick = (pos: Cartesian2) => {
      const cart = viewer.camera.pickEllipsoid(pos, MOON)
      if (!cart) return null
      const c = MOON.cartesianToCartographic(cart)
      return { latDeg: CesiumMath.toDegrees(c.latitude), lonEastDeg: normalizeLon(CesiumMath.toDegrees(c.longitude)) }
    }
    handler.setInputAction((e: ScreenSpaceEventHandler.PositionedEvent) => {
      const site = pick(e.position)
      if (!site) return
      const round = (v: number) => Math.round(v * 1e5) / 1e5
      setScenarioInput(getState().active, { site: { latDeg: round(site.latDeg), lonEastDeg: round(site.lonEastDeg) }, siteName: null })
    }, ScreenSpaceEventType.LEFT_CLICK)
    handler.setInputAction((e: ScreenSpaceEventHandler.MotionEvent) => {
      const site = pick(e.endPosition)
      if (hoverRef.current) {
        hoverRef.current.textContent = site ? `${formatLat(site.latDeg)}  ${formatLon(site.lonEastDeg)}` : ''
      }
    }, ScreenSpaceEventType.MOUSE_MOVE)

    const { site } = getState().scenarios[getState().active].input
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(site.lonEastDeg, site.latDeg, 3_200_000, MOON),
    })
    flyTo(viewer, site.latDeg, site.lonEastDeg, 2.2)

    return () => {
      handler.destroy()
      viewer.destroy()
      viewerRef.current = null
      markers.current = {}
    }
  }, [])

  // Scenario markers.
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return
    const sites: [ScenarioKey, typeof siteA, boolean][] = [
      ['A', siteA, true],
      ['B', siteB, compare],
    ]
    for (const [key, site, show] of sites) {
      let entity = markers.current[key]
      if (!entity) {
        entity = viewer.entities.add({
          point: {
            pixelSize: 11,
            color: Color.fromCssColorString(SCENARIO_COLOR[key]),
            outlineColor: Color.fromCssColorString('#0b0c0e'),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: key,
            font: '600 12px "IBM Plex Sans", system-ui, sans-serif',
            fillColor: Color.fromCssColorString('#0b0c0e'),
            showBackground: true,
            backgroundColor: Color.fromCssColorString(SCENARIO_COLOR[key]),
            backgroundPadding: new Cartesian2(5, 3),
            pixelOffset: new Cartesian2(0, -18),
            verticalOrigin: VerticalOrigin.BOTTOM,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        })
        markers.current[key] = entity
      }
      placeEntity(entity, site.latDeg, site.lonEastDeg, show)
    }
    viewer.scene.requestRender()
  }, [siteA, siteB, compare])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !flyRequest) return
    const { site } = getState().scenarios[flyRequest.key].input
    flyTo(viewer, site.latDeg, site.lonEastDeg)
  }, [flyRequest])

  useEffect(() => {
    for (const e of coverageEntities.current) setEntityVisible(e, showCoverage)
    viewerRef.current?.scene.requestRender()
  }, [showCoverage])

  return (
    <div className="globe">
      <div ref={container} className="globe-canvas" />
      <div className="globe-overlay globe-overlay-top">
        <span className="globe-hint">
          Clic sul globo per spostare {compare ? `lo scenario ${active}` : 'il punto'}
        </span>
        <label className="toggle toggle-small">
          <input type="checkbox" checked={showCoverage} onChange={(e) => setShowCoverage(e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          <span>Coperture DEM</span>
        </label>
      </div>
      <div className="globe-overlay globe-overlay-bottom">
        <span ref={hoverRef} className="globe-coords tabular" aria-live="off" />
        <button className="btn btn-small" onClick={() => setState({ flyRequest: { key: active, nonce: Date.now() } })}>
          Centra sul punto
        </button>
      </div>
      {imageryError && (
        <p className="globe-warning" role="status">
          Immagini LRO non raggiungibili: il globo mostra solo la forma di riferimento.
        </p>
      )}
    </div>
  )
}
