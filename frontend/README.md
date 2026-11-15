# Frontend

React 19, TypeScript, Vite and CesiumJS. The interface synchronizes a lunar globe, local terrain horizon and visibility timeline, with reports, mission requirements and point comparisons. Reviewed against the working tree on **2026-11-15**.

## Run

From the repository root, `npm start` runs Docker frontend/backend on http://localhost:5173 and http://localhost:8000. `npm run prod` serves the built frontend through nginx on http://localhost:8080. Vite/nginx proxy `/api`; Docker polling supports source reload on Windows.

Without Docker, use the Node version in `.nvmrc`:

```sh
nvm use
npm install
npm run dev
```

Start the backend separately from `backend/` with `.venv/bin/python -m uvicorn app:app --port 8000`. Initialize catalogs with `.venv/bin/python -m app.cli init-regions`. See the [backend guide](../backend/README.md).

`npm run build` type-checks and builds; `npm run lint` checks source; `npm run preview` serves the bundle. `npm test` from `frontend/` runs the existing unit tests.

## Data sources

| Setting | Behavior |
|---|---|
| `VITE_DATA_SOURCE=api` (default) | Real catalogs, terrain and scenario jobs through `VITE_API_BASE_URL` (default `/api`) |
| `VITE_DATA_SOURCE=demo` | Explicit synthetic examples, rankings and analyses, labeled as demonstration data |

Development proxy target is `MEOWRIZON_API_ORIGIN`, default `http://localhost:8000`, or `http://backend:8000` in Docker. Restart Vite after environment changes and rebuild production bundles. See [environment settings](.env.example), the [API contract](../docs/api-contract.md) and [data dictionary](../docs/api-data-dictionary.md). TanStack Query is not installed; state/runners manage requests directly.

In API mode, pickers/search/markers use real site catalogs. Region/site identities are distinct and adapters retain source metadata/geometries. Catalog errors show retry rather than falling back to demo. Catalog-wide results evaluate documented sites and polygon centers for the selected period: centers are **point estimates**, not complete regional assessments.

`/api/coverage` only reports prepared products; an empty list draws no invented coverage bands. Scientific origin does not establish validation. The CLI V1 validation report applies to a separate implementation and configuration.

## Mission requirements and catalog comparisons

The results page offers editable requirements for solar, Earth and simultaneous visibility, maximum outages, minimum joint window, local slope, plane-residual RMS and DEM resolution. Blank limits are disabled. Selected date/duration define the user scenario. The initial solar filter is **45% inclusive**, a project default rather than a NASA requirement. Profiles are validated and saved locally.

Requirements are evaluated first: a violated constraint excludes a candidate, while a missing required metric produces **Insufficient data**. Only eligible candidates enter Pareto fronts. Front 1 contains nondominated tradeoffs; later fronts are dominated by earlier ones. Visibility/outages/joint duration are compared; terrain and energy participate when enabled and known for all eligible candidates. Computation failure remains distinct from exclusion, and cards retain constraints/provenance.

A secondary visibility index orders candidates within the same front:

```text
300 / (1/S + 1/E + 1/B) * sqrt((1 - N/T) * (1 - R/T))
```

S/E/B are visibility fractions; N/R/T are maximum solar/Earth interruptions and scenario duration in the same units. Zero visibility yields zero index. Demo data only supplies N and uses `1-N/T`; unavailable required measurements are never assumed satisfied. The index does not override requirements and is not a success probability. The configurable time margin expands interruptions and trims each window by one margin at each boundary; it is not a statistical uncertainty estimate.

The optional energy check uses solar visible fraction, Sun-observer distance and timestamps. It assumes an ideally Sun-facing panel, nominal net generation at 1 AU, constant load, configurable battery capacity/initial charge/reserve and efficiencies. Generation scales with visible fraction and inverse squared distance. Piecewise-linear integration splits at net-power sign changes and tracks saturation, unserved demand and first reserve violation. Defaults are disabled examples, not a real vehicle. Editing these local assumptions does not require new ephemerides; changing solar screening reconsiders skipped candidates.

Catalog-ranking terrain requests include `includeLocalTerrain:true`. The backend fits a plane on a 100 m circular native PGDA support with projection-scale correction and at least 16 samples, returning slope/residual and source hash. The coarse global product cannot resolve that support and reports unknown metrics. No sub-pixel obstacle or landing-ellipse safety is inferred.

Ranking requests send `minSunFraction` to scenario evaluation. After terrain, the backend screens Sun first and can omit Earth acquisition if even the sampled solar upper estimate falls below the threshold. Borderline candidates continue; eclipse-aware screening follows. A skipped result is distinct from complete/failed evaluation and has a separate cache identity. Brief events between samples can be missed; terrain/initial Sun acquisition costs remain.

These decision aids are independent implementations inspired by [NASA Decision Analysis](https://www.nasa.gov/reference/6-8-decision-analysis/) and [architecture/date-dependent site selection](https://ntrs.nasa.gov/citations/20250011660). They are not validated or approved by NASA. Flight design, science goals, full-footprint safety, thermal/RF models, date sensitivity and terrain uncertainty require additional work.

## Site view and point comparison

Site analysis starts after inputs settle for **350 ms**, on the site page. A completed terrain profile appears before its scenario finishes; scenario failure does not hide valid terrain. `TerrainPanorama` renders numerical skyline angles as an SVG with rotation/zoom. Timeline/statistics require available scenario data. Current HTTP scenarios can include Horizons eclipse and orbit context; local approximate modules remain presentation/demo fallbacks and must not be treated as independent validated predictions.

The previous period loads without blocking the current result and uses the same duration immediately before T. Superseded client waits are aborted, while server work may finish and be cached. Playback reads loaded samples/intervals without new scientific requests per frame. Two-scenario A/B views use shared duration/step and elapsed-time alignment; the comparison screen keeps independent runs for up to four selected points, with per-site failures and provenance.

## Rendering and structure

Cesium loads lazily; `vite.config.ts` serves/copies its Workers, Assets, Widgets and ThirdParty files. No Cesium ion token is required. The globe uses `Ellipsoid.MOON`, a 1737.4 km sphere without atmosphere/fog, and Moon Trek LRO WAC imagery. It is a visualization, not a terrain-analysis mesh. Equirectangular imagery distorts near the poles.

```text
src/api/        Transport types, HTTP/demo providers, job polling
src/domain/     Catalog adapters, metrics, mission assessment and formatting
src/state/      External store and analysis/comparison runners
src/screens/    Moon/Explore, Site, Compare and Brand kit
src/features/   Globe, panorama, timeline, reports, eclipse/orbit views
src/ui/         Shared custom controls and visual components
```

HTTP polar horizons use 20/240 m PGDA products; global sites use a coarser DEM. Finite spatial/time sampling can miss narrow terrain peaks or short events. Truncated durations are bounded by the chosen window. Product coverage overlays do not certify individual horizon circles, and neither geometric Earth visibility nor a battery approximation establishes mission feasibility.
