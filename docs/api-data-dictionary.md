# HTTP data dictionary

Reviewed on **2026-11-15** against [frontend types](../frontend/src/api/types.ts), [request models](../backend/app/api/scientific.py) and the HTTP calculation modules. See the [API contract](api-contract.md) for routes and errors. Additional provenance fields emitted by the backend may exceed the minimal frontend interfaces.

## Shared conventions

| Concept | Representation |
|---|---|
| Coordinates | `{latDeg,lonEastDeg}`, planetocentric degrees, east longitude normalized to `[-180,180)` |
| GeoJSON position | `[longitude,latitude]`, not latitude first |
| Request time | ISO 8601 UTC ending in `Z` |
| Series time | Unix UTC milliseconds |
| Interval | `[startMs,endMs)`; boundary samples may support interpolation without adding duration |
| Azimuth | Degrees clockwise from local north |
| Elevation | Degrees above the observer's local horizontal |
| Horizon | Terrain elevation angle; may be negative |
| Height / distance | Metres / kilometres unless the field specifies otherwise |
| Fractions | `[0,1]`; missing values must not become zero |
| Origin | `demo` = synthetic; `engine` = backend output, not validation certification |

## Coverage and catalogs

`CoverageCatalog` contains `origin` and `products[]`. Each product has `id`, `title`, `pixelSizeM`, latitude bounds, `source`, `url`, `notes` and `available`. Declared pixel size is not measured physical accuracy. An empty list is valid and must not trigger invented coverage bands.

`/api/regions` and `/api/sites` return GeoJSON catalogs with source metadata and snake_case properties. Region/site adapters retain distinct identities and source geometries. `active` describes the CLI development subset, not whether every catalog point may appear in the interface. Catalogs contain no epoch-specific illumination metrics.

## Terrain

| Field | Meaning |
|---|---|
| `TerrainAnalysis.id` | Scientific result ID used by scenario requests |
| `origin`, `preview` | Source and preview status |
| `profile.azimuthDeg[]`, `elevationDeg[]` | Parallel horizon arrays, azimuth increasing over `[0,360)` |
| `profile.observer.site` | Requested coordinates |
| `surfaceHeightM`, `heightAboveSurfaceM`, `referenceRadiusKm` | DEM altitude, observer height and reference sphere |
| `profile.dem.productIds[]` | Products actually used |
| `effectivePixelSizeM` | Coarsest declared raster spacing used; not measured terrain uncertainty |
| `noDataFraction` | Reported missing-data fraction |
| `profile.params` | Requested azimuth step and maximum distance |
| `algorithmVersion`, `warnings[]` | Method identity and limitations |
| Backend `coordinateFrame`, `frameVersion`, `sources[]` | Additional frame/product/checksum provenance |

Optional `localTerrain` contains `status` (`ok` or `unknown`), `reason`, nullable `slopeDeg` and `roughnessRmsM`, `supportDiameterM`, `sourcePixelSizeM`, `sampleCount`, nullable `validFraction`, `productId` and `sha256`. Roughness is the plane-fit residual RMS, not a complete obstacle model. The 100 m circular fit requires enough native samples; a resampled coarse global DEM yields unknown local measurements.

## Scenario

| Field | Meaning |
|---|---|
| `id`, `origin`, `terrainAnalysisId` | Result identity and terrain dependency |
| `timeScale` | `UTC` |
| `timesMs[]` | Shared timestamps for body arrays |
| `sun`, `earth` | `BodyTrack` values on that grid |
| `intervals.sun/earth/both[]` | C3 visibility windows in current engine results |
| `intervals.eclipse[]` | Optional Earth/Sun overlap intervals |
| `visibilityModel` | `body-center` or `disc-fraction-c3`; consumers must read it |
| `solarOccultedFraction[]` | Optional eclipse fraction |
| `eclipseCalendar` | Optional range, source and local events |
| `orbit` | Optional timestamps, Sun/Moon kilometre vectors, frame and source |
| `ephemeris` | Source, version, kernels and corrections |
| `approximations[]` | Declared model limitations |

`BodyTrack` requires azimuth, elevation, horizon and `centerVisible` arrays. Optional arrays include `visibleFraction`, `terrainVisibleFraction`, `angularRadiusDeg`, `distanceKm` and `illuminatedFraction`. `centerVisible` tests the center against the horizon and does not replace finite-disc C3 classification. Earth geometric visibility is independent of its illuminated phase.

`TimeInterval` carries `startMs`, `endMs` and optional `startTruncated`/`endTruncated`. Clipping at the analysis boundary does not prove a sunrise, Earthset or complete outage duration. The HTTP shape does not express every CLI boundary-cause/coverage field; do not infer omitted information.

A `SkippedEvaluation` is a separate union member with `skipped:true`, `origin:"engine"`, terrain ID, start/stop, `reason:"sunlight_below_threshold"`, `minSunFraction` and `sunFractionUpperBound`. It contains no completed Earth/joint assessment. A completed job can legitimately carry this screening result.

## CLI distinction

The CLI uses snake_case Pydantic models and versioned [request](../backend/schemas/analysis-request-v1.schema.json) / [result](../backend/schemas/analysis-result-v1.schema.json) schemas. It records `fSunTerrain`, `fSun`, `fEarth`, per-metric unknown reasons, coverage, boundary causes and duration lower bounds. These are not aliases for absent HTTP fields. Any adapter must preserve definitions, units, gaps and truncation explicitly.

The [scientific criteria](criteri-algoritmo.md) govern interpretation. Annual P50, regional B/A5/A10/A15 areas and date-persistence intersections are deferred outputs, not missing fields to populate with zero.
