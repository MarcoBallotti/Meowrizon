# HTTP API contract

Reviewed against the working tree on **2026-11-15**. The authoritative implemented request models are in [scientific.py](../backend/app/api/scientific.py), the frontend DTOs in [types.ts](../frontend/src/api/types.ts), and the served schema at `/api/openapi.json`. This replaces the obsolete revision-3 frontend audit, whose source fingerprints and unimplemented-endpoint inventory no longer matched the application.

FastAPI uses file-backed storage. All application routes below include `/api`; the frontend defaults to base URL `/api`, so do not add that prefix twice. Vite/nginx proxy requests to the backend.

## Implemented routes

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Process health; `/health` is also available |
| GET | `/api/regions` | Historical candidate polygons; optional `active` filter |
| GET | `/api/sites` | Documented site GeoJSON |
| GET | `/api/coverage` | Prepared-product catalog; currently `{origin:"engine",products:[]}` |
| POST | `/api/terrain-analyses` | Submit terrain analysis; HTTP 202 job receipt |
| GET | `/api/terrain-analyses/{jobId}` | Poll terrain job |
| DELETE | `/api/terrain-analyses/{jobId}` | Release a consumer; cancel when no consumers remain |
| POST | `/api/scenario-evaluations` | Submit scenario based on a completed terrain result; HTTP 202 |
| GET | `/api/scenario-evaluations/{jobId}` | Poll scenario job |
| DELETE | `/api/scenario-evaluations/{jobId}` | Release a consumer; cancel when no consumers remain |
| GET | `/api/terrain-preview/{region}.png` | Retired preview; returns 410 |
| GET | `/api/docs`, `/api/openapi.json` | Interactive documentation / schema |

There are no standalone `/api/globe-state`, `/api/visualization-config`, `/api/map-tiles`, `/api/eclipse-searches`, `/api/system-ephemerides` or `/api/ranking` routes. Eclipse/orbit context can be included in scenario results. Catalog ranking and mission assessment are assembled by the frontend.

## Terrain request

```json
{
  "site": {"latDeg": -85.994785, "lonEastDeg": -0.235784},
  "observerHeightM": 2,
  "config": {"azimuthStepDeg": 0.5, "maxDistanceKm": 150},
  "includeLocalTerrain": true
}
```

Coordinates are planetocentric degrees; longitude is normalized to `[-180,180)`. Exact poles are rejected because local azimuth is undefined. Numeric values must be finite, heights nonnegative, and azimuth spacing must divide 360 into an integer number of samples. Unknown request fields are forbidden. Terrain providers apply additional limits and coverage checks; rejection at calculation time produces a failed job rather than synthetic terrain.

The polar HTTP provider uses native PGDA 20 m terrain within 5 km and 240 m terrain beyond it, for supported radii 1–300 km and azimuth steps at least 0.1°. Other latitudes use the global DEM provider. `includeLocalTerrain` optionally requests a 100 m circular slope/plane-residual fit; inadequate native resolution produces unknown metrics.

Terrain has no date input. Its result includes `id`, `origin`, `preview`, `profile`, and optionally `localTerrain`. Use **`result.id`**, not the job receipt ID, for the next request.

## Scenario request

```json
{
  "terrainAnalysisId": "<completed terrain result id>",
  "startUtc": "2026-12-01T00:00:00.000Z",
  "stopUtc": "2026-12-31T00:00:00.000Z",
  "stepMinutes": 30,
  "includeContext": false,
  "minSunFraction": 0.45
}
```

`startUtc` and `stopUtc` must be ISO UTC strings ending in `Z`, with stop later than start. `stepMinutes` is a positive integer. `includeContext` defaults to **true**; false omits the additional eclipse calendar/orbit context. `minSunFraction` is optional, finite and in `[0,1]`; it enables early solar screening and has a separate cache identity. It is supported by the server/ranking transport even though the ordinary `ScenarioEvaluationRequest` frontend interface does not declare it.

`horizonMode` optionally selects `terrain` (default) or `ideal`. Ideal mode replaces only the horizon elevation with zero degrees, preserving the observer location/height, ephemerides, finite-disc C3 threshold, Earth occultation and event refinement. It is an explicitly labelled teaching counterfactual, not a terrain assessment. Results include `horizonMode`; the measurement and job caches distinguish the two modes. No early sunlight screening is requested for educator comparisons, so unfavorable sites retain complete visibility evidence.

Educator comparisons support distinct UTC start dates per panel, with equal duration and shared sampling/settings. Playback aligns elapsed time for date experiments and UTC instants for same-period site/terrain experiments. The demo provider uses the same centre-visibility approximation for both horizon modes and labels its output as synthetic practice data.

The current HTTP implementation limits requested duration to 366 days and its internal ephemeris grid to 60,000 steps, using spacing no coarser than ten minutes. These are implementation limits, not scientific accuracy guarantees. Scenario visibility uses finite-disc C3 geometry; sampled event discovery can still miss brief events. A previous-period comparison uses `[T-D,T)`, not a calendar month.

A screened result has `skipped:true`, `reason:"sunlight_below_threshold"`, the requested range, threshold and `sunFractionUpperBound`. It is neither a complete Sun/Earth scenario nor a failed calculation. The first screening pass omits eclipses to form a sampled upper estimate; borderline candidates continue, followed by eclipse-aware screening. This bound applies to the sampled model, not to every possible unresolved event.

## Job lifecycle

```json
{"id":"<job id>","status":"running","progress":0.4,"message":"Computing"}
```

```json
{"id":"<job id>","status":"failed","error":{"code":"scenario_data_unavailable","message":"Source unavailable"}}
```

States are `queued`, `running`, `completed`, `failed`; `progress`, `message`, `result` and `error` are optional as appropriate. A completed receipt contains the result. A single scientific worker prioritizes queued interactive requests over background comparisons, preserving FIFO order within each priority. It admits background work below eight pending requests and interactive work below sixteen. An active calculation is not preempted. POST headers `X-Job-Priority: interactive|background` (default interactive) and `X-Job-Consumer` identify scheduling priority and a per-submission consumer token; neither participates in scientific cache identity. Identical pending requests share a job; an interactive consumer promotes queued shared work.

Receipts are stored under `backend/data/jobs/scientific/` and remain specific to request parameters and algorithm versions. Full physical scenario measurements are additionally cached under `cache/scenario-measurements/`, keyed by the physical terrain profile, period, sampling and algorithm version, independently of `minSunFraction` and `includeContext`. Cached measurements are screened without recalculation; orbital/eclipse context is cached separately and added only when requested. Early rejected screens remain partial receipts and never masquerade as complete measurements. Interrupted jobs become failed at restart; failed requests may be resubmitted. There is no automatic retention expiry.

Malformed input returns 422; an unknown job or an ID from the wrong job family returns 404; a full queue returns 429. Missing terrain results or unavailable source data produce failed scientific jobs. `preview:false` means the requested computation finished; `origin:"engine"` means backend output. Neither certifies scientific validity.

The frontend polls with delays increasing from 250 ms to at most 3 s, accepts already completed submissions, and uses `AbortSignal` to stop client waits. Client abort sends DELETE with the submission's `X-Job-Consumer` token, including when the abort happened before the POST receipt arrived. A queued job with no remaining consumers is cancelled immediately; running work stops at its next progress checkpoint, after any current external request or numerical stage returns. Shared work continues while another consumer remains. Legacy submissions without consumer tokens are retained. Cancellation uses terminal status `failed` with error code `cancelled`; cancelled requests can be resubmitted. There is no total polling timeout. HTTP errors and invalid/missing scientific measurements must remain explicit rather than falling back to demo values.

## Source-data service

These routes operate on saved acquisition/preparation data, independently of scenario jobs:

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/data/sources` | Configured profiles and source requests |
| POST | `/api/data/collect` | Collect selected configured sources, then prepare |
| POST | `/api/data/prepare` | Prepare existing downloads offline |
| GET | `/api/data/jobs/{job_id}` | Poll data-service job |
| GET | `/api/data/datasets` | List saved versions; optional source `name` |
| GET | `/api/data/datasets/{id}/raw` | Original response for an exact dataset |
| GET | `/api/data/sources/{name}/data` | Latest saved response, optionally selected by `request_sha256` |
| GET | `/api/data/datasets/{id}/samples` | Inclusive sample filtering by `start_ms` / `stop_ms` |
| GET | `/api/data/datasets/{id}/products` | Product filters: title, native resolution and limit |
| GET | `/api/data/datasets/{id}/regions` | Native candidate polygons and reference metadata |

Collection accepts `profile` (`default` or `trajectory`), optional nonempty `names`, and `refresh`. It does not accept arbitrary URLs. Exact dataset IDs come from `/datasets`, not job receipts. Missing records return 404, unavailable/unprepared data or ambiguous source shortcuts 409, and malformed parameters 422. Raw GETs never initiate downloads. Details are in the [backend guide](../backend/README.md).

## Frontend integration rules

The frontend starts site analysis after inputs settle for 350 ms on the site page. Terrain precedes the current scenario; the previous period loads without blocking the current result. The comparison screen maintains separate runs for up to four points. Catalog comparison evaluates site coordinates and polygon centers, not regional areas. Playback, camera movement, hover and CSV export use loaded data rather than submitting a job for each frame.

Results must remain associated with their complete input identity: coordinates, height, terrain parameters, epoch, duration and sampling. Changes invalidate dependent products; stale responses must not overwrite current requests. A scenario failure must not hide a valid terrain profile. Missing baselines and failed candidates remain separate from zero-valued results.

The CLI V1 JSON models are a **separate contract**, documented in the [engine guide](../backend/docs/engine-v1.md). HTTP sampling, terrain and event semantics must be validated independently; do not transfer the CLI report to this path.
