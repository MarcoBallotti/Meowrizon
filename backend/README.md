# Backend

Python 3.12, FastAPI and file-backed storage. The backend implements catalog preparation, source acquisition, terrain/scenario HTTP jobs and a separate point-based V1 library/CLI. **Observational validation remains incomplete**; see the [recorded review](../docs/validazione-engine-v1-revisione.md).

## Calculation paths

| Path | Entry point | Scope |
|---|---|---|
| CLI V1 | `python -m app analyze`, `app.services.engine.orchestrator` | Identified development points, fixed 2 m observer, versioned request/result schemas, numerical/observational review |
| HTTP | `app.api.scientific`, `ScientificJobs` | Terrain profiles, Horizons Sun/Earth scenarios, optional eclipse/orbit context and solar screening |
| Acquisition | `app.routes`, `DataJobs`, `DataStore` | Original responses, offline preparation and saved-data queries |

HTTP uses `terrain.engine` and `ephemerides.scenario`, not the CLI orchestrator. The CLI's numerical results do not certify HTTP terrain, global sites or the frontend's mission models. The [scientific criteria](../docs/criteri-algoritmo.md) define physical interpretation; the [HTTP contract](../docs/api-contract.md) describes actual routes/limits.

## Run with Docker

From the repository root, with Docker Desktop running:

```sh
npm run setup
npm start
```

Backend only:

```sh
docker compose up --build backend
```

API: http://localhost:8000/api; documentation: http://localhost:8000/api/docs; schema: http://localhost:8000/api/openapi.json. `/health` and `/api/health` report process health. Startup does not collect all upstream data.

The image uses micromamba/conda-forge so GDAL, Rasterio and PROJ are installed together. Rebuild after `environment.yml` changes. Backend source is mounted for development reload; root `data/` is mounted at `/app/data`, and the `backend/` mount also preserves backend-local runtime files.

```sh
npm run check:backend
docker compose run --rm --no-deps backend pytest -m network
```

Network tests are explicit. The scientific review records macOS bind-mount locking anomalies and native-container results separately; a native pass does not establish concurrency reliability on every mounted filesystem.

## Run locally

From `backend/`:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

For development checks, also install `requirements-dev.txt`. On Windows use `.venv\Scripts\python.exe`. Alternatively create the conda environment from `environment.yml` and run `uvicorn app.main:app --reload` from this directory.

Use one Uvicorn process per backend data directory. The service lock rejects a second instance sharing it. Acquisition and scientific jobs have separate single-worker executors; persistent interrupted jobs become failed on restart and can be resubmitted.

## Catalogs

From the repository root:

```sh
docker compose run --rm backend python -m app.cli init-regions
docker compose run --rm backend python -m app.cli init-regions --offline
```

The command downloads/caches Moon Trek polygons with a manifest, validates them, transforms the lunar projection and generates `regions.geojson` / `sites.geojson`. Re-run after catalog changes. Sites require source URLs and valid coordinates/dates. The region-sector boundary does not restrict site locations.

`catalog/regions.toml` retains 13 historical 2022 candidate polygons, with two active CLI development regions. `catalog/sites.toml` contains 9 documented points. These are historical/versioned catalog entries, not a claim about current mission schedules. Point evaluation does not imply systematic regional coverage.

Catalog storage uses `MEOWRIZON_DATA_DIR` (default `backend/data`, Docker `/app/data`). Generic acquisition, scientific jobs and CLI analysis use backend-local paths regardless of that catalog override. See [regions/sites](../docs/siti-e-regioni.md).

## Scientific HTTP service

`POST /api/terrain-analyses` and `POST /api/scenario-evaluations` return 202 job receipts, polled at the corresponding `GET .../{jobId}` routes. Completed terrain **result IDs** are used as scenario dependencies. The worker deduplicates pending requests and reuses completed parameter/version keys, with at most eight pending jobs. Failed jobs may be resubmitted; there is no automatic cache expiry or cancellation API.

Terrain requests accept coordinates, observer height, azimuth spacing, maximum distance and optional `includeLocalTerrain`. The polar provider uses native PGDA **20 m within 5 km, 240 m beyond**, on a 1,737,400 m lunar sphere in MOON_ME/DE421. Other latitudes use `LRO_LOLA_DEM_Global_128ppd_v04` through a local numerical export. Supported radii are 1–300 km and azimuth spacing must be at least 0.1° and divide 360. Exact poles, NoData rays and unsupported coverage fail explicitly. Narrow peaks and sub-pixel obstacles may be unresolved.

The optional local terrain fit measures slope and plane-residual RMS on a circular **100 m diameter** support with at least 16 valid native samples and stereographic scale correction. A coarse global DEM yields unknown local metrics; resampling does not establish that support.

Scenarios use actual Horizons topocentric Sun/Earth tracks, finite-disc C3 visibility and eclipse geometry. They can include an eclipse calendar and orbit vectors. `includeContext:false` omits additional context; optional `minSunFraction` enables early solar screening and can return a distinct skipped result. Duration/sample limits and examples are in the [contract](../docs/api-contract.md).

`/api/coverage` currently returns no prepared products: per-request elevation windows do not prove complete global availability. The old Earth-projected `/api/terrain-preview/{region}.png` returns 410. `origin:"engine"` and `preview:false` identify completed backend output, not scientific certification.

## CLI V1

From the repository root:

```sh
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json --offline
docker compose run --rm --no-deps backend python -m app validate-engine
```

The [engine guide](docs/engine-v1.md) documents exact schemas, outputs, cache identities, numerical settings and review scripts. V1 numerical checks passed for the documented demo; the LROC benchmark failed and a new independent benchmark remains incomplete. No regional areas or annual statistics are inferred from the point demo.

## Acquisition and saved-data API

Source collection is independent of terrain/scenario submission. It uses configured profiles rather than arbitrary client-supplied URLs.

```sh
curl http://127.0.0.1:8000/api/data/sources
curl -X POST http://127.0.0.1:8000/api/data/collect \
  -H 'Content-Type: application/json' \
  -d '{"profile":"default","names":["horizons_sun_observer"],"refresh":false}'
curl http://127.0.0.1:8000/api/data/jobs/JOB_ID
curl http://127.0.0.1:8000/api/data/datasets
```

| Operation | Route |
|---|---|
| List configured sources | `GET /api/data/sources` |
| Download then prepare | `POST /api/data/collect` |
| Prepare saved files offline | `POST /api/data/prepare` |
| Poll receipt | `GET /api/data/jobs/{job_id}` |
| List versions, optionally by `name` | `GET /api/data/datasets` |
| Exact unchanged response | `GET /api/data/datasets/{id}/raw` |
| Latest saved response for source/optional request hash | `GET /api/data/sources/{source_name}/data` |
| Inclusive time filtering | `GET /api/data/datasets/{id}/samples?start_ms=...&stop_ms=...` |
| Product filtering | `GET /api/data/datasets/{id}/products?title_contains=DEM&limit=20` |
| Native region polygons | `GET /api/data/datasets/{id}/regions` |

Use IDs returned by `/datasets`, not job or remote product IDs. Unknown records return 404, unprepared/corrupt or ambiguous versions return 409, malformed input returns 422 and a full queue returns 429. Product filtering also accepts `max_source_resolution` in native source units; `limit` is 1–5000. Source shortcuts with multiple parameter sets require `request_sha256` or an exact dataset ID.

Raw responses remain JSON, TIFF, JPEG, PNG or XML. Headers identify dataset, source and SHA-256 ETag. Raw GETs verify saved data and do not fetch upstream files. Collection `refresh:true` creates a new version, preserving older snapshots. Failed bodies, when available, are saved separately and never reused as successful data.

## CLI acquisition

From `backend/`, with its environment:

```sh
python -m app fetch
python -m app fetch --only horizons_sun_observer --only horizons_earth_observer
python -m app fetch --only moon_catalog_south --refresh
python -m app prepare
python -m app data-info --name horizons_sun_observer
python -m app fetch --config config/trajectory.example.json
```

The trajectory profile is a separate historical WebGeocalc acquisition example with kernel discovery and bounded polling. It does not design a new flight and does not replace Horizons as the selected surface Sun/Earth source.

Edit native request parameters in `config/*.json` to change dates, sites or products. Collection serializes upstream requests and uses bounded retries/timeouts and a default 128 MiB response cap. Transfer-limit/truncated catalogs are rejected; generic pagination is not implemented. Increase configured rows or reduce the area deliberately. Include product metadata with terrain acquisitions.

`MEOWRIZON_USER_AGENT` overrides the product/contact identifier. Backend-local CLI path overrides remain inside `backend/`; escaping paths are rejected. Old external acquisition-directory environment overrides are not used.

## Storage for analysis

All paths in this table are relative to `backend/`:

| Layer | Location | Contents |
|---|---|---|
| Original source responses | `data/raw/<name>/<request-hash>/<timestamp-suffix>/` | Native response plus `metadata.json`: request, URL, time, size and SHA-256 |
| Prepared index | `data/prepared/catalog.json` | Versioned dataset/provenance manifest |
| Prepared datasets | `data/prepared/datasets/<id>/v1-<revision>/` | Compressed Parquet tables and context JSON |
| HTTP elevation windows | `data/terrain/windows/` | Native cropped PGDA/global terrain and checksum manifests |
| Persistent jobs | `data/jobs/`, scientific receipts in `data/jobs/scientific/` | States, normalized parameters, result/error |
| CLI V1 analysis | `data/analysis/` | Raw sources, independent terrain/series caches, runs and validation evidence |

Prepared tables use Zstandard compression and row-group statistics. Parquet supports column selection and time-row filtering; title filtering currently scans its selected table in memory. Original raster pixels remain in GeoTIFF rather than huge JSON/SQL tables.

| Prepared artifact | Data and interpretation |
|---|---|
| `products.parquet` | UUID/title/label/native resolution/projection/original record; catalog presence is not a terrain download |
| `regions.parquet` | Native projected polygons, bounds, reference and attributes; not Earth WGS84 geometry |
| `observer_samples.parquet` | int64 UTC ms, degrees, range in AU and range rate km/s for the supported generic observer adapter |
| `vector_samples.parquet` | UTC ms, km position, km/s velocity and original labels, each with its declared frame/origin |
| `series.json` | Bounds and original scientific context/headers |
| `rasters.json` | Native transform, bounds, WKT, dtype, masks, units/scales and tags; pixels stay in TIFF |

Preparation verifies raw/prepared checksums and rebuilds damaged derived files from valid originals. Writers publish complete immutable revisions before atomically replacing the manifest, with a writer lock. Unsupported metadata/display images are `archived`, supported parsed datasets `prepared`, and errors `failed`. Partial/failed sources never become usable prepared products. **Prepared means parsed/indexed, not scientifically validated or complete coverage.**

The generic adapter supports the bundled Horizons observer `4,20` / vector-table-2 examples and WebGeocalc rectangular UTC vectors. Unsupported columns, units and non-UTC tables fail explicitly. Modern Horizons UT is interpreted as UTC for accepted dates from 1962. Leap-second labels unsupported by Python datetime are rejected; original sub-millisecond timestamp text is retained. No implicit frame/datum/apparent-to-geometric conversion occurs.

Copy raw/prepared files together with no active writer. Keep acquisition configurations/code versioned and runtime data ignored. For parser changes increment `PARSER_VERSION` and prepare again; incompatible manifests need a new directory or deliberate migration. Do not edit original measurements to add derived columns.

## Read prepared data in Python

Run from `backend/`:

```python
from app.services.storage import DataStore
from app.services.normalization import utc_ms

with DataStore("data/prepared", "data/raw") as store:
    dataset = store.latest_dataset("horizons_sun_observer")
    selected = store.series(
        dataset["id"],
        start_ms=utc_ms("2026-12-01T06:00:00Z"),
        stop_ms=utc_ms("2026-12-01T12:00:00Z"),
    )
    elevations = [row["elevation_deg"] for row in selected["samples"]]
    catalog = store.latest_dataset("moon_catalog_south")
    products = store.products(catalog["id"], title_contains="DEM", limit=20)
    terrain = store.latest_dataset("dem_south_pole_sample")
    patch = store.raster_window(terrain["id"], (-25, -25, 25, 25))
    physical_values = patch["values"] * patch["scale"] + patch["offset"]
```

Inclusive sample bounds support later interpolation but do not interpolate or prove gap-free coverage. Bounds beyond saved samples are rejected. If a source has several request configurations, select `request_sha256` or an exact dataset ID.

Raster windows return masked native-resolution pixels and their actual transform/CRS/scale/offset, preserve valid zeros, reject outside bounds, and cap reads at four million pixels by default. Transform lunar coordinates into the native projection first. Valid masks are not accuracy guarantees; absent vertical units must be obtained from product metadata.

## Configuration and modules

Root `.env.example` documents catalog/source URLs, HTTP timeout, ports and `CORS_ORIGINS` (default localhost/127.0.0.1:5173). Acquisition settings are backend-local in `app/settings.py`; catalog/environment settings are in `app/core/config.py`.

`app/main.py` builds the single FastAPI app; `api/` contains catalog/coverage/scientific routes, `routes.py` the source-data API, and `cli.py` / `__main__.py` the terminal commands. `services/sources.py`, `normalization.py` and `storage.py` handle original/parsed data; `services/terrain/` and `ephemerides/` serve HTTP calculations; `services/engine/` implements the separate V1 pipeline. Tests cover source failures, storage integrity, requests/jobs, terrain, geometry and CLI behavior without silently substituting synthetic scientific data.
