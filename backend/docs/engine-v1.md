# Point-based engine V1

Implementation and documentation status: **2026-11-15**. The [scientific criteria](../../docs/criteri-algoritmo.md) define the model. The [latest recorded validation review](../../docs/validazione-engine-v1-revisione.md) supplements the [initial report](../../docs/validazione-engine-v1.md).

**Observational validation is incomplete.** The engine produces real results and its numerical checks passed for the refined demo configuration. The dated LROC benchmark did not meet its predeclared agreement criterion. Do not present the engine as fully validated.

## Capabilities

For 1–3 points inside active development polygons and explicit UTC epochs, over `[T,T+duration)`, the CLI calculates:

- Point elevation, circular 100 m slope/band/quality and terrain horizon H(azimuth) at 2 m observer height.
- Topocentric Sun/Earth azimuth, elevation, terrain clearance, angular radius and distance from JPL Horizons.
- `fSunTerrain`, `fSun` (union of terrain/Earth occultation) and `fEarth`.
- Sun/Earth/joint C3 windows, below-C3 and complete-darkness intervals, Earth–Sun overlap, causes and boundary types.
- Direct comparisons of the same points at different epochs and different points at the same epoch.

The demonstration uses at least one point in each of de Gerlache Rim 2 and Malapert Massif. It does not calculate regional grids/areas, annual P50, automatic date scans, scores, power, temperature or radio performance. This library has no HTTP routes; the application's HTTP implementation is a separate calculation path.

## Commands

From the repository root, with Docker running:

```sh
docker compose build backend
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json --offline
docker compose run --rm --no-deps backend python -m app validate-engine
docker compose run --rm --no-deps backend pytest
```

`analyze` writes `backend/data/analysis/runs/<key>/result.json` and `manifest.json`. `--output` changes the analysis directory but must stay within `backend/`. Offline mode makes no network requests and fails explicitly when required cached data is absent. Exit codes: 0 success, 1 invalid request, 2 insufficient offline cache, 3 acquisition failure.

`validate-engine` runs real-data checks and writes a unique `backend/data/analysis/validation/evidence-<UTC>.json`, without overwriting previous evidence. Exit code **4** means full validation did not pass, including incomplete/omitted checks. `--check` selects `interpolation`, `slope`, `convergence`, `alignment`, `eclipse` or `lroc`; a selected subset cannot certify the rest. Real-data validation requires the appropriate source access/cache and may use the network.

## Python use

From `backend/` in the configured environment:

```python
from app.services.engine.orchestrator import EnginePaths, load_request, run_analysis, write_outputs

request = load_request("config/analysis.demo.json")
result, report = run_analysis(request, offline=False)
write_outputs(result, report, EnginePaths.default())
```

`run_analysis` does not start FastAPI. `result` is the Pydantic `AnalysisResult`; `report` carries runtime/cache information.

## Source products

Sources are saved by `Collector` with original requests, URLs, timestamps and SHA-256. Moon Trek region polygons use the catalog download; numeric DEM/count tiles and topocentric Horizons responses are stored in `backend/data/analysis/raw/`. One documented acquisition inventory contains 71 files, approximately 497 MB: 52 DEM tiles, one count tile, 12 Horizons responses, five service metadata responses and polygons. Counts depend on cached inputs and configuration.

| Tier | de Gerlache Rim 2 | Malapert Massif | Radius / maximum radial spacing |
|---|---|---|---|
| Near, 5 m | `LRO_LOLA_DEM_SPole875_5mp_v04` | `Site23_final_adj_5mpp_surf` | 0–4 km / 5 m |
| Intermediate, 30 m | `LRO_LOLA_DEM_SPole75_30mp_v04` | Same | 4–40 km / 30 m |
| Far, 100 m | `LRO_LOLA_DEM_SPole45_100mp_v04` | Same | 40–300 km / 100 m |

Elevations are metres above the 1,737,400 m sphere in lunar south-polar stereographic coordinates. Product metadata must confirm grid, reference and NoData; the accessed products did not declare a NoData value. The v04 polar terrain uses altimetry through September 2011. Site 23 is Barker's co-registered PGDA product. The polar 5 m product does not extend to Malapert.

Only 3.8% of the de Gerlache 100 m support pixels contain a measured LOLA spot. Site-23 counts are unavailable through Moon Trek; its abstract describes approximately 90% interpolated pixels. These facts are quality limitations, not physical error estimates.

The 100 m service's actual extent is ±1440 km, conflicting with an earlier ±1095.93 km catalog value. Registry/service disagreement is rejected. DEM tiles use native 1500 × 1500 grids and nearest-neighbour export; `alignment` checks that grid behavior.

## Request and configuration

The complete example is [analysis.demo.json](../config/analysis.demo.json); the [request schema](../schemas/analysis-request-v1.schema.json) defines accepted fields.

| Field | Meaning |
|---|---|
| `points[]` | ID, region, planetocentric `lat_deg` / `lon_east_deg` and reproducible selection description |
| `epochs_utc[]` | Explicit UTC timestamps, kept exact |
| `duration_s` | Common positive analysis duration; 30 days in the demo |
| `observer_height_m` | Exactly 2.0 for CLI V1 |
| `terrain` | Product/radius/radial-spacing tiers per region |
| `numeric` | Numerical settings below |

Reject invalid requests rather than silently correcting them: outside polygon, inactive region, exact pole, unsupported height or missing timezone.

| Parameter | Demo value | Interpretation |
|---|---|---|
| `azimuth_step_deg` | 0.03125 | 11,520 directions, compared against 0.015625° |
| `radial_relative_step` | 0.0005 | Radial spacing = min(tier spacing, factor × distance) |
| `min_distance_m` | 2.5 | First terrain distance |
| `slope_diameter_m`, `slope_min_pixels` | 100, 16 | Circular fit and minimum support |
| `disc_strips` | 64 | Disc integration strips |
| `ephemeris_step_s` | 3600 | Horizons sampling, starting exactly at T |
| `scan_step_s`, `event_tolerance_s` | 60, 1 | Event scan and bisection tolerance |
| `c3_threshold`, `zero_fraction_epsilon` | 0.5, 1e-9 | C3 and recorded numerical zero tolerance |

The original 0.25°/uniform-radial and intermediate 0.125° configurations did not pass every convergence check. The demo was refined to 0.03125° without relaxing tolerances. The generic Python model default remains **0.125°**; use the explicit demo configuration to reproduce the reviewed result. Do not transfer its evidence to other settings.

## Result and missing data

The [result schema](../schemas/analysis-result-v1.schema.json), version `1.0.0`, is checked against the models by an existing test.

- `points[]`: coordinate/elevation, slope value/band/support/numerical sensitivity/measured-pixel fraction, horizon elevation/completeness/distance arrays, terrain tiers and `tier_seams`.
- `scenarios[]`: point/epoch, series, `state_at_t`, `windows`, `first_dark`, `coverage`, `totals_observed_s` and notes.
- `comparisons[]`: side-by-side point/date rows without a universal ordering.
- `sources[]`: provenance for every used file.

Unavailable measurements are null with `status`/`reason`, never NaN/Infinity or substitute zero. Interval `start_kind` / `end_kind` distinguish `observed_transition`, request boundaries and `data_gap`. `total_duration_s` exists only when both physical transitions are observed; otherwise retain `duration_lower_bound_s`. `remaining_*` is zero for a known false condition at T and null for unknown state or unobserved end.

`start_rate_per_hour` / `end_rate_per_hour` quantify transition sharpness; low rates indicate grazing sensitivity. Numerical root precision is not physical timing accuracy. Identical inputs/versions generate byte-identical `result.json`; execution times and write timestamps belong in the manifest.

## Caches

Paths below are relative to `backend/data/analysis/`:

| Cache | Location | Key inputs |
|---|---|---|
| Raw source | `raw/` | Complete upstream request |
| Terrain | `cache/terrain/` | Coordinates, observer height, product/tile hashes, horizon/slope settings and algorithm version |
| Series | `cache/series/` | Terrain key, T, duration, numerical settings, Horizons hashes and parser version |

Changing date reuses terrain. Changing a tile, point or method invalidates affected terrain/series. Failed acquisition does not publish a successful result.

Historical timings at **0.125°**, two points/three dates/30 days in Docker on one MacBook: 339.9 s for cold acquisition (70 downloads, ~497 MB), 19.4 s with raw sources cached, 0.6 s with all derived caches. These are recorded local measurements, not guarantees for the refined demo or other machines.

## Reproduce the recorded review

```sh
docker compose run --rm --no-deps backend python -m scripts.review_validation
docker compose run --rm --no-deps backend python -m scripts.review_tests_native
docker compose run --rm --no-deps backend python -m scripts.review_cache
```

The first records source/config/package fingerprints and checks they remain unchanged during execution. The second copies sources/tests to the native container filesystem to isolate macOS bind-mount behavior; it does not erase failures on the mount. The third prohibits HTTP and compares real offline outputs.

`review_convergence` reproduces the azimuth refinement ladder; `prepare_lroc_review` creates the observational development package and refuses to overwrite existing annotations. Initial labels are unannotated, not ground truth. The [LROC protocol](../../docs/protocollo-validazione-lroc-v2.md) still requires new independent scenes and reviewed labels.

## Modules

`engine/models.py` defines versioned models; `orchestrator.py` coordinates runs/output; `acquisition.py` handles real sources/offline/provenance; `terrain_stage.py` / `scenario_stage.py` calculate point products; `cache.py` / `compare.py` implement derived reuse/direct comparisons; `validation.py` / `lroc_check.py` produce real-data evidence. Terrain primitives are in `terrain/moontrek_dem.py`, `slope.py`, `horizon.py`; topocentric acquisition/interpolation in `ephemerides/horizons_topo.py` / `interpolation.py`; disc geometry and intervals in `visibility/discs.py` / `events/intervals.py`. Offline engine tests live in `tests/test_engine_*.py`.
