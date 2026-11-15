# Backend

Python 3.12 e FastAPI, eseguito in Docker. Qui sta **tutta la logica** del progetto: dati, calcoli, confronto delle regioni, API e agente AI. Il frontend TypeScript si occupa solo della visualizzazione. Per l'avvio locale, il percorso dati predefinito è `backend/data/`.

Per ora ci sono le regioni Artemis III (`GET /api/regions`) e i siti di atterraggio (`GET /api/sites`); la valutazione non è ancora implementata (vedi `docs/piano-logica.md`). `GET /api/coverage` restituisce un catalogo vuoto finché non esiste un DEM preparato e verificato per l’analisi. Il prodotto scelto per i calcoli futuri è il GeoTIFF PGDA LOLA adjusted 20 m/pixel (`LDEM_80S_20MPP_ADJ`); la sua pubblicazione online da sola non lo rende disponibile per le analisi. Non c'è un database: i dati stanno in file in `data/`.

**Specifica scientifica approvata il 15/11/2026:** [criteri-algoritmo.md](../docs/criteri-algoritmo.md)
prevale sui precedenti appunti in `backend/docs/` e sulle ipotesi scientifiche del contratto
client. L'engine è indipendente dal veicolo: fasce descrittive della pendenza [0°,5°),
[5°,10°), [10°,15°), ≥15°, nessun filtro automatico a 10°, confronto per metriche senza
punteggio globale. Questa revisione è documentale; engine e successiva integrazione
del frontend non sono ancora implementati.

- `app/main.py`: crea l'applicazione, configura il CORS e registra i router.
- `app/cli.py`: comandi da terminale (`init-regions`).
- `app/api/`: un modulo per gruppo di endpoint (`health.py`, `regions.py`).
- `app/core/config.py`: configurazione letta dalle variabili d'ambiente.
- `app/core/moon.py`: sfera lunare di riferimento (1 737 400 m) e proiezione stereografica polare sud.
- `app/core/manifest.py`: registro dei download (`data/sources/manifest.json`).
- `app/services/regions/`: catalogo, download da Moon Trek, costruzione dei GeoJSON.
- `app/services/terrain/`: DEM LOLA polari (`lola_products.py`) e, in seguito, horizon mask.
- `app/services/ephemerides/`: posizione di Sole e Terra dall'API di JPL Horizons. Non si usa SpiceyPy.
- `catalog/`: quali regioni e siti usare (`regions.toml`, `sites.toml`).
- `tests/`: test con pytest; `tests/fixtures/` contiene la risposta reale di Moon Trek.

## Regioni e siti

### Stato dell'integrazione frontend (verifica del 15/11/2026)

Con `VITE_DATA_SOURCE=api`, il proxy Vite inoltra correttamente le richieste al backend: `/api/regions` restituisce 13 regioni (2 attive), `/api/sites` 16 siti, `/api/coverage` zero DEM pronti. I POST terreno/scenario e il polling GET sono implementati come ricevute persistenti con errore esplicito: il motore scientifico non è ancora disponibile. Il ranking nel frontend carica ancora `public/mock/regions.json` anche in modalità API: quei punteggi non provengono dai dati NASA. Uno scenario reale completo resta da implementare.

### Interfaccia terreno/scenario implementata

- `POST /api/terrain-analyses`: riceve `site`, `observerHeightM`, `config.azimuthStepDeg/maxDistanceKm`.
- `GET /api/terrain-analyses/{jobId}`: legge la ricevuta terreno salvata.
- `POST /api/scenario-evaluations`: riceve `terrainAnalysisId`, `startUtc`, `stopUtc`, `stepMinutes`.
- `GET /api/scenario-evaluations/{jobId}`: legge la ricevuta scenario salvata.

Le POST valide rispondono 202 con `{id,status:"failed",error:{code,message}}`, compatibile con `HttpProvider` e `runJob` attuali. I codici sono `terrain_engine_unavailable` e `scenario_engine_unavailable`. Non viene creato alcun risultato scientifico. GET restituisce 200 per job noti, 404 per ID ignoti o dell'altra famiglia. Gli input invalidi rispondono 422 con `detail` stringa leggibile dal client e `errors` per campo. Le longitudini sono normalizzate; numeri non finiti, poli esatti, passi azimutali che non dividono 360, tempi non UTC e intervalli non crescenti sono rifiutati.

Le ricevute e i parametri sono salvati atomicamente in `backend/data/jobs/scientific/`, separati dai job di acquisizione. Ogni invio crea una nuova ricevuta; non ci sono deduplicazione, scadenza o retry automatico. Nessun download viene avviato dalle richieste scientifiche. La coda di acquisizione continua a funzionare indipendentemente.

Per usare l'interfaccia dal frontend, avviare il backend con `uvicorn app:app --port 8000` da `backend/`, poi `VITE_DATA_SOURCE=api npm run dev` da `frontend/`. La UI visualizzerà l'errore del motore; la modalità API non sostituisce ancora i percorsi mock, le orbite o le eclissi locali.

Le nuove strutture scientifiche sono proposte in [SCIENTIFIC_SCHEMA_PROPOSAL.md](SCIENTIFIC_SCHEMA_PROPOSAL.md). Non sono nuove rotte o risultati implementati. Le decisioni U01–U09 del contratto revisione 3 restano da chiudere. La verifica documentale `scripts/verify_api_integration.py` segnala correttamente che `app/main.py` è cambiato rispetto all'audit statico; il manifest nella cartella `docs/` richiede una nuova revisione del comportamento, non solo l'aggiornamento degli hash.

Le regioni sono solo quelle candidate di Artemis III. Il catalogo `catalog/regions.toml` decide quali usare (`active`), il limite del settore e la dimensione delle celle; i contorni non si scrivono a mano.

```sh
docker compose run --rm backend python -m app.cli init-regions            # scarica da Moon Trek
docker compose run --rm backend python -m app.cli init-regions --offline  # riusa l'ultimo download
```

Il comando:

1. scarica i poligoni da Moon Trek e salva la risposta grezza in `data/sources/`, con URL, data e SHA-256 in `manifest.json`;
2. li converte in latitudine e longitudine;
3. li controlla, e si ferma se qualcosa non torna;
4. scrive `data/regions/regions.geojson` e `sites.geojson`.

Va rilanciato dopo ogni modifica al catalogo.

I siti si aggiungono a `catalog/sites.toml`, sempre con una fonte: il comando rifiuta un sito senza fonte. I siti possono stare ovunque sulla Luna, perché il limite del settore vale solo per le regioni. Quelli fuori dal settore hanno `in_sector: false` e non hanno ancora un DEM. Ogni sito sarà valutato come una cella di 100 × 100 m.

## Avvio con Docker

Prerequisito: Docker Desktop avviato. Comandi da eseguire nella radice del repository. `npm start` avvia backend e frontend insieme; `npm run check:backend` esegue ruff e pytest (elenco completo dei comandi nel README principale). Solo il backend:

```sh
docker compose up --build backend
```

- API: http://localhost:8000/api (tutte le rotte sotto `/api`, come prevede il contratto con il frontend)
- Documentazione interattiva: http://localhost:8000/api/docs
- Stato: http://localhost:8000/api/health

Il codice di `backend/` è montato nel container: modificando un file Python il server si riavvia da solo. La cartella `data/` è montata su `/app/data`, quindi dati scaricati e cache restano sul disco e fuori da Git.

Altri comandi:

```sh
docker compose run --rm backend pytest              # test senza rete
docker compose run --rm backend pytest -m network   # verifica che il container raggiunga Horizons
docker compose run --rm backend ruff check .        # controllo del codice
docker compose run --rm backend ruff format .       # formattazione
docker compose down                                 # ferma il servizio
```

Dopo una modifica a `environment.yml` l'immagine va ricostruita con `docker compose build backend`.

## Configurazione

I valori di default sono nel codice. Per cambiarli si copia `.env.example` in `.env` nella radice del repository e si modifica solo ciò che serve: porta del backend, URL delle fonti (Horizons, Moon Trek, PDS), timeout HTTP e indirizzi del frontend autorizzati (`CORS_ORIGINS`, di default il server di Vite su `localhost:5173`).

## Perché FastAPI e non Flask

- Genera da solo lo schema OpenAPI (`/api/openapi.json`), da cui si ricavano i tipi TypeScript del frontend.
- Controlla i parametri dai tipi Python (date, soglie) e risponde con errori chiari se sono sbagliati.
- Ha la documentazione interattiva su `/api/docs`, utile per provare le API senza frontend.

Con Flask le stesse cose richiedono estensioni aggiuntive.

## Immagine

- Base: `mambaorg/micromamba:2.10.0-ubuntu24.04`.
- Dipendenze installate da conda-forge con `environment.yml`, così GDAL, Rasterio e PROJ restano coerenti tra loro.
- Il servizio gira con l'utente non privilegiato `mambauser`.

## Senza Docker

In alternativa si può creare l'ambiente con conda, sempre dalla radice del repository:

```sh
conda env create -f backend/environment.yml
conda activate meowrizon
cd backend
uvicorn app.main:app --reload
```

---

## Acquisizione e preparazione dei dati (`/api/data`)

Sezione scritta da Kevin sul branch `backend` e integrata il 15/11/2026. Note di integrazione:

- c'è **una sola applicazione FastAPI**, `app.main:app`, con tutte le rotte: `/api/health`, `/api/regions`, `/api/sites` e `/api/data/...`. Funziona anche `uvicorn app:app`;
- la documentazione interattiva è su `/api/docs` e lo schema su `/api/openapi.json`, perché Vite e nginx inoltrano solo `/api`. `/health` risponde sia sulla radice sia su `/api/health`;
- in Docker i comandi qui sotto diventano `docker compose run --rm backend python -m app ...`. I dati di questa parte stanno in `backend/data/` (raw, prepared, jobs), separati da `data/` della radice, che contiene regioni e siti;
- i comandi `fetch`, `prepare` e `data-info` stanno nella stessa CLI di `init-regions`: `python -m app <comando>` o `python -m app.cli <comando>`.

The backend uses **FastAPI and files only**, as requested. It downloads original API responses and prepares JSON manifests, compressed Parquet tables and GeoTIFF metadata for Python analysis. HTTP collection, preparation, job polling and filtered-data routes are implemented. Scientific terrain, surface-condition and regional-comparison routes remain to be implemented; [API_CONTRACT.md](API_CONTRACT.md) links the current integration contract, complete interaction map, data dictionary and TanStack Query plan. The earlier proposal is archived; open scientific DTO and HTTP decisions are explicitly documented, subordinate to the approved criteria. All code, configurations, runtime data and test files live inside this directory. No repository-root or frontend files are needed to run the service. The internal file schemas are independent of the scientific client contract.

## Install and run

Run all commands from this `backend/` directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

On Windows use `.venv\Scripts\python.exe`. Alternatively, `conda env create -f environment.yml` installs FastAPI and the scientific dependencies. The dependencies include FastAPI/Uvicorn, Requests, Rasterio/NumPy, PyArrow for Parquet and FileLock for serializing preparation writers. No database is used.

The default [configuration](config/sources.example.json) retrieves Moon Trek catalogs, 2022 candidate-region polygons and metadata, a small terrain TIFF, WMTS capabilities, a JPEG tile, Sun/Earth observer ephemerides, and Moon position/velocity vectors. These are independent acquisition samples, not full regional coverage or a complete mission. The terrain tile is 100 × 100 m at the pole; the Horizons observer is at latitude -89.45° and altitude zero above the reference sphere. A real site's altitude must include terrain height and instrument height.

Start the FastAPI server, on the port used by the existing Vite proxy:

```sh
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

`GET /health` reports process liveness; `/docs` provides interactive API documentation. Server startup does not fetch upstream data. HTTP requests start collection/preparation jobs in one background worker; job state persists as JSON in `data/jobs/`. Run one Uvicorn process for this data directory. The service lock rejects a second instance using it. Interrupted jobs are marked failed on restart and can be resubmitted.

## Use the HTTP service

```sh
curl http://127.0.0.1:8000/api/data/sources
curl -X POST http://127.0.0.1:8000/api/data/collect \
  -H 'Content-Type: application/json' \
  -d '{"profile":"default","names":["horizons_sun_observer"],"refresh":false}'
```

The POST returns HTTP 202 with an `id`. Poll the returned job ID:

```sh
curl http://127.0.0.1:8000/api/data/jobs/JOB_ID
curl http://127.0.0.1:8000/api/data/datasets
```

Job states are `queued`, `running`, `completed` and `failed`. Completed collection jobs include download/cache results and a preparation report. Failures report errors; successfully downloaded files remain usable. At most eight running/queued jobs are accepted, with HTTP 429 when full. Upstream requests are serialized; the CLI uses the same collection lock.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/data/sources` | Available source profiles and configured upstream requests. |
| POST | `/api/data/collect` | Body: `profile` (`default` or `trajectory`), optional `names`, `refresh`. Download then prepare files. |
| POST | `/api/data/prepare` | Prepare existing raw files offline; returns a job. |
| GET | `/api/data/jobs/{id}` | Read persistent job status/progress/results. |
| GET | `/api/data/datasets?name=...` | List dataset IDs, source versions, preparation states and counts. |
| GET | `/api/data/datasets/{id}/samples?start_ms=...&stop_ms=...` | Filter time-series rows by inclusive UTC milliseconds; context/provenance included. |
| GET | `/api/data/datasets/{id}/products?title_contains=DEM&limit=20` | Filter product catalogs; optional `max_source_resolution` retains native source units. |
| GET | `/api/data/datasets/{id}/regions` | Read candidate polygons and their native lunar reference metadata. |

Use the dataset IDs from `/datasets`, not a product ID or job ID. Invalid inputs/time bounds return 422; unknown jobs/datasets return 404; datasets that are not prepared return 409. Collection accepts only the bundled/configured profiles, not arbitrary URLs or filesystem paths. Edit dates, positions and other native provider parameters in `config/*.json`; HTTP domain-specific user parameter mapping remains future work.

These are source-data service endpoints. Coverage, terrain/surface-condition calculation and regional comparisons by explicit metrics remain to be implemented; the existing frontend scientific client is not connected by these data routes alone. Their HTTP contract will be aligned after the algorithm.

Retrieve a separate historical Blue Ghost trajectory sample:

```sh
.venv/bin/python -m app fetch --config config/trajectory.example.json
```

This uses WebGeocalc's remote SPICE calculations, with kernel-set discovery and bounded polling. It retrieves historical states rather than designing a new flight.

## Configuration and storage

Edit native provider parameters in the configuration to change dates, coordinates, products or raster bounding boxes. The configurations describe downloads, not frontend data types.

```sh
.venv/bin/python -m app fetch --only horizons_sun_observer --only horizons_earth_observer
.venv/bin/python -m app fetch --output data/raw
.venv/bin/python -m app fetch --only moon_catalog_south --refresh
```

Files are saved as:

```text
data/raw/<name>/<request-hash>/<UTC-timestamp>-<unique-suffix>/
  response.json     # or .tif, .xml, .jpg, .png
  metadata.json
```

Response bodies retain the provider's original format. Horizons JSON still contains its text/CSV table and scientific headers. Metadata records the request, URL, timestamps, content information and SHA-256 checksum. Identical successful requests reuse local files after checksum verification. Refresh creates a new version and preserves previous downloads.

Failed requests receive failure metadata; invalid returned bodies are saved as `failed-response.bin` when available and never reused as successful data. Independent requests continue, with a nonzero exit code if any fail. The collector has timeouts, limited GET retries and a configurable `max_mb` response limit (default 128 MiB).

Catalog truncation and feature transfer-limit flags are rejected. Generic pagination is not implemented: increase catalog `rows` or request a smaller feature area. Raster bounding boxes use the product's projection. Respect source coverage and export dimensions. `--only` selects individual names, so include associated layer metadata when acquiring new terrain products.

`MEOWRIZON_USER_AGENT` can override the default product/version and project contact URL. Configuration/data paths are anchored to this backend directory. CLI path overrides must also remain inside it; the previous external data-directory environment overrides are no longer used. Collection is serialized with a shared file lock, following [JPL's policy](https://ssd-api.jpl.nasa.gov/).

The local datasets are ignored by Git. Keep the request configurations and acquisition code in version control so other team members can reproduce downloads. QuickMap remains a manual visual reference; this code uses Moon Trek's numeric and imagery services.

## Storage for analysis

Use three layers. The first two are implemented; scientific result caching is the next layer to build.

| Layer | Location | Contents and purpose |
|---|---|---|
| Original downloads | `data/raw/` | Unchanged provider responses, including GeoTIFF terrain, plus requests/checksums. Preserve these to reproduce or change an analysis. |
| Searchable preparation | `data/prepared/` | JSON manifest and versioned Parquet tables for products, regions and time series, plus JSON raster/series context. Filter saved records without reparsing provider text. |
| Derived results (planned) | `data/cache/`, with JSON manifests | Versioned horizon profiles, terrain metrics, visibility intervals and scenario summaries. Recompute when inputs or algorithms change. |

[Parquet supports column selection and row filters](https://arrow.apache.org/docs/python/generated/pyarrow.parquet.read_table.html), with compression and typed numerical columns. Preparation writes Zstandard-compressed files with row-group statistics. Time filters can skip unrelated row groups in larger series; small examples still fit in one group. Product-title filtering currently scans its selected product table in memory. JSON manifests hold the small index/provenance records. No SQL layer or database service is involved.

Keep raster pixels in GeoTIFF, not one SQL row per pixel or a huge JSON array. [Rasterio windows](https://rasterio.readthedocs.io/en/stable/topics/windowed-rw.html) read only intersecting raster blocks; actual I/O depends on the TIFF's block layout. Larger *derived* rasters should use tiled, losslessly compressed GeoTIFF/COG, with scientifically chosen resolution. The current implementation references existing TIFFs and does not rewrite them, resample them, smooth them or assume every TIFF is a COG.

The CLI is optional; the HTTP service performs the same acquisition/preparation work. To use the CLI:

```sh
.venv/bin/python -m app fetch
.venv/bin/python -m app data-info
```

Preparation is offline:

```sh
# Import all saved snapshots, including the optional historical trajectory.
.venv/bin/python -m app prepare
# Inspect IDs and counts for one configured source.
.venv/bin/python -m app data-info --name horizons_sun_observer
# A separate preparation experiment without replacing the default files.
.venv/bin/python -m app prepare --raw data/raw --output data/prepared-experiment
```

Default paths are `data/raw/`, `data/prepared/` and `data/jobs/` inside this backend. CLI overrides such as `--output data/prepared-experiment` are resolved relative to this directory even when the process starts elsewhere, and paths escaping the backend are rejected. Runtime data is excluded by the backend's own `.gitignore`. Copy raw and prepared data together while no writer is active; all stored source/artifact paths are relative to their respective roots.

```text
data/prepared/
  catalog.json                         # schema version and dataset/provenance index
  datasets/<dataset-id>/v1-<revision>/
    products.parquet                   # only for product catalog datasets
    regions.parquet                    # only for candidate polygon datasets
    observer_samples.parquet           # or vector_samples.parquet
    series.json                        # time bounds and scientific context
    rasters.json                       # only for terrain: grid metadata
```

Each snapshot has only its relevant files. A new preparation revision is written completely before the manifest is replaced atomically. A file lock prevents concurrent writers; readers use immutable published files. Interrupted/unpublished revisions may remain on disk but are not selected by the manifest. This design targets local/shared project storage; distributed jobs and cache retention policies remain future work.

Every preparation verifies raw file sizes/SHA-256 hashes and checksums of prepared files. Unchanged snapshots reuse their parsed records; damaged prepared files are rebuilt from raw data. Refreshes remain separate dataset versions, and partial preparations are never published as usable. Unsupported metadata documents and display images are `archived`, supported parsed datasets are `prepared`, and errors are `failed`. Failed/incomplete downloads are skipped. **Prepared means parsed/indexed, not scientifically validated, complete site coverage, or safe for landing.** Corrupted previously indexed sources are marked failed on the next preparation and excluded from query helpers.

Internal formats defined in [storage.py](app/services/storage.py):

| File | Main fields | Meaning |
|---|---|---|
| `catalog.json` | ID, source/request hashes, relative path, fetched time, status, parser version, provenance JSON | One entry per acquisition snapshot; previous source versions remain selectable. |
| `products.parquet` | Product UUID, title, label, `source_resolution`, projection, original record JSON | Remote catalog entries. Presence here does **not** mean their terrain has been downloaded. Resolution is preserved as supplied; check source metadata/units before comparing different products. Zero/unknown resolution is excluded by a positive resolution filter. |
| `regions.parquet` | Region ID, label, native bounds, geometry, spatial reference, attributes | The dated 2022 candidate polygons in their original lunar projection; not WGS84 GeoJSON or verified landing points. |
| `series.json` | Kind, first/last sample, scientific context JSON | Source headers, request parameters, target/observer/frame information and units remain attached to the dataset identified in the manifest. |
| `observer_samples.parquet` | UTC epoch ms, azimuth/elevation in degrees, range in AU, range rate in km/s, flags | Horizons apparent observer samples, sorted by time within a dataset. Missing numeric values remain null. |
| `vector_samples.parquet` | UTC epoch ms, x/y/z in km, vx/vy/vz in km/s, original time label | Horizons or WebGeocalc states, each in its own declared frame/origin. Never merge them just because columns match. |
| `rasters.json` | Native bounds, pixel spacing, CRS WKT, dimensions, dtype/NoData/transform/scales/tags | Metadata for locally saved terrain; pixel values remain in the original TIFF. |

The adapters deliberately support the current examples: Horizons CSV observer quantities `4,20` and vector table `2` with `KM-S` and `UT`, plus WebGeocalc rectangular UTC state vectors. Other layouts/units fail explicitly until an adapter is added. [Horizons defines modern UT as UTC](https://ssd.jpl.nasa.gov/horizons/manual.html#time-scales); we accept dates from 1962, retain source timestamp text and use integer millisecond indices. Leap-second labels unsupported by Python's datetime and non-UTC tables are rejected, not shifted silently. Sub-millisecond source precision remains in the original label. No coordinate-frame, height, datum or apparent/geometric transformation is performed here.

## Use the saved data in Python

Run from this backend directory with its Python environment:

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
    # Seven existing hourly samples, plus context and acquisition provenance.
    elevations = [row["elevation_deg"] for row in selected["samples"]]

    catalog = store.latest_dataset("moon_catalog_south")
    products = store.products(catalog["id"], title_contains="DEM", limit=20)

    terrain = store.latest_dataset("dem_south_pole_sample")
    patch = store.raster_window(terrain["id"], (-25, -25, 25, 25))
    pixels = patch["values"]  # Masked NumPy array; bounds are native projected metres here.
    # Stored values require the returned scale/offset and verified product units/datum.
    physical_values = pixels * patch["scale"] + patch["offset"]
```

Time queries use inclusive sample bounds so a stop sample can support interpolation later. They neither interpolate nor prove gap-free coverage; they reject requests beyond the saved first/last sample. Visibility intervals in the frontend still use `[start, end)`. If multiple parameter sets share a source name, `latest_dataset` requires an explicit `request_sha256`; alternatively select an exact ID from `data-info`. This prevents accidentally choosing another site's ephemerides.

Raster windows return all intersecting pixels at native resolution, their actual transform/CRS, scale/offset and missing-data fraction. They preserve valid zero elevations and NoData masks, reject areas extending outside the raster, and cap reads at four million pixels by default. A valid mask is not proof of geometric or vertical accuracy. Lunar longitude/latitude must be transformed into the product's native CRS before calling this helper. Source vertical units can be absent from a TIFF and must then be obtained from associated product metadata.

To change a source date, location or product: edit the request configuration, run `fetch`, then `prepare`. To change parser behavior: edit `normalization.py`/`storage.py`, increment `PARSER_VERSION`, then run `prepare` against existing raw files. For incompatible manifest changes use a new prepared directory or add a deliberate migration; schema versions are checked. Write new Parquet files for derived columns/results rather than editing source measurements. You can inspect tables with PyArrow (`read_table(...).to_pylist()`) or load them into pandas after installing pandas; Parquet files themselves are binary, not text documents to edit by hand. Raw acquisitions remain the recovery path.

## Next: surface conditions and regional comparisons

The approved scientific flow is defined in [the criteria](../docs/criteri-algoritmo.md):

```text
Surface epoch T (UTC) → input validation → resolve exact source versions/coverage
  → reuse or calculate terrain metrics and time-dependent visibility
  → aggregate geometric conditions and descriptive slope bands
  → return comparable metrics + coverage + uncertainty + provenance
```

1. **Prepare shared inputs once.** Download appropriate terrain and ephemerides for supported regions/dates, keeping provenance. Acquire only missing data and serialize JPL requests. The current collector is for bounded API responses (128 MiB default), not multi-GB global DEM mirroring.
2. **Cache terrain independently of dates.** Key slope/roughness and horizon results by source hashes, site, observer height, radius, sampling, frame/datum and algorithm version. A date change can reuse this work.
3. **Calculate physical geometry.** Resolve Sun/Earth positions from JPL Horizons for the actual 3D observer; report horizontal elevation and terrain clearance separately. Compute visible-disc fractions including Earth occultation of the Sun. Distinguish complete darkness from solar visibility below 50%; Earth visibility does not guarantee a radio link. Refine events, test convergence and search beyond a lunation until an event is found or source coverage ends. Preserve unknowns and clipped intervals. These scientific calculations remain to be implemented.
4. **Describe slope without a vehicle filter.** Fit a plane over a circular 100 m diameter support on the 100 m sampling grid; publish value, uncertainty/quality and the four descriptive bands. No automatic slope threshold rejects a cell or region. Inadequate DEM resolution produces an unavailable metric, not invented detail from interpolation.
5. **Aggregate comparable areas.** Let B(T) contain cells with at least half of both Sun and Earth discs visible at T. Report B(T) and its cumulative subsets with slopes <5°, <10° and <15° in km² and percent of the region, with valid-data coverage and the largest four-neighbour connected component. Compare alternative availability at T ±1, 2, 3 days with the intersection of the same favourable cells; daily samples do not establish continuous availability. Preserve gaps rather than discarding later successful dates.
6. **Return explicit comparisons.** There is no global score or lexicographic winner. Each ordering names its metric; paired durations for a representative point must use that same identified point. Annual solar availability uses the full UTC calendar year, including leap years, and the 80% highlight is a team convention. VIPER's 50-hour hibernation reference is informational only. Thermal, electrical and radio-link models remain outside scope. HTTP/client contracts will be aligned after the engine, without changing the current frontend here.

Still required: suitable DEM coverage around actual sites, frame/datum consistency, terrain/horizon and visibility calculations, reproducible reference-case validation, measured numerical error/uncertainty and scientific FastAPI endpoints. Earlier full-flight and vehicle-dependent scoring proposals are not prerequisites for this general surface engine; the stored historical trajectory is a separate acquisition example. Source preparation is not scientific validation.

Local preparation on 2026-11-14 imported 1,652 catalog records, 13 region polygons, 75 Horizons samples, 3 historical WebGeocalc samples and one 20 × 20 terrain grid. Five supporting metadata/image responses remain archived. Prepared files total approximately 450 KiB; original response bodies remain approximately 4.0 MiB. These sizes describe these examples only, not a general compression benchmark. These are acquisition examples: the 100 m terrain sample at the pole and one-day ephemerides do not cover the frontend's default site, 150 km horizon radius or 30-day duration.

## Code and checks

- `app/__init__.py`: FastAPI app/factory and worker lifecycle.
- `app/settings.py`: backend-local configuration and path boundaries.
- `app/routes.py`: HTTP source collection, jobs and filtered dataset queries.
- `app/services/jobs.py`: serialized worker, persistent JSON jobs and restart recovery.
- `app/__main__.py`: module entry point for offline commands.
- `app/cli.py`: `fetch`, `prepare` and `data-info` commands.
- `app/services/sources.py`: HTTP calls, raw-file storage, provider checks and caching.
- `app/services/normalization.py`: supported provider text/column adapters.
- `app/services/storage.py`: JSON manifests, Parquet preparation, filtered queries and masked raster windows.
- `config/*.json`: provider request configurations.
- `tests/test_sources.py`: acquisition failure/caching checks without network calls.
- `tests/test_storage.py`: units/time semantics, failed imports, checksums, writer locking, parameter separation, filtered queries and native raster masks/bounds.
- `tests/test_app.py`: HTTP collection, filtering, caching, input/error handling, local paths and job recovery.

```sh
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m unittest discover -s tests -v
```

## Return original API data

`GET /api/data/sources/{source_name}/data` returns the latest saved upstream response unchanged. Examples:

```sh
curl http://127.0.0.1:8000/api/data/sources/horizons_sun_observer/data
curl http://127.0.0.1:8000/api/data/sources/candidate_regions_2022/data
curl http://127.0.0.1:8000/api/data/sources/moon_catalog_south/data
curl http://127.0.0.1:8000/api/data/sources/dem_south_pole_sample/data --output terrain.tif
```

Run file-output examples from this backend folder. JSON responses remain JSON (including Horizons' original text table inside `result`); TIFF, JPEG, PNG and XML use their native content types. `X-Dataset-Id`, `X-Source-Name` and the SHA-256 `ETag` identify the returned version. Files are checksum-checked before delivery.

For an exact version, use `GET /api/data/datasets/{dataset_id}/raw`. When a source name has several parameter sets, the shortcut returns 409 until you provide `?request_sha256=...` or select an exact dataset ID. Missing responses return 404; unavailable/corrupt versions return 409. These GETs read saved data and do not start network downloads. First use `POST /api/data/collect` and poll its job; use `refresh: true` when a fresh upstream response is wanted.
