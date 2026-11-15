# Data acquisition and quality guide

Reviewed against the implementation on **2026-11-15**. The [scientific criteria](criteri-algoritmo.md) define the quantities; the [engine guide](../backend/docs/engine-v1.md) documents the CLI demo, and the [backend guide](../backend/README.md) documents storage and HTTP operations.

## Inputs and service roles

JPL Horizons supplies apparent Sun/Earth geometry and distances. NASA Moon Trek and PDS/PGDA supply numerical LRO-LOLA terrain, catalogs and available quality products. The project calculates horizons, slope and disc visibility. LROC observations support independent checks; QuickMap is an optional manual comparison tool.

Horizons does not include site mountains/craters. Compare its directions with the DEM-derived horizon, and include Earth occultation of the Sun. A reusable terrain profile depends on coordinates, altitude/observer height, DEM hashes and numerical method, not on the date.

## Horizons acquisition

Endpoint: `https://ssd.jpl.nasa.gov/api/horizons.api`. Preserve the original JSON/text table, headers and request. HTTP 200 is insufficient: verify application errors, `$$SOE`/`$$EOE`, expected columns, units, site, frame, radius, coverage and row count. Serialize upstream calls and use bounded timeouts/retries and a verified cache.

The implemented **CLI V1** request uses:

| Parameter | Value |
|---|---|
| `COMMAND` | `'10'` (Sun), `'399'` (Earth) |
| `CENTER` | `'coord@301'` |
| `COORD_TYPE` | `'GEODETIC'` |
| `SITE_COORD` | East longitude, latitude, altitude in km |
| `EPHEM_TYPE` | `'OBSERVER'` |
| `QUANTITIES` | `'4,13,20'`: apparent azimuth/elevation, angular diameter, range/range rate |
| `RANGE_UNITS` | `'KM'` |
| `CSV_FORMAT` | `'YES'` |

The older generic acquisition examples use observer quantities `4,20` with their own units. Do not apply their parser assumptions to the CLI topocentric output. A zero reference-sphere altitude is not ground level: V1 uses DEM elevation plus **2 m**, converted to km in the verified datum.

The CLI parser verifies lunar `MEAN_ME`, reference radius **1737.4 km**, apparent airless geometry, and north-through-east azimuth. Interpolate direction vectors with wrap-safe methods and compare at independent intermediate timestamps. Keep T exact. Exact poles must be rejected or handled with an explicit singularity convention, never shifted silently.

A global geocentric table with quantities `14,15,19,20` remains a possible future reconstruction optimization, not the CLI production source. Apparent geocentric quantities cannot be converted into exact lunar topocentric geometry through a simple frame rotation: check epochs, light-time, finite distance and parallax. The separate HTTP service also uses Horizons and exposes its own implementation limits in the [contract](api-contract.md).

## Moon Trek numerical terrain

Catalog access includes south-polar and equatorial `TrekServices/ws/index/.../searchItems`, `getLayerServices?uuid=...`, and `TrekWS/rest/cat/abstract?label=...`. Counts observed during past access tests are not constants. Record pagination/transfer limits, source metadata and the product WKT rather than inferring projection from a title.

Numerical services use:

```text
https://trek.nasa.gov/moon/trekarcgis/rest/services/<product>/ImageServer
```

Read `?f=json` for native bounds, grid, NoData and export limits. `exportImage` can return floating-point TIFF; request explicit bbox/output reference systems, pixel type, size and resampling. Output pixel spacing is not independent physical resolution: exporting a ~237 m global DEM to 5 m pixels cannot support 100 m slope measurements.

The CLI demo requests native-grid **1500 × 1500** tiles with nearest-neighbour sampling. Its alignment check compares blocks requested at different resolutions. The 100 m product's actual service extent is ±1440 km; a conflicting catalog extent of ±1095.93 km was rejected. Metadata/registry disagreement must stop acquisition rather than move the grid.

| CLI tier | de Gerlache Rim 2 | Malapert Massif | Radius |
|---|---|---|---|
| Near, 5 m | `LRO_LOLA_DEM_SPole875_5mp_v04` | `Site23_final_adj_5mpp_surf` | 0–4 km |
| Intermediate, 30 m | `LRO_LOLA_DEM_SPole75_30mp_v04` | Same product | 4–40 km |
| Far, 100 m | `LRO_LOLA_DEM_SPole45_100mp_v04` | Same product | 40–300 km |

The HTTP polar provider instead reads PGDA COG windows (`LDEM_80S_20MPP_ADJ` near, `LDEM_60S_240MPP_ADJ` far). Other sites use a coarse Moon Trek global provider. Those terrain configurations are distinct from the validated CLI demo. Each result must retain its own actual products and limitations.

## Quality and provenance

For every raster record producer/product/version, original URL, acquisition time, SHA-256, units, datum/radius, frame, WKT, native/effective resolution, transform/grid, NoData, scale/offset and available count/error masks. Count, Coverage, NoDataMask and Error products affect whether a metric is assessable. Interpolated pixels are not independent measured spots.

At the de Gerlache demo point, only **3.8%** of the 5 m support pixels contain LOLA spots; most are interpolated. The site-23 abstract describes approximately 90% interpolated pixels, while Moon Trek does not distribute its counts. Do not generalize those values to every LOLA product. PGDA error layers cannot be transferred to a different DEM/version or 100 m slope fit without demonstrating correspondence.

Keep elevations in numerical TIFFs. WMTS PNG/JPEG layers are display imagery, not height fields. Read their capabilities for tiling, coverage and formats; a display layer does not establish terrain readiness. `/api/coverage` intentionally does not claim complete products merely because local windows exist.

Use lunar, not implicit Earth, reference systems. For a verified 1,737,400 m sphere and elevations in metres, point radius is `1737400 + elevation_m`. Check each product rather than assuming all rasters share that datum.

## Reference products and comparisons

| Source | Use and limits |
|---|---|
| [PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) | Original mission products and labels |
| [PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) | Adjusted DEMs and `LDRM_80S_50MPP_ADJ_SLP_100M.TIF` reference slope |
| [PGDA product 78](https://pgda.gsfc.nasa.gov/products/78) | Specific 5 m DEMs, errors and clones for uncertainty work |
| [PGDA product 69](https://pgda.gsfc.nasa.gov/products/69) | Polar illumination/PSR context; match definition, height and period |
| [LROC time-weighted WAC map](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH) | Observational average with its own sampling; not an instantaneous image |
| Dated LROC NAC orthophotos | Shadow/illumination comparison at known acquisition geometry |
| [QuickMap](https://quickmap.lroc.im-ldi.com/) | Manual horizon/visibility comparison with recorded coordinates, height, layer and settings |

Agreement with a model using the same DEM is useful but not independent truth. A multi-epoch mosaic cannot be assigned one solar epoch. Ground-level PSR products and a 2 m observer differ. A month of darkness does not establish permanent shadow.

## Numerical interpretation

Retain center elevation, terrain horizon and clearance separately; integrate across finite discs and the union of solar occluders. C3 is fraction ≥0.5, while complete direct darkness is zero. Event scans must preserve clipping/gaps and investigate brief crossings; a small bisection tolerance is not a physical accuracy guarantee.

Slope uses a circular 100 m support and native data, not upsampled detail. Future annual P50 requires a complete UTC year. Future regional B/A5/A10/A15 outputs require systematic grids, valid-area denominators and four-neighbour connectivity; point catalog comparisons do not supply them.

The [review](validazione-engine-v1-revisione.md) records successful numerical checks but failed/incomplete observational checks and unquantified physical uncertainty. The [LROC protocol](protocollo-validazione-lroc-v2.md) defines the remaining independent benchmark. These are existing records, not checks rerun during this documentation update.
