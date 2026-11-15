# Moonrizon

Moonrizon compares lunar locations and dates using terrain horizons, sunlight and geometric Earth visibility. It is developed for the NASA Space Apps **Lunar Landing Site Navigator** challenge. Results support exploration and preliminary comparisons; they do not certify landing safety, power availability or radio performance.

## Current status

Reviewed against the working tree on **2026-11-15**.

- The React/TypeScript frontend provides a lunar globe, local horizon, timeline, reports and comparisons. API mode is the default; `VITE_DATA_SOURCE=demo` explicitly enables synthetic examples.
- FastAPI serves real region/site catalogs, terrain-analysis jobs and scenario-evaluation jobs. Scientific results use numerical LOLA terrain and JPL Horizons. Coverage is reported separately; `/api/coverage` currently returns an empty product list rather than claiming global preparation.
- The independent Python **V1 library/CLI** analyzes identified points in de Gerlache Rim 2 and Malapert Massif. Its numerical checks passed for the documented demo configuration. **Independent observational validation remains incomplete**, and physical terrain uncertainty is not quantified.
- The HTTP calculation path and CLI V1 use different orchestrators and terrain configurations. CLI validation does not certify every HTTP result, global site or frontend comparison. See the [validation review](docs/validazione-engine-v1-revisione.md).

The catalog contains 13 historical 2022 Artemis candidate polygons and 9 documented sites. A polygon center is a point estimate, not an assessment of its entire area. Regional grids, cumulative areas and annual P50 remain future scientific work. Current mission requirements, Pareto comparisons and the optional battery model are frontend decision aids with their own assumptions, described in the [frontend guide](frontend/README.md).

## Run with Docker

Start Docker Desktop, then run from the repository root:

```sh
npm run setup
npm start
```

`setup` builds the images and initializes Moon Trek catalogs. Startup alone does not prepare every scientific dataset; first analyses may require upstream downloads.

| Service | Address | Purpose |
|---|---|---|
| Frontend | http://localhost:5173 | Vite development server |
| Backend | http://localhost:8000/api | FastAPI service |
| API documentation | http://localhost:8000/api/docs | Implemented HTTP schemas and routes |
| Production frontend | http://localhost:8080 | nginx, enabled with `npm run prod` |

Vite and nginx proxy `/api` to the backend. Docker uses `VITE_DATA_SOURCE=api` unless overridden in `.env`.

| Command | Purpose |
|---|---|
| `npm run start:bg` | Start development services in the background |
| `npm run stop` | Stop development services |
| `npm run logs` / `npm run status` | Follow logs / inspect containers |
| `npm run prod` / `npm run prod:stop` | Start / stop the production profile |
| `npm run data:init` | Download and rebuild region/site GeoJSON |
| `npm run data:init:offline` | Rebuild using the cached polygon response |
| `npm run check` | Backend lint/format/tests and frontend lint/type checks |
| `npm run check:backend` | Backend checks in Docker |
| `npm run check:frontend` | Frontend checks in Docker |
| `npm run test:network` | Explicit Horizons network check |

After dependency changes, rebuild images and renew dependency volumes with `docker compose up --build -V`.

## Run locally

Use the Node version in `.nvmrc`:

```sh
nvm use
npm install
npm run dev
```

Start the backend separately as described in its [README](backend/README.md). `npm run build`, `npm run lint` and `npm run preview` operate on the frontend workspace. To use synthetic examples explicitly:

```sh
VITE_DATA_SOURCE=demo npm run dev
```

## Reproduce the CLI demo

From the repository root:

```sh
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json --offline
```

Offline execution requires a complete cache. Results and manifests are written under `backend/data/analysis/`; commands, schemas, cache rules and validation procedures are in the [engine guide](backend/docs/engine-v1.md).

## Documentation

| Document | Scope |
|---|---|
| [Project decisions](docs/stato-decisioni.md) | Current implementation, scope and remaining work |
| [Scientific criteria](docs/criteri-algoritmo.md) | Definitions, V1 requirements and deferred regional metrics |
| [Sources and challenge scope](docs/fonti-e-perimetro-challenge.md) | Source policy and research limits |
| [Data guide](docs/guida-dati.md) | Acquisition, units, frames and quality |
| [Regions and sites](docs/siti-e-regioni.md) | Historical catalog and interpretation |
| [API contract](docs/api-contract.md) | Implemented routes and job workflow |
| [Data dictionary](docs/api-data-dictionary.md) | HTTP fields and distinction from CLI schemas |
| [Validation review](docs/validazione-engine-v1-revisione.md) | Latest recorded scientific evidence and limits |
| [Initial validation](docs/validazione-engine-v1.md) | Historical baseline retained for reproducibility |
| [LROC protocol](docs/protocollo-validazione-lroc-v2.md) | Pending independent observational benchmark |

The documentation review removed superseded implementation prompts, completed implementation/merge plans, the obsolete frontend audit and Query migration plan, archived HTTP schemas and full-flight brainstorming. Useful operational details are consolidated in the retained guides. Existing document paths are preserved for compatibility; their contents are English.

## Repository layout

```text
frontend/          React, TypeScript, Vite and CesiumJS
backend/app/       FastAPI, acquisition, terrain, ephemerides and CLI engine
backend/catalog/   Versioned region/site definitions
backend/config/    Acquisition and analysis configurations
backend/schemas/   Versioned CLI JSON schemas
backend/tests/     Backend tests
backend/data/      Backend-local acquisition, prepared data, jobs and CLI analysis
backend/docs/      CLI engine guide
data/              Root catalog downloads and generated region/site GeoJSON
docs/              Scientific specifications, API documentation and validation
```

There is no database. Runtime datasets are ignored by Git. Root catalog data and backend-local scientific data have different storage roots; see the [backend guide](backend/README.md). Scientific sources retain original product responsibility and provenance. NASA data provenance does not imply NASA approval of this application.
