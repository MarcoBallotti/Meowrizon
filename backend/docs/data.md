# Meowrizon data reference

> Historical planning record, moved inside the backend at the user's request. Current runnable service instructions and backend-local data paths are in [../README.md](../README.md). References to frontend/repository files below are planning context, not runtime dependencies.

**Scientific precedence, 2026-11-15:** [criteria](../../docs/criteri-algoritmo.md) and
[implementation plan](../../docs/piano-logica.md) define the approved general surface
engine. Earlier flight/vehicle inputs, fixed stays, weighted scores and automatic slope
rejections below are historical proposals. The selected model uses visible-disc fractions
(Sun including Earth occultation), descriptive slope bands [0°,5°), [5°,10°), [10°,15°),
≥15°, no automatic 10° filter, cumulative areas and four-neighbour connected areas,
with data coverage and uncertainty. Events extend until found or source coverage ends;
the annual statistic uses the complete 365/366-day UTC year. Source responses remain
valid acquisition examples, not proof that these calculations or HTTP contracts exist.

This document preserves source-response examples, types and units, alongside the earlier
proposal for **launch-pad liftoff, ascent, Earth-to-Moon transfer, lunar landing, and
spacecraft position at a selected time**. That full-flight proposal is outside the
current general surface engine. [pipeline.md](pipeline.md) preserves its historical flow.

In that historical full-flight proposal, a launch date/time also required a defined launch site, vehicle, guidance and mission model; the lunar data APIs alone cannot generate a new spacecraft's full flight. Section 11 records those additional inputs and outputs. The current surface engine instead accepts T directly and does not require them.

Implemented storage update, 2026-11-14: **FastAPI with files, no database**. Original downloads remain in `data/raw/`; `python -m backend.app prepare` creates a JSON provenance manifest and compressed Parquet tables in `data/prepared/`. Numerical time-series columns use int64 UTC milliseconds and float64 measurements; native geometry and auxiliary fields retain their original JSON, while terrain pixels stay in GeoTIFF with their original dtype/CRS/masks. See [backend/README.md](../README.md#storage-for-analysis) for the exact internal formats, Python filtering examples and supported parser layouts. Prepared data is not yet a scientific scenario result or landing-site ranking.

## 1. What was checked

Small live requests were made on **2026-11-14**. These checks confirm access, response formats, and selected values. They do not validate the complete scientific model, regional coverage, or the external prototype described in [README.md](README.md).

| Source/product                          | Check and observed result                                                                                                                                                                                                                                                  |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moon Trek south-polar product catalog   | HTTP 200 JSON; reported 396 products. A two-record page included the Artemis candidate-region product below. Counts are observations, not constants.                                                                                                                       |
| Candidate-region feature service        | Metadata and unpaginated query succeeded; 13 polygon features returned. A query with `resultRecordCount=2` returned HTTP 200 with a pagination error in the body.                                                                                                          |
| LOLA 5 m ImageServer                    | Metadata, point identification, and a 4 × 4 floating-point TIFF export succeeded.                                                                                                                                                                                          |
| JPL Horizons                            | Three sequential observer requests succeeded: local Sun, local Earth, and the global sub-observer/sub-solar table. Each contained three hourly samples. A subsequent geometric-vector query returned two Moon position/velocity samples relative to Earth; see section 11. |
| PDS `ldem_75s_240m.lbl`                 | Label downloaded and inspected; the corresponding large IMG was not downloaded or range-tested.                                                                                                                                                                            |
| Moon Trek WMTS                          | Global WAC capabilities XML retrieved. Individual imagery tiles were not fetched in this check.                                                                                                                                                                            |
| QuickMap, SPICE, complete grid analysis | No live QuickMap panorama comparison, SPICE run, or regional analysis was performed for this document.                                                                                                                                                                     |

The numeric examples below are **observed source responses** unless marked **proposed** or **illustrative**. Source response excerpts omit unrelated fields; those omissions must not be interpreted as missing fields in the original response.

## 2. Data map

| Data | Source | Received representation | Purpose |
|---|---|---|---|
| Product catalog | Moon Trek | UTF-8 JSON | Discover data, metadata, product IDs, coverage and available services. |
| Candidate regions | Moon Trek feature service | ArcGIS JSON polygon geometry | Choose search areas and show named regions. These are regions, not approved touchdown coordinates. |
| Terrain elevation | Moon Trek ImageServer | GeoTIFF with float32 samples | Height, terrain horizon and terrain-derived metrics. |
| Alternative terrain download | PDS LOLA | PDS3 text label plus binary IMG | Local terrain processing with explicit scaling and projection metadata. |
| Sun/Earth ephemerides | JPL Horizons | JSON envelope containing a text/CSV table | Direction and distance over time. |
| Offline ephemerides | Cached JPL Horizons responses | Original text/CSV within JSON and prepared tables | Reuse selected-source data with verified coverage and provenance. The earlier NAIF/SPICE alternative is outside the approved engine. |
| Basemap | Moon Trek WMTS | XML capabilities and JPEG/PNG image tiles | Visual context in React/Cesium. Pixels are not numerical elevation. |
| Horizon masks, windows, regional metrics | Our backend, planned calculations | Numeric arrays and JSON | Derived measurements with coverage and provenance; no global suitability score or automatic slope rejection. |

## 3. Moon Trek product catalog

Observed request:

```text
GET https://trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems
    ?proj=urn:ogc:def:crs:IAU2000::30120
    &start=0&rows=2&facetKeys=itemType&facetValues=product
```

Observed excerpt:

```json
{
  "response": {
    "numFound": 396,
    "start": 0,
    "docs": [{
      "item_DBID": "292022",
      "item_UUID": "2a261565-52ca-42e2-ab67-01427512dbea",
      "productLabel": "A3_Named_regions_SP",
      "title": "Artemis III Candidate Landing Regions, S Pole",
      "fileSize": [3565],
      "productCat1": "Feature",
      "productCat2": "Landing Site",
      "trekProjection": "urn:ogc:def:crs:IAU2000::30120",
      "data_created_date": "2022-08-22T21:24:58Z",
      "resolution": 0.0,
      "serviceTypes": ["Feature", "Mosaic"]
    }]
  }
}
```

| Field | Received type | How to use it |
|---|---|---|
| `response.numFound`, `start` | integer | Catalog paging; do not assume the first page is complete. |
| `response.docs` | array of objects | Products, not site coordinates. |
| `item_UUID`, `productLabel` | string | Preserve as opaque source identifiers. |
| `item_DBID` | string in catalog; integer in service response | Normalize identifiers to strings. |
| `fileSize` | array of integers | Preserve raw metadata; verify units/meaning before deriving download plans. |
| `resolution` | number | Product-dependent. Zero on this vector product is not a 0 m DEM resolution. |
| `serviceTypes` | string array | Discover supported feature/raster/imagery access. |
| `projection` | WKT string, omitted above | Source coordinate system; keep the full value. |
| `data_created_date` | timestamp string | Product history; not a guarantee of current mission designation. |
| `_version_` | large integer | May exceed JavaScript's safe integer range. Preserve as a string in our API or omit it. |

Resolve a product's services with:

```text
GET https://trek.nasa.gov/moon/TrekServices/ws/index/getLayerServices
    ?uuid=2a261565-52ca-42e2-ab67-01427512dbea
```

The actual feature-service record included:

```json
{
  "serviceType": "Feature",
  "protocol": "ArcGISFeature",
  "endPoint": "https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0"
}
```

Discover endpoints from metadata instead of assuming every product uses the same path or service type.

## 4. Candidate regions: real geometry is available

The catalog description explicitly identifies `A3_Named_regions_SP` as the **13 regions announced in August 2022**. Preserve that provenance and verify current mission references separately. Do not present this layer as the latest official shortlist without checking.

Working query parameters, URL-encoded by the HTTP client:

```text
GET https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query
where=1=1
outFields=FID,label,selected
returnGeometry=true
f=json
```

Observed first feature:

```json
{
  "attributes": {"FID": 0, "label": "Amundsen Rim", "selected": 0},
  "geometry": {
    "rings": [[
      [153999.99991475398, 71499.99996664487],
      [173999.9999080953, 71499.99996449461],
      [173999.9999188009, 51499.999975083345],
      [154000.00005797678, 51500.00002155204],
      [153999.99991475398, 71499.99996664487]
    ]]
  }
}
```

- The response declares `geometryType: "esriGeometryPolygon"` and includes `spatialReference.wkt`.
- `FID` is an integer identifier, `label` is a string, and `selected` is a source small-integer attribute. Do not interpret `selected` as safety, suitability, or priority.
- `rings` has type `number[][][]`: rings → vertices → `[x, y]`. Here coordinates are **metres in the lunar south-polar projection**, not longitude/latitude.
- Reproject with the returned lunar WKT. Do not treat this ArcGIS payload as geographic GeoJSON or project it through Earth's EPSG:4326.
- Region polygons contain possible search points. A centroid is only a representative map position; it is not an assessed landing point.
- The service reported `supportsPagination: false`. For this small layer, fetching all 13 features worked. For larger layers, inspect capabilities and use supported ID-based batches where necessary.

Actual failed response when pagination was requested, despite HTTP 200:

```json
{"error":{"code":400,"message":"Pagination is not supported.","details":[]}}
```

## 5. Numeric terrain: ImageServer GeoTIFF

Metadata endpoint checked:

```text
https://trek.nasa.gov/moon/trekarcgis/rest/services/LRO_LOLA_DEM_SPole875_5mp_v04/ImageServer?f=json
```

Observed fields:

```json
{
  "name": "LRO_LOLA_DEM_SPole875_5mp_v04",
  "pixelType": "F32",
  "bandCount": 1,
  "pixelSizeX": 5,
  "pixelSizeY": 5,
  "minValues": [-4382.5],
  "maxValues": [2372.5],
  "maxImageHeight": 4100,
  "maxImageWidth": 15000
}
```

The observed extent was `xmin=-75840, ymin=-75840, xmax=75840, ymax=75840` metres. The WKT defines a south-polar stereographic projection on a sphere of radius **1,737,400 m**. The high-resolution product does not cover every candidate region; intersect source coverage with the requested region and select other DEMs as needed.

Tiny checked export, using the same ImageServer base URL:

```text
/exportImage?bbox=-10,-10,10,10&size=4,4&format=tiff
             &pixelType=F32&interpolation=RSP_NearestNeighbor&f=image
```

The response was `image/tiff`, a 4 × 4 single-band IEEE float32 image. Its tie point was `(-10, 10)` and pixel size `(5, 5)` metres. Decoded elevation samples, in row order:

```text
1291.5  1290.5  1289.5  1288.5
1291.5  1290.0  1289.5  1288.5
1291.5  1289.5  1289.0  1288.5
1292.0  1290.5  1289.5  1289.0
```

These are measurements near the projection origin, not measurements for a selected candidate site. Preserve the GeoTIFF transform, WKT, pixel registration, resolution and validity mask alongside the array. A TIFF is a binary file, not a JSON matrix. Use Rasterio/GDAL for production reads; this check only decoded the small sample and inspected its TIFF tags.

The `/identify` request at `{"x":0,"y":0}` returned `"value":"1289"`: a **string**, even though it represents elevation. Parse only after checking for no-data/error values. It is not a replacement for retrieving a surrounding DEM.

The metadata response did not establish a universal no-data sentinel. Read each raster's mask/sentinel and quality metadata; retain valid zero and negative elevations. Upsampling a coarse source does not create finer measured detail.

## 6. PDS raw terrain alternative: scaling matters

Checked label:

```text
https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/ldem_75s_240m.lbl
```

Observed encoding/geometry metadata:

```text
PRODUCT_VERSION_ID = "V2.0"
LINES = 3812
LINE_SAMPLES = 3812
SAMPLE_TYPE = LSB_INTEGER
SAMPLE_BITS = 16
SCALING_FACTOR = 0.5
OFFSET = 1737400.
MAP_SCALE = 240 <m/pix>
COORDINATE_SYSTEM_NAME = "MEAN EARTH/POLAR AXIS OF DE421"
```

| Representation | Type and conversion |
|---|---|
| Raw digital number (DN) | Signed little-endian int16, NumPy `dtype='<i2'`. |
| Elevation above reference sphere | `elevation_m = DN * 0.5`, per this label. |
| Distance from Moon centre | `radius_m = elevation_m + 1737400.0`. |
| Decoded terrain | Float32 array plus projection/registration/validity metadata. |

For example, **illustrative** `DN=2000` means elevation 1000 m, not 2000 m. The raw image would contain `3812 × 3812 × 2 = 29,062,688` sample bytes. The large IMG itself and HTTP Range support were not checked. Do not apply this scaling again to already-decoded ImageServer float elevations. Read every product's own label rather than generalizing one product's encoding.

The label names a DE421 lunar frame; the checked Horizons response uses `MEAN_ME` with DE441 ephemerides. A common reference radius does not prove identical orientation. Document and validate the frame conversion before merging them in precision calculations.

## 7. Horizons: JSON envelope, text table, numerical samples

Endpoint: `https://ssd.jpl.nasa.gov/api/horizons.api`. These three requests were sent sequentially.

### Local observer query

Parameters used for the Sun sample (encode values with an HTTP client):

```text
format=json
COMMAND='10'
CENTER='coord@301'
COORD_TYPE='GEODETIC'
SITE_COORD='0,-89.45,0'
EPHEM_TYPE='OBSERVER'
START_TIME='2026-12-01 00:00'
STOP_TIME='2026-12-01 02:00'
STEP_SIZE='1 h'
QUANTITIES='4,20'
CSV_FORMAT='YES'
MAKE_EPHEM='YES'
OBJ_DATA='NO'
TIME_TYPE='UT'
APPARENT='AIRLESS'
```

`SITE_COORD` is east-positive longitude in degrees, latitude in degrees, and altitude in kilometres above the reference sphere. Here altitude zero was an API example, **not a terrain-derived observer altitude**. Production altitude must include terrain elevation and instrument height.

The received JSON had `signature.source = "NASA/JPL Horizons API"`, `signature.version = "1.2"`, and a `result` **string**. The public API document consulted during this check was labelled version 1.3. Record this mismatch and explicitly support/validate a known format; do not silently assume the documentation version matches the live server.

Observed table header and first Sun row inside `result`:

```text
Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app), delta, deldot,
$$SOE
2026-Dec-01 00:00,*, , 280.049441, 1.566177, 0.98633151640990, -1.2237764,
```

The complete table ended with `$$EOE`. The next two Sun elevations were 1.561149° and 1.556116° at 01:00 and 02:00.

Changing `COMMAND` to `'399'` returned Earth data; its first row was:

```text
2026-Dec-01 00:00,*, , 6.668330, -1.063970, 0.00251705051178, 0.0588920,
```

| Column/field | Raw type → application type | Meaning |
|---|---|---|
| `signature.version` | string → string | API format version, not the ephemeris version. |
| `result` | string → parsed rows | Includes headers, CSV data, and explanatory text. |
| `error` | optional error field | Reject failed responses, including errors with HTTP 200. |
| Date | calendar string → timezone-aware timestamp | Provider UT; preserve the time scale and convert explicitly to application UTC. |
| Two marker columns | strings | Retain empty fields when parsing. Do not use the `*` marker as a terrain-visibility result; it also appeared on the negative-elevation Earth row. |
| `Azi_(a-app)` | numeric text → float64 | Apparent azimuth in degrees, north through east. |
| `Elev_(a-app)` | numeric text → float64 | Apparent elevation in degrees above the local reference horizon, without local terrain. |
| `delta` | numeric text → float64 | Observer-target distance in astronomical units. |
| `deldot` | numeric text → float64 | Range rate in km/s. |

Check `error`, API version, target/observer, header columns, units, both table delimiters, expected times, finite values and missing-value tokens. Parse with a CSV reader, not by whitespace splitting. Preserve raw response metadata for reproducibility. Format changes or unsupported versions should be explicit adapter errors.

### Shared global ephemeris table: observed, reconstruction still to validate

Using the same date interval with `COMMAND='301'`, `CENTER='500@399'`, and `QUANTITIES='14,15,20'` returned:

```text
Date__(UT)__HR:MN, , , ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT, delta, deldot,
2026-Dec-01 00:00, , , 6.669340, 1.345975, 280.063976, -1.470809, 0.00251635544404, 0.0583402,
```

Sub-observer and sub-solar longitude/latitude columns are floating-point degrees; here the observer is Earth's centre. This query can support the compact-table approach in README. Receiving this table does **not** establish the README's claimed angular reconstruction accuracy. Check epoch, light-time/apparent conventions, lunar frame, observer height, Earth parallax, and interpolation against local observer queries. A single Earth direction copied unchanged to every surface observer is insufficient for precision work.

### Service access

Use the backend to access Horizons, serialize requests, cache by all query parameters, back off on transient errors, and record versions. JPL requires one request at a time and an application-specific User-Agent with valid contact information for automated use. Configure the team's real contact before automated ingestion; do not invent one. The probes here were interactive documentation checks.

References: [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), [JPL API fair use](https://ssd-api.jpl.nasa.gov/doc/index.php).

## 8. Map imagery and optional validation layers

Checked capabilities URL:

```text
https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml
```

Observed XML declared style `default`, matrix set `default028mm`, format `image/jpeg`, and bounds `[-180,-90]` to `[180,90]` under `urn:ogc:def:crs:EPSG::104903`. Use layer capabilities to configure the Cesium imagery provider, including lunar tiling/projection. A global Moon map must not inherit Earth's radius or ellipsoid assumptions.

The existing guide lists illumination, Earth-visibility and permanent-shadow layers for comparison. Their individual services, epochs, definitions and coverage were not rechecked here. A permanent-shadow mask concerns sunlight; it does not determine Earth visibility. QuickMap is a manual panorama/visual reference, not a dependency on an undocumented API.

## 9. Internal data contracts — proposed, not implemented

JSON has `number`, not separate float/int storage types; TypeScript uses `number`. Python uses `float`/`int`, while large internal arrays should have explicit NumPy dtypes. Keep large DEMs and horizon grids binary and off the JSON/LLM path.

| Product | Suggested representation | Required context |
|---|---|---|
| Region | ID string, source attributes, lunar projected polygon or explicitly tagged transformed coordinates | Source product/version/date and CRS; region geometry must not be labelled WGS84. |
| Site / grid point | ID string; `longitude_deg`, `latitude_deg`, `surface_elevation_m` as numbers | Region, source/derived status, frame, sample resolution. Unknown elevation is `null`. |
| DEM | `float32[rows, columns]` plus boolean valid mask | Affine transform, WKT, nodata handling, native/export resolution, units, version. |
| Horizon | `float32[azimuth_bins]` plus bin validity | Bin step, observer height, DEM hashes, frame, maximum terrain range and algorithm version. 360 float32 values take 1,440 bytes before metadata, not a guaranteed 1 KB. |
| Ephemerides | Float64 directions/positions or local angle arrays with timestamps | Target, observer, exact frame, time scale, distance units, corrections, source/kernel versions. |
| Conditions | One timestamp with angles, terrain clearance and nullable visibility | `visible`, `blocked`, or `unknown`; no invented confidence percentage. |
| Events/windows | UTC start/end strings, duration seconds, boundary status | Half-open intervals `[start,end)`; distinguish observed transitions from intervals clipped by the query boundary. |
| Site summary | Fractions in `[0,1]`, durations in seconds, nullable next-event time | Analysis interval, definitions and data coverage; no event found within the window is not proof of perpetual visibility. |
| Regional comparison (approved scope) | Geometric joint area, cumulative areas below 5°/10°/15°, largest four-neighbour components, same-zone intersections and identified representative-site metrics | Grid/support, definitions, total-region percentages and valid-data coverage; unknowns remain explicit, with no global score or automatic slope rejection. |
| Provenance | Structured strings, numbers and flags | Source URLs, retrieval time, product epoch/version, hashes, algorithm/version, assumptions and limitations. |

Proposed normalized local Sun sample, using the observed values above:

```json
{
  "time_utc": "2026-12-01T00:00:00Z",
  "target": "sun",
  "observer": {"longitude_deg": 0.0, "latitude_deg": -89.45, "altitude_above_reference_m": 0.0},
  "azimuth_deg": 280.049441,
  "elevation_deg": 1.566177,
  "range_au": 0.98633151640990,
  "terrain_horizon_deg": null,
  "terrain_visibility": "unknown",
  "source": {"provider": "JPL Horizons", "api_version": "1.2", "ephemeris": "DE441", "observer_frame": "MEAN_ME"}
}
```

The visibility is deliberately unknown: this task has not calculated a horizon for that observer.

**Historical subrequest, superseded on 2026-11-15; do not implement as the general engine contract.** The following example preserves the earlier vehicle-constrained, full-flight proposal and contains illustrative settings rather than verified vehicle requirements. Its slope limit, PSR exclusion, fixed stay and ranking weights are not current decisions:

```json
{
  "region_id": "trek:A3_Named_regions_SP:6",
  "landing_time_utc": "2027-01-01T00:00:00Z",
  "duration_hours": 168,
  "observer_height_m": 2.0,
  "grid_spacing_m": 1000,
  "constraints": {
    "require_sun_at_landing": true,
    "require_earth_at_landing": true,
    "earth_clearance_margin_deg": 0.0,
    "max_slope_deg": 8.0,
    "exclude_psr": true
  },
  "ranking": {"sunlight_weight": 0.6, "earth_visibility_weight": 0.4, "top_n": 10}
}
```

For that historical request, validation would have covered its mission-specific limits and weights. For the approved engine, use the canonical criteria instead: UTC epoch, documented grid/support, finite measurements, source coverage and numerical quality. Do not import the historical slope filter or score weights into the new specification. Sampling resolution cannot establish touchdown-footprint safety.

## 10. Data still needed

- Import the external prototype and its saved validation cases; its reported results are not independently reproduced here.
- Select and obtain real terrain clips covering the chosen search region and its surrounding horizon; the 4 × 4 sample only demonstrates the service format.
- Record compatible frame definitions and source-specific no-data/quality metadata. Coverage/quality products may be needed to distinguish interpolated terrain from well-supported terrain.
- Verify the desired current candidate-region/site catalog and maintain the source epoch; the checked 2022 polygons remain useful historical examples.
- Discover/verify the slope, PSR and comparison products actually used, including slope measurement scale and time span for averages.
- Keep JPL Horizons as the selected source of solar/terrestrial ephemerides and preserve request parameters and raw headers; offline use reuses its cached responses. A separate SPICE-kernel workflow is not part of the approved engine.
- Add tracked manifests and small reference fixtures under `docs/` or another tracked path. The current `.gitignore` excludes almost everything under `data/`, so provenance placed there would otherwise be lost.

These documents define the integration work; they do not imply a working scientific backend already exists.

## 11. Historical additional data for full launch-to-landing simulation

### Launch, departure and touchdown are different events

Store at least `launch_time_utc` (pad liftoff), `departure_time_utc` (translunar departure), `lunar_arrival_time_utc` (a precisely defined lunar arrival/orbit-insertion event), and `touchdown_time_utc`. The latter three are outputs of the selected mission solution. Do not calculate them by adding a universal travel time to launch.

The user selects `observation_time_utc` to inspect spacecraft position. Changing this inspection time should evaluate the existing saved solution; changing launch time, hardware, guidance, destination or constraints requires a new solution.

### Required inputs beyond the lunar map APIs

| Input | Fields / datatypes | Source and status |
|---|---|---|
| Launch site | ID string; Earth geodetic latitude/longitude degrees and height metres, float64 | Sourced pad coordinates and Earth datum; not a Moon Trek coordinate. Not yet selected. |
| Earth orientation | Rotation/frame model and epoch, strings plus numerical transforms | Required to convert the rotating pad into an inertial initial position/velocity. Obtain compatible ephemeris/Earth-orientation data. |
| Mission architecture | Ordered phases, active vehicle/stage IDs, staging/separation rules | Team-defined versioned scenario, including which spacecraft is followed after separation. Not yet specified. |
| Vehicle mass | Stage dry mass, propellant, payload and reserve, float64 kg | Sourced vehicle model or explicitly illustrative model; none provided by the checked lunar services. |
| Propulsion | Thrust curves in N, specific impulse in s, throttle bounds, burn/restart limits | Engine/stage data with pressure dependence where needed; not yet supplied. |
| Aerodynamics | Reference area m², dimensionless drag/lift coefficient model, attitude convention | Needed during atmospheric ascent; not yet supplied. |
| Atmosphere | Density kg/m³, pressure Pa, sound speed m/s, winds if modeled | Select and version an atmosphere model. It does not come from lunar DEMs. |
| Guidance | Heading, pitch/throttle schedule or feedback law, target orbit, burn targeting, descent guidance | A launch timestamp does not determine these control inputs. Must be implemented or explicitly prescribed. |
| Gravity and body motion | Gravitational parameters in m³/s², body states in m and m/s, frame/epoch; chosen gravity harmonics | NASA/JPL ephemerides and selected gravity models. Moon vector sample below was checked; full model is not configured. |
| Transfer constraints | Allowed flight time range s, departure/orbit targets, propellant/reserve constraints | Explicit scenario inputs. Keep target dates separate from solved event dates. |
| Lunar landing limits | Site/region ID, terrain elevation, accepted touchdown speed, slope/footprint conditions | DEM plus documented lander assumptions. Landing-site geography does not determine vehicle capabilities. |

Choose one explicit demonstration vehicle and launch site before promising a computed mission. If real data is incomplete, label the completed assumed profile as illustrative. Do not fill missing engineering parameters with an AI guess.

### Observed geometric state-vector example

The observer angles in section 7 help with sky visibility. Flight dynamics needs geometric positions and velocities at a consistent epoch and in a declared inertial frame. A checked Horizons query used:

```text
COMMAND='301'
CENTER='500@399'
EPHEM_TYPE='VECTORS'
REF_SYSTEM='ICRF'
REF_PLANE='FRAME'
VEC_CORR='NONE'
VEC_TABLE='2'
OUT_UNITS='KM-S'
TIME_TYPE='UT'
START_TIME='2026-12-01 00:00'
STOP_TIME='2026-12-01 01:00'
STEP_SIZE='1 h'
CSV_FORMAT='YES'
OBJ_DATA='NO'
```

Observed first row, displayed here as a normalized object:

```json
{
  "time_utc": "2026-12-01T00:00:00Z",
  "target_body": "moon",
  "origin": "earth_center",
  "frame": "ICRF",
  "correction": "NONE",
  "position_km": [-341707.8040466329, 147546.0093323910, 56591.73545035761],
  "velocity_km_s": [-0.4854175734970284, -0.8038176746800663, -0.4471442889440291]
}
```

Both vectors are float64 arrays of length three. Convert km → m and km/s → m/s once at the ingestion boundary. This is the **Moon's state**, not our proposed spacecraft's state. Other origins/body states required by the selected propagator need their own correctly configured source data. Apparent observer directions should not be substituted for geometric gravity-body states.

### Proposed mission and trajectory types

The following contracts are designs to implement; no trajectory solver ran during this task.

```ts
type Vector3 = [number, number, number];
type FlightPhase =
  | 'prelaunch' | 'ascent' | 'earth_parking_orbit'
  | 'translunar_injection' | 'transfer' | 'lunar_orbit_insertion'
  | 'lunar_orbit' | 'descent' | 'landed';

interface MissionRequest {
  launch_time_utc: string;
  launch_site_id: string;
  vehicle_profile_id: string;
  guidance_profile_id: string;
  dynamics_profile_id: string;
  target_region_ids: string[];
  surface_duration_hours: number;
  observation_time_utc?: string;
  transfer_duration_bounds_hours: [number, number];
}

interface TrajectoryState {
  time_utc: string;
  elapsed_since_launch_s: number;
  active_vehicle_id: string;
  phase: FlightPhase;
  frame: string;                // e.g. J2000-compatible inertial axes
  origin: string;               // explicitly named body centre or barycentre
  position_m: Vector3;
  velocity_m_s: Vector3;
  mass_kg: number;
  remaining_propellant_kg: number;
  surface_coordinates: null | {
    body: 'earth' | 'moon';
    frame: string;
    longitude_deg: number;
    latitude_deg: number;
    altitude_above_reference_m: number;
    altitude_above_terrain_m: number | null;
  };
}

interface FlightEvent {
  time_utc: string;
  kind: string;                 // ignition, cutoff, separation, insertion, touchdown...
  phase_before: FlightPhase;
  phase_after: FlightPhase;
  state_before: TrajectoryState;
  state_after: TrajectoryState;
}

interface MissionResult {
  mission_id: string;
  status: 'missing_inputs' | 'solved' | 'infeasible' | 'failed';
  model_version: string;
  launch_time_utc: string;
  departure_time_utc: string | null;
  lunar_arrival_time_utc: string | null;
  touchdown_time_utc: string | null;
  trajectory_id: string | null;
  valid_from_utc: string | null;
  valid_to_utc: string | null;
  events: FlightEvent[];
  constraint_violations: string[];
  assumptions: string[];
}
```

Persist full model/configuration hashes with the mission and trajectory IDs. A proposed `GET /api/missions/{id}/state?time_utc=...` returns one state from that solution; trajectory samples for visualization can be a separate, reduced-resolution payload. Keep source body ephemerides and generated spacecraft trajectories as distinct datasets.

At staging, the followed stack loses jettisoned mass; an impulsive maneuver would cause a velocity discontinuity. Never interpolate through either event as though the whole history were smooth. After accepted touchdown, the lander is fixed in the lunar surface frame but moves in an inertial frame with the Moon. Before liftoff, after a failed simulation, or outside supported coverage, return an explicit phase/status instead of silently extrapolating.

### Simulation fidelity and uncertainty metadata

Use a declared model version and record whether the calculation includes finite burns, drag, atmosphere/winds, Earth rotation, non-spherical gravity, perturbing bodies, prescribed attitude versus full attitude dynamics, terrain, and landing guidance. A translational model with prescribed steering can cover all mission phases as an educational simulation; it does not establish six-degree-of-freedom vehicle-control fidelity.

Separate numerical tolerance, input uncertainty, and model approximations. Sensitivity runs can vary launch timing, thrust, mass, atmosphere and terrain within documented ranges. Probability claims require justified distributions; a generic LLM cannot provide calibrated mission-success probabilities.

Reference material for the new flight module: [NASA mission-design tools](https://www.nasa.gov/smallsat-institute/space-mission-design-tools/), [NASA GMAT propagation model](https://github.com/nasa/GMAT/blob/main/doc/SystemDocs/APICookbook/source/stmpropagation.rst), [Tudat thrust and mass-rate models](https://docs.tudat.space/en/stable/user-guide/state-propagation/propagation-setup/translational/thrust-models.html), [NASA specific impulse](https://www.grc.nasa.gov/www/BGH/specimp.html). These are references to evaluate; no new simulator dependency has been installed or selected.
