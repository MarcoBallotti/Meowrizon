# Moonrizon brainstorming and decision record

> Historical planning record, moved inside the backend at the user's request. Current runnable service instructions and backend-local data paths are in [../README.md](../README.md). References to frontend/repository files below are planning context, not runtime dependencies.

**Superseded scientific scope — decision of 2026-11-15.** The approved surface engine is
defined in [criteria](../../docs/criteri-algoritmo.md) and [implementation plan](../../docs/piano-logica.md).
They take precedence over this historical discussion, including earlier full-flight
requirements, vehicle profiles, hard slope filters, weighted rankings and body-centre
visibility. Those proposals are not active requirements or prerequisites for the engine.
The approved model takes a surface epoch T, uses JPL Horizons and numerical LOLA products
from Moon Trek/PDS/PGDA, and uses QuickMap only for manual comparison. Slope bands are
[0°,5°), [5°,10°), [10°,15°), ≥15°, with no automatic 10° rejection. Regional outputs
are geometric areas, cumulative slope areas, connected areas, time windows and quality,
without a global score. The engine and subsequent client integration remain unimplemented;
existing frontend descriptions below are an inventory of the older client, not its redesign.

Historical record dated 2026-11-14; precedence note added 2026-11-15.

This is the project's running record of ideas, requirements, recommendations and unresolved choices. Update it as the discussion develops; label proposals and verified results separately. A recommendation here is not automatically a team decision or an implemented feature.

Related documents: [README.md](README.md) describes the repository baseline; [data.md](data.md) records data examples/types; [pipeline.md](pipeline.md) describes the intended full-flight pipeline; [docs/guida-dati.md](docs/guida-dati.md) contains the surface-analysis research. This document preserves the broader discussion without replacing those details.

## Current implementation boundary

The user requires all implementation, configuration, saved data and working documents to stay inside `backend/`. Root README changes were reverted; generated planning documents moved into `backend/docs/`; raw and prepared files moved into `backend/data/`. The service runs from `backend/` with `python -m uvicorn app:app --port 8000` and needs no parent repository or frontend files.

FastAPI exposes `/api/data/sources`, collection/preparation jobs and job polling, dataset listing, time-series filtering, product filtering and native region data. Work is serialized by a local worker with persistent JSON jobs and file locks. No database is used. Scientific terrain, visibility and regional-comparison endpoints remain to be implemented; flight and global-ranking endpoints belong to the superseded proposal. The optional CLI is `python -m app` from this directory. Startup does not automatically download data.

Validation: 25 tests passed, live HTTP collection reused all 12 default source responses, filtering returned the requested seven hourly samples, and an isolated copy containing only `app/` and `config/` ran successfully without repository-root files. The following sections retain the prior brainstorming history.

## 1. Historical objective and requirements discussed on 2026-11-14

- Project: NASA Space Apps [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/?tab=resources).
- Build an interactive React web app that compares lunar landing locations and mission times, using the challenge's NASA/JPL/LROC resources.
- Explain why a location is suitable for a particular spacecraft/mission, considering terrain, sunlight, communication opportunities and the flight needed to reach it.
- Let the user select a **launch date and time**, calculate a mission and inspect spacecraft position at another selected time.
- The user explicitly selected **the full flight from launch-pad liftoff through ascent, transfer and lunar landing**. This extends the original surface-site analysis. An orbital replay or transfer-only calculation does not fulfill that complete requirement.
- Compare feasible trajectories for different sites, then compare the complete mission/site options. Launch, lunar arrival, touchdown and surface-operation times are distinct.
- Account for errors, unavailable information and possible interruptions in communications. Assumed onboard sensors/cameras are a proposed extension; no live spacecraft telemetry source has been connected.
- Prefer callable APIs and existing tools over implementing orbital mathematics from scratch.
- The team reported 24 hours remaining during planning. Prioritize a demonstrable, reproducible workflow; retain unfinished requirements explicitly.
- Detailed interface design comes later. No particular scoring weights, vehicle, launch pad or flight solver have been approved yet.

## 2. Current repository and missing prerequisites

Latest implementation decision (2026-11-14): the team explicitly chose **FastAPI and file storage, no database**, superseding the earlier Flask choice and the SQLite storage proposal. The standalone `python -m backend.app fetch` command saves original JSON/TIFF/XML/images with provenance under `data/raw/`. `prepare` builds JSON manifests and compressed Parquet tables under `data/prepared/`; `data-info` lists snapshots. The FastAPI shell exposes `/health` and documentation; scientific metrics and their subsequent client integration remain to be implemented. Ranking contracts were part of the superseded proposal. Identical successful downloads are reused; refresh preserves previous versions. There is a separate historical Blue Ghost configuration. See [backend/README.md](../README.md).

Acquisition run completed on 2026-11-14: 12 default responses plus one Blue Ghost response saved locally (4,144,471 response-body bytes total). The catalogs contain 396 south-pole and 1,256 global products; the dated region layer contains 13 polygons. Each Horizons example has 25 samples; the Blue Ghost example has three. Seven offline acquisition tests passed for raw-byte preservation, cache reuse/corruption, version preservation, provider-error handling, truncation and continued collection after a source failure. Checksums of all saved responses matched their metadata. This verifies ingestion, not numerical/scientific correctness or complete site coverage.

Original planning baseline, before the frontend merge and acquisition implementation: the frontend was a React/TypeScript/Vite scaffold, backend services were empty, and data directories contained placeholders. The current frontend context is recorded below.

### File storage and filtering — implemented, 2026-11-14

The current data-management layer uses:

- Original API responses and request/checksum metadata in `data/raw/`, retained for reproducibility.
- A small `data/prepared/catalog.json` manifest for provenance, source versions, statuses and prepared-file checksums.
- Zstandard-compressed Parquet files for 1,652 product records, 13 candidate-region polygons, 75 Horizons samples and three historical spacecraft samples. PyArrow filters time ranges and product properties without parsing upstream text again.
- JSON series/raster metadata, with native coordinates, source headers, units, missing-data semantics and parameters retained. One 20 × 20 terrain GeoTIFF remains in raw storage; Rasterio reads masked native windows without smoothing/resampling.
- File locking for a single preparation writer and atomic manifest publication. Unchanged files are reused, corrupt prepared files rebuilt, and failed snapshots excluded. Different sites/date requests cannot be selected interchangeably merely because they share a download name.

Preparation runs offline. The 13 existing responses were imported successfully; repeating preparation reused all 13. Prepared files total approximately 450 KiB for these examples, additional to the original downloads. This is storage/parsing verification, not a scientific validation or complete regional dataset. The implementation is tested for time/unit handling, raw/prepared corruption, failed imports, writer locking, parameter separation, masked raster reads and FastAPI startup.

**Historical request pipeline, superseded for the general engine:** React parameters → FastAPI input/coverage validation → resolve exact source versions → reuse/calculate terrain and visibility products → apply mission requirements → rank qualifying candidates → return compact results, explanations and provenance. This earlier processing/ranking API was not implemented by the storage work; current surface metrics follow the canonical criteria.

Cache terrain by source hashes, precise site/height, search radius, sampling, reference frame/datum and algorithm version. Cache scenarios separately by terrain result ID, time bounds, ephemeris versions and calculation settings. Persist derived products in files with manifests, not a database. Keep outputs separate from original measurements so algorithms can be changed and rerun.

That historical ranking proposal first rejected known violations and then combined normalized desirability metrics with configurable weights. Its mission-specific limits and scoring choices are not requirements of the approved general engine, and none are hardcoded into this storage layer. No AI training or Kalman filter is required for source preparation. Raster smoothing could remove hazards and must not be an automatic cleaning step.

### Current frontend context — source review, 2026-11-14

Reviewed the current code under `frontend/src/`, its provider/types/store/runner, the screens and visualization components, and [docs/api-contract.md](docs/api-contract.md). This was source inspection; the UI was not launched or runtime-tested during this context update.

**Product flow:** select a lunar point and a UTC surface-analysis start time, move the camera to that site, explore its horizon and Sun/Earth visibility over a chosen period, then compare scenarios. The date currently means the start of surface evaluation. The “Fly down to the surface” action calls a Cesium camera transition and navigates to the site screen; it does not propagate a spacecraft or calculate touchdown. The earlier full liftoff-to-landing requirement remains outstanding.

| Area | Current code and behavior |
|---|---|
| Navigation | [App.tsx](frontend/src/App.tsx): hash-routed `moon`, `site` and `kit` screens. The kit screen presents the visual component/brand system. |
| Moon screen | [MoonScreen.tsx](frontend/src/screens/MoonScreen.tsx): example-site buttons, globe point selection, planner coordinate editor, UTC start, duration, sampling step and observer height. |
| Site screen | [SiteScreen.tsx](frontend/src/screens/SiteScreen.tsx): local horizon view, playback timeline and report, with progress/error states. |
| Audiences | `student`, `teacher`, `planner` change wording and controls; the chosen audience persists in local storage. Planner exposes numerical details and A/B comparison. |
| Reports | Current angles and horizon margins, time to visibility transitions, visible fractions, longest darkness/outage and joint windows. A/B interval statistics and CSV interval export are already implemented in the client. |
| Demo data | [demoProvider.ts](frontend/src/api/demoProvider.ts): synthetic terrain horizon and approximate analytic Sun/Earth motion. Results carry `origin: demo`; these are not NASA-derived scientific results. |
| Real-data client | [httpProvider.ts](frontend/src/api/httpProvider.ts) and [types.ts](frontend/src/api/types.ts) already describe proposed processed-data requests/results. Their existence does not implement the backend or finalize the user's deferred backend contract. |

Defaults in [store.ts](frontend/src/state/store.ts): 30 days, 30-minute time sampling, observer 2 m above terrain, horizon azimuth step 0.5°, maximum terrain-search distance 150 km. Planner controls offer durations of 7/14/30/60/90 days and time steps of 10/30/60/120 minutes. Example sites are six hardcoded approximate locations, not loaded from our downloaded Artemis polygons. A defaults to Shackleton and B to Malapert.

**Current request flow:** load coverage; after inputs settle for 350 ms, submit terrain analysis; wait for its result; submit a scenario evaluation referencing the terrain-analysis ID; wait for the tracks and visibility intervals. `JobState` uses `queued/running/completed/failed`; polling starts at 250 ms and grows to 3 seconds. Changed scenarios abort client requests/polling. This does not automatically cancel a server calculation. A cached POST may immediately return a completed job.

The existing client proposes these routes (still unimplemented in our acquisition backend):

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/coverage` | Prepared DEM products, declared coverage/resolution and availability. |
| POST | `/api/terrain-analyses` | Site, height above terrain, angular step and search radius → terrain-analysis job. |
| GET | `/api/terrain-analyses/{id}` | Terrain job status/result. |
| POST | `/api/scenario-evaluations` | Terrain ID, UTC start/stop and time step → evaluation job. |
| GET | `/api/scenario-evaluations/{id}` | Evaluation job status/result. |

Terrain results need a sampled horizon profile, ground/observer height, lunar reference radius, DEM product identifiers, effective resolution, missing-data fraction, parameters, algorithm version and warnings. Scenario results need matching timestamp/angle arrays for Sun and Earth, the horizon at each body azimuth, visibility flags, refined visibility intervals for Sun/Earth/both, and ephemeris provenance/approximations.

Client conventions: angles in degrees; azimuth north through east; east longitude normalized to [-180, 180); heights in metres unless explicitly named otherwise; UTC ISO strings in requests and Unix milliseconds in sampled data; camelCase fields; `origin: demo | engine`. Current visibility is explicitly **body-center**. Changing to partial-disc lighting requires an agreed contract/UI change. Intervals are sorted and interpreted as `[startMs, endMs)`; statistics assume intervals are within the evaluation window. The horizon renderer assumes uniform angular samples over 360° starting at zero, beyond the type comment's simpler “strictly increasing” condition.

Playback consumes downloaded evaluation arrays and intervals locally. It interpolates angles for display and reads visibility from supplied intervals; moving the time cursor does not trigger backend requests. The client calculates report summaries from those intervals. Backend terrain caching must remain independent of date: the runner resubmits terrain even when only the analysis period changes.

**Rendering limits:** [MoonGlobe.tsx](frontend/src/features/MoonGlobe.tsx) uses a smooth lunar sphere with real Moon Trek WAC imagery and LOLA hillshade. It has no DEM terrain geometry. Globe illumination uses an approximate Sun direction, including when the scientific provider is switched to API mode. Coverage rings are hardcoded latitude bands. [HorizonScene.tsx](frontend/src/features/HorizonScene.tsx) draws the supplied horizon with decorative foreground hills; it is not a reconstructed terrain mesh. Visual detail does not establish numerical accuracy.

**Connection settings:** default `VITE_DATA_SOURCE=demo`; `api` selects the HTTP provider. Base URL defaults to `/api`. Vite proxies it to `MEOWRIZON_API_ORIGIN`, default `http://localhost:8000`; the FastAPI HTTP server should use the matching port or change that proxy. Switching modes alone will not connect our raw-file collector to these views.

**Backend implications:** keep raw acquisition independent as requested. A later processing layer must read our saved terrain/ephemerides, prepare real product availability, compute the horizon and time-dependent visibility, and map results to an agreed client contract. Our current 100 m terrain tile and one-day ephemeris samples do not cover the client's default site, 150 km horizon radius or 30-day period. The demo product catalog contains different product IDs/coverage claims from our Moon Trek samples; map real source metadata rather than copying demo availability. Region ranking, vehicle constraints, mission trajectory state and optimal-site selection have no implemented client contract yet.

Documentation caveat: the frontend README still lists an older `components/` layout; the inspected code uses `screens/`, `features/` and `ui/`. Its “no backend” statement now means no connected analysis engine: FastAPI scaffolding and offline data acquisition/preparation exist.

The README reports an external Python prototype tested on nine sites for 2027–2028. Its code is outside this checkout, so its results and accuracy claims have not been independently reproduced here. Finding and importing that work may save more time than developing it again.

Missing prerequisites for a new full-flight calculation:

- One documented launch pad and rocket/lander profile: masses, stages, thrust, specific impulse, propellant reserves, aerodynamics and engine limits.
- A mission architecture, guidance/targeting rules, atmosphere and gravity models, and touchdown constraints.
- Compatible reference frames, body orientation and time conversions.
- A configured propagation/optimization engine, plus reference cases demonstrating each modeled phase.
- Terrain coverage around the candidate sites and an explicit mission-duration/energy/communications requirement.

A launch timestamp alone cannot determine a unique spacecraft trajectory. Presets can make these engineering choices simple for the user, but the choices must exist in the backend.

## 3. Historical proposal for “best landing site” — superseded for the general engine

Evaluate **site + touchdown time + vehicle + mission requirements**, rather than assigning each location one permanent score.

First apply hard constraints. For example: the modeled vehicle can reach and land there with its required propellant reserve; terrain slope is within its limits; required light/communications conditions are met; and the relevant data actually cover the site. Return `unknown` separately from `infeasible` when calculations or data are missing.

Then compare feasible options using visible metrics:

| Criterion | Possible metric | Important qualification |
|---|---|---|
| Flight cost | Propellant used/remaining, maneuver delta-v | Delta-v is a useful design metric; fuel also depends on masses and propulsion. |
| Flight duration | Launch-to-touchdown time | Include parking, capture and descent phases that the chosen architecture requires. |
| Terrain | Slope at a declared scale, roughness, hazards and landing-footprint coverage | A coarse DEM cannot certify small boulders or every point inside a landing ellipse. |
| Sunlight and energy | Sunlit hours, longest darkness, solar elevation, time until sunset | Energy requires a panel/battery/load model; sunlight fraction alone is not electrical power. |
| Communications | Direct-to-Earth visibility fraction and longest outage | Earth-center visibility is a geometric proxy; it does not establish a radio link budget or DSN availability. |
| Surface mission | Conditions throughout the requested stay | A favorable instant at touchdown may be followed by a long outage. |
| Robustness | Constraint margins and ranking stability under input variation | Do not invent confidence probabilities without an uncertainty model. |
| Science preference | Proximity to an explicitly sourced science target | Optional and mission-specific; a shadowed area might be a science target rather than a universal exclusion. |

Proposed ranking: normalize each metric using fixed, documented bounds, then combine utilities with configurable weights. Keep hard constraints outside the weighted score so a good fuel score cannot compensate for an unacceptable modeled landing. Show the component scores and trade-offs; optionally expose a Pareto set of options that improve different objectives. Weights and thresholds remain open decisions.

Search a small region or candidate shortlist first. Apply inexpensive terrain/surface-window checks, solve plausible flight options, then evaluate conditions at the actual computed touchdown time. Refine promising areas instead of running an expensive optimizer on every DEM pixel. Describe the result as the best option found within the declared model and search, unless global optimality is actually established.

The Moon has no Earth-like atmospheric weather. Relevant lunar conditions include illumination, shadows, thermal environment and space weather. Earth launch weather is a separate input. Temperature cannot be inferred accurately from a day/night flag alone. See [NASA's lunar weather explanation](https://science.nasa.gov/moon/weather-on-the-moon/).

## 4. Sources and the data we expect

| Source | Useful data | Role and limits |
|---|---|---|
| [Moon Trek](https://trek.nasa.gov/moon/) | Product catalog, candidate-region polygons, numeric elevation rasters, imagery and other layers | Use numeric raster values for analysis; rendered map tiles are visual context. |
| [LROC QuickMap](https://quickmap.lroc.im-ldi.com/) | Imagery, topography and illumination/visibility exploration | Useful for investigating sites and comparing geometry. A map URL is not automatically a documented numerical API. |
| [PDS LOLA archive](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/) | Elevation grids and labels describing projection, scale and storage | Decode the label and preserve resolution, coverage and missing-data masks. |
| [JPL Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) | Body/available spacecraft states; observer angles | Callable API; requires selecting an available object and supported interval. |
| [WebGeocalc](https://naif.jpl.nasa.gov/naif/webgeocalc.html) | Remote SPICE calculations from server-held kernels | Callable API, including verified access to CLPS spacecraft states; detailed example below. |
| [CLPS SPICE archive](https://naif.jpl.nasa.gov/pub/naif/pds/pds4/clps/clps_spice/) | Archived cruise/descent trajectories, orientation and supporting geometry | Local offline alternative to remote state queries. Check individual kernel coverage and gaps. |
| Vehicle documents and mission reports | Propulsion, mass, flight events and engineering assumptions | Still needed for designing new flights; maps and ephemerides do not supply a complete vehicle model. |

Earlier data checks are recorded in [data.md](data.md): Moon Trek exposes the `A3_Named_regions_SP` layer with 13 candidate-region polygons from **2022**. This is evidence that candidate regions can come from the supplied services. It is not evidence that the layer is the current shortlist or that every polygon is landable. Coordinates are projected lunar metres, not longitude/latitude.

The inspected elevation service supplied floating-point metre values; PDS products can instead store scaled integers. Keep source-specific decoding explicit. A surface polygon, a height raster, a rendered image and a spacecraft state vector are different data types.

The [JPL planetary-orbits page](https://ssd.jpl.nasa.gov/planets/orbits.html) points toward ephemeris resources. A planetary orbit is not a newly designed spacecraft route to a lunar landing site.

### Reading the API data in `docs/guida-dati.md`

The guide's queries primarily support surface conditions. They provide inputs for the planned terrain horizons, visibility windows and regional comparisons by explicit metrics; those scientific calculations remain to be implemented.

| Input | Actual format/type | Interpretation |
|---|---|---|
| Horizons observer table | JSON envelope containing a text/CSV time series | Timestamp, azimuth/elevation in degrees, distance in AU and radial velocity in km/s for the Sun or Earth viewed from the chosen lunar point. |
| Moon Trek catalog | JSON metadata; product identifiers/titles, resolution, service types and projection | Describes which datasets/services exist; a catalog entry is not the raster itself. |
| Moon Trek DEM export | Georeferenced raster; the checked service has one float32 band at 5 m native pixel spacing | Each valid cell stores height in metres relative to the product's lunar reference sphere. |
| Moon Trek point identify | JSON; the numeric value can be encoded as a string | The live lookup at projected `x=0, y=0` returned `"value": "1289"`; convert explicitly after checking for missing data/errors. |
| Moon Trek WMTS | PNG/JPEG tiles plus an XML capabilities document | Imagery for the scene; image colors are not numerical elevations. |
| Other mapped products | Product-dependent rasters/features | Slope, average illumination/Earth visibility and permanent-shadow products need their own units, coverage and observation-period checks. |

Follow-up checks on 2026-11-14 confirmed the catalog reported 396 south-pole products and returned `A3_Named_regions_SP` as the first entry. Its `resolution` was `0.0`, consistent with an entry that is not a pixel-size declaration for an elevation raster; do not treat it as infinitely precise data. The DEM metadata reported `F32`, one band, 5 m spacing, and export limits of 15000 by 4100 pixels. Only metadata and one point were fetched in this follow-up, not a terrain raster.

Example from the guide: at longitude 0°, latitude -89.45°, reference-sphere altitude 0 km, the Sun on 2026-12-01 00:00 UT has azimuth 280.049441° and elevation 1.566177°. This tells us its direction above the smooth local horizon. If a **hypothetical** ridge reaches 3° at that azimuth, the Sun is hidden behind terrain. The API's geometric daylight flag is not a terrain-shadow result. A real surface observer's query height must account for the site's elevation plus panel/antenna height.

Planned outputs include slope/horizon profiles, visible-disc fractions, complete-darkness and sub-threshold intervals, Earth-visibility intervals, joint geometric windows and regional area comparisons. Mission-specific rankings belong to the superseded proposal. Actual electrical power additionally requires panel/load assumptions; a working radio link additionally requires station/relay geometry and communications constraints. Preserve coverage/NoData and available quality information. Matching a broad frame name does not by itself establish precise alignment of every DEM and ephemeris realization.

QuickMap is used in the guide for visual exploration/comparison, not as an already integrated numerical API. The guide's observer queries do not return spacecraft flight paths; use the separate trajectory requests in section 5 when that is the desired data.

## 5. Callable trajectory APIs: verified shortcut

### 5.1 WebGeocalc: actual Blue Ghost states without local SPICE setup

**Live verification on 2026-11-14:** the WebGeocalc REST API listed a CLPS kernel set, listed Blue Ghost's spacecraft ID `-2711`, accepted a state-vector request, and returned three numerical samples. No local kernels or orbit integration were needed for this probe.

Official [API documentation](https://wgc2.jpl.nasa.gov:8443/webgeocalc/documents/api-info.html); [NASA description of the service](https://naif.jpl.nasa.gov/naif/webgeocalc.html).

Base URL:

```text
https://wgc2.jpl.nasa.gov:8443/webgeocalc/api
```

Discovery calls:

```sh
curl --fail-with-body --silent --show-error \
  'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api/kernel-sets'
```

Find the item with `missionId: "clps"`. Its `kernelSetId` was `"9"` during the check; discover it at runtime instead of assuming the ID is permanent. With the verified ID, the bodies endpoint was:

```text
GET https://wgc2.jpl.nasa.gov:8443/webgeocalc/api/kernel-set/9/bodies
```

Relevant returned spacecraft IDs were `-2711` (`CLPS_TO19D`, Blue Ghost), `-370011` (`CLPS_TO2IM`, IM-1) and `-370021` (`CLPS_PRIME1`, IM-2). Do not confuse spacecraft IDs with the distinct fixed landing-site IDs. Only Blue Ghost state evaluation was exercised in this task.

Submit the following tested request, replacing the kernel-set ID if discovery returns a different value:

```sh
curl --fail-with-body --silent --show-error \
  'https://wgc2.jpl.nasa.gov:8443/webgeocalc/api/calculation/new' \
  -H 'Content-Type: application/json' \
  --data-binary @- <<'JSON'
{
  "kernels": [{"type": "KERNEL_SET", "id": 9}],
  "timeSystem": "UTC",
  "timeFormat": "CALENDAR",
  "times": [
    "2025-02-01T00:00:00",
    "2025-02-01T01:00:00",
    "2025-02-01T02:00:00"
  ],
  "timeStep": 1,
  "timeStepUnits": "HOURS",
  "calculationType": "STATE_VECTOR",
  "targetType": "OBJECT",
  "target": "-2711",
  "observerType": "OBJECT",
  "observer": "MOON",
  "referenceFrame": "J2000",
  "aberrationCorrection": "NONE",
  "stateRepresentation": "RECTANGULAR"
}
JSON
```

The response contains `calculationId` and `result.phase`. Read status from `GET /calculation/{calculationId}`. Once `COMPLETE`, retrieve `GET /calculation/{calculationId}/results`. Bound polling/retries and handle failed, cancelled and expired jobs. The tested calculation completed immediately and reported a 600-second expiry; keep your own result cache rather than treating a provider job ID as persistent storage.

Results contain `columns` and `rows`. Map columns by their `outputID` and units instead of assuming fixed array positions. The first sample, normalized into our proposed response format and rounded here, was:

```json
{
  "time_utc": "2025-02-01T00:00:00Z",
  "target_id": -2711,
  "origin": "MOON",
  "frame": "J2000",
  "position_km": [-345292.83486871, 80516.69409723, 41587.02991141],
  "velocity_km_s": [3.23799222, 4.82761539, 3.81525005],
  "source": "JPL WebGeocalc / CLPS kernel set",
  "mode": "archived_trajectory"
}
```

This is Blue Ghost's state relative to the Moon at a historical epoch; it is not latitude/longitude or an invented flight for the selected date. Three hourly samples verify access, not adequate full-flight animation resolution. Request suitable samples within coverage, especially near maneuvers/descent, and validate interpolation without bridging gaps or event discontinuities.

### 5.2 Horizons: body positions and supported spacecraft through HTTP GET

**Live verification:** a query for LRO (`-85`) relative to the Moon returned three position/velocity samples for 2025-02-01 00:00–02:00 UT. A separate Moon (`301`) relative to Earth query worked for 2026-12-01. No API key was required for these probes.

Callable LRO example:

```sh
curl --fail-with-body --silent --show-error --get \
  'https://ssd.jpl.nasa.gov/api/horizons.api' \
  --data-urlencode 'format=json' \
  --data-urlencode "COMMAND='-85'" \
  --data-urlencode "CENTER='500@301'" \
  --data-urlencode "MAKE_EPHEM='YES'" \
  --data-urlencode "OBJ_DATA='YES'" \
  --data-urlencode "EPHEM_TYPE='VECTORS'" \
  --data-urlencode "START_TIME='2025-02-01 00:00'" \
  --data-urlencode "STOP_TIME='2025-02-01 02:00'" \
  --data-urlencode "STEP_SIZE='1 h'" \
  --data-urlencode "REF_SYSTEM='ICRF'" \
  --data-urlencode "REF_PLANE='FRAME'" \
  --data-urlencode "VEC_CORR='NONE'" \
  --data-urlencode "VEC_TABLE='2'" \
  --data-urlencode "OUT_UNITS='KM-S'" \
  --data-urlencode "TIME_TYPE='UT'" \
  --data-urlencode "CSV_FORMAT='YES'"
```

LRO is an orbiter, so this example does not demonstrate a lunar landing. For the verified Moon-relative-to-Earth query, change `COMMAND` to `'301'`, `CENTER` to `'500@399'`, and the interval to 2026-12-01 00:00–02:00. That returns the Moon's motion, not a spacecraft flight.

The JSON response's `result` is a string containing metadata and a table between `$$SOE` and `$$EOE`. Parse the table and preserve frame, origin, units, time scale and source. The live response reported API version `1.2` while the documentation advertises `1.3`; validate the returned schema instead of assuming a match.

A lookup for Blue Ghost's SPICE ID `-2711` returned HTTP 200 with an error and no ephemeris. An ID existing in a SPICE archive does not establish availability in Horizons. WebGeocalc successfully handled this spacecraft in the separate probe.

Use Horizons for Earth/Moon/Sun states, supported spacecraft replay and reference comparisons. Its spacecraft records can contain reconstructed and predicted intervals and are not live telemetry. See the [spacecraft coverage explanation](https://ssd.jpl.nasa.gov/horizons/manual.html#spacecraft-trajectories-in-horizons).

### 5.3 Other shortcuts investigated

| Tool/service | Useful shortcut | Scope limit / verification status |
|---|---|---|
| [JPL periodic-orbits API](https://ssd-api.jpl.nasa.gov/doc/periodic_orbits.html) | Retrieve Earth–Moon orbit-family initial states and periods | Uses a simplified rotating three-body model with normalized units. Not a launch-date-specific flight or landing. Documentation reviewed; no live query made here. |
| [NASA GMAT lunar-transfer example](https://github.com/nasa/GMAT/blob/main/application/samples/Ex_LunarTransfer.script) | Reuse an existing propagator and transfer-targeting scenario | Local software, not a hosted REST endpoint. The example starts in space, targets lunar arrival/orbit insertion, and omits pad ascent and powered landing. Not run here. |
| [NASA Ames Lunar Browser](https://www.nasa.gov/ames-engineering/spaceflight-division/flight-dynamics/) | Existing work on databases of lunar transfer solutions | Relevant design precedent. A publicly callable endpoint usable by this project was not verified. |
| [JPL small-body mission design API](https://ssd-api.jpl.nasa.gov/doc/mdesign.html) | Precomputed/design options for small bodies | Targets asteroids/comets; do not present it as an Earth-to-lunar-surface planner. |

Example catalog URL, documentation-only check:

```text
https://ssd-api.jpl.nasa.gov/periodic_orbits.api?sys=earth-moon&family=halo&libr=1&branch=N
```

No public API was verified in this research that accepts arbitrary launch time, launch pad, rocket and lunar landing coordinates and returns an optimized complete liftoff-to-touchdown flight. This is a limit of the verified options, not a claim that no commercial or restricted service exists.

### 5.4 Recommended integration and new-mission boundary

Use `React -> our FastAPI backend -> provider/cache`. WebGeocalc documents the need for a server-side proxy for web applications. JPL SSD requires serialized requests, caching, bounded backoff and an application User-Agent with real product/version/contact details for automated use. Configure the team contact before automation. These documentation probes do not configure a production client. See [WebGeocalc integration guidance](https://wgc2.jpl.nasa.gov:8443/webgeocalc/documents/api-info.html#HTTPS_Reverse_Proxy) and [SSD fair-use policy](https://ssd-api.jpl.nasa.gov/).

Suggested capabilities, still to implement:

- **Historical/reference mode:** request and cache an existing mission's trajectory, expose valid dates, and play it back. WebGeocalc is now a verified route for Blue Ghost.
- **Site-analysis mode:** evaluate hypothetical touchdown dates using terrain and ephemerides, with no claim that a flight has been solved.
- **New-mission mode:** call a configured existing dynamics/targeting engine through our backend. Reuse a documented scenario, then compute for the changed date, target and vehicle. This avoids writing numerical methods from scratch, but still requires mission modeling and validation.

Historical states cannot simply be shifted in time to make a physically valid new launch: the Earth–Moon geometry and maneuver conditions change. A transfer initializer such as a Lambert/patched-conic solution can help a solver; it does not supply ascent, capture and powered landing automatically.

Batch and cache state samples rather than requesting a provider calculation on every animation frame. Local SPICE with cached kernels is a later offline/performance option. API access saves integration effort; network queries are not inherently faster than local ephemeris evaluation. Benchmark before promising response times.

## 6. Proposed project pipeline and app behavior

1. Select launch UTC, pad, vehicle/lander preset, candidate regions, surface duration and mission priorities. Clearly label historical replay versus a newly calculated flight.
2. Check that inputs and sources cover the scenario; report missing profile values and unsupported dates explicitly.
3. Retrieve/cache region geometry, terrain, Sun/Earth/Moon states and available reference trajectories.
4. Build slope/quality masks and local terrain horizons. Evaluate coarse landing windows and shortlist promising areas.
5. For a new mission, solve ascent, staging, Earth orbit, departure, transfer, lunar capture and descent under the selected architecture. Search feasible arrival/touchdown options per site; preserve phase events.
6. Evaluate terrain, illumination and communications at the calculated touchdown location and over the surface stay. Refine targeting/windows as needed.
7. Apply feasibility constraints, rank the remaining alternatives and expose metrics, assumptions, data coverage and sensitivity.
8. Store the scenario, trajectory, events and provenance. Let the user inspect a selected time, compare sites and change assumptions.

Proposed UI modules: mission controls, Earth–Moon flight view, lunar terrain/site view, timeline, comparison panel, explanatory results and optional assistant. A global Moon model is visual context; local terrain meshes should come from the DEM. Keep position/origin/frame transformations explicit before rendering states in Cesium.

Proposed backend modules: source adapters, ephemerides/frames, terrain, mission propagation/targeting, scoring/uncertainty, cache/jobs and scenario storage. [pipeline.md](pipeline.md) has the detailed proposed endpoint contracts. These are planned endpoints, not running services.

## 7. Data validation, filtering and geometry verification

NASA provenance supports trust in the source. Validation checks that **our use of the source is correct**: the right object/date, units, coordinate frame, projection, vertical reference, resolution and coverage; valid numeric values; and absence of provider errors. HTTP 200 alone does not establish success, as the Blue Ghost Horizons probe demonstrated.

Do not indiscriminately smooth elevation data. Smoothing can remove actual obstacles, lower apparent slopes and change shadow horizons. Preserve missing-data masks and uncertainty; inspect product quality and measurement scale before resampling or combining sources. A gap is not a zero-height or hazard-free region.

Proposed geometry checks:

- Compare local Sun/Earth angles against matched Horizons queries using the same point, height, time and conventions.
- Use synthetic flat terrain and a known ridge: the calculated horizon should follow the expected geometry, including curvature when modeled.
- Check coordinate round trips and known landmarks to detect flipped axes, incorrect longitude signs and metre/kilometre mistakes.
- Refine terrain/time/azimuth sampling until relevant event times and scores stabilize to an agreed tolerance.
- Compare matched flight scenarios against an independent implementation or reference. Different guidance/force models should not be expected to produce identical paths.
- Verify state lookup around phase events, gaps, coverage boundaries and touchdown.

README claims about compact global ephemeris tables and their angle accuracy need reproduction before adoption. A coarse terrain horizon or visual agreement alone does not validate the whole flight or establish a landing safety guarantee.

## 8. Errors, uncertainty, outages and sensor ideas

Separate three problems:

1. **Data/service failures:** timeout, unavailable endpoint, malformed result, missing terrain or trajectory gaps. Use bounded retries, cache/provenance and explicit unavailable status. Do not silently substitute another date or interpolate across unverified gaps.
2. **Uncertain mission inputs:** launch timing, propulsion, mass, navigation state and terrain errors. Start with sensitivity/range scenarios; use Monte Carlo only when justified distributions or bounds are available. Report effects on touchdown, reserves and surface windows.
3. **Navigation from sensors:** a possible future simulation of IMU/camera/range measurements and intermittent communications. Define sensor cadence, noise/bias and measurement models first.

A Kalman-family filter can estimate flight state and uncertainty by combining a dynamics model with noisy measurements. It does not improve a terrain map merely because it came from several APIs, and it does not choose the optimal landing site. During a missing measurement interval, propagate the estimate and uncertainty; apply updates when valid measurements return. Distinguish loss of ground communications from loss of onboard sensing. Do not imply that the current map/ephemeris APIs provide these sensor streams.

For the hackathon, a clearly labeled simulated outage plus uncertainty/sensitivity display is an optional demonstration. It is additional work, not a dependency for a basic site-comparison app.

## 9. AI and model training

The user considered a local model that takes mission inputs and outputs the best site, plus smaller models for trajectory prediction or data cleanup.

Current recommendation: **do not make model training a dependency of the 24-hour build**. The available maps and ephemerides are inputs, not a labeled dataset of optimal feasible missions. Training on a hand-written score mostly reproduces that score and does not independently validate the physics.

Useful optional AI role: a pretrained assistant turns natural language into explicit scenario fields, calls backend tools, and explains returned comparisons with source/assumption links. Candidate tools are `list_sites`, `site_summary`, `conditions_at`, `find_windows`, `compare_sites`, `plan_mission` and `mission_state_at`. Tool availability must match implemented functionality; the assistant must not invent successful trajectories or missing vehicle parameters.

Later ML possibilities: a surrogate to screen expensive solver cases, a learned initial guess for optimization, or hazard detection from appropriately labeled imagery. These require training data, held-out evaluation and checks on the final physical/terrain constraints. A surrogate is useful after an expensive trustworthy reference model exists; training it does not remove that prerequisite.

## 10. Jira work breakdown discussed

The screenshot showed the following tickets. Suggested revisions below are planning notes only; no Jira issue was edited.

| Existing ticket | Suggested deliverable |
|---|---|
| KAN-1 Moon 3D Model | Correct lunar scene/frame and DEM-derived local terrain; demonstrate known coordinates before visual polish. |
| KAN-2 API & Data Analysis | Tested provider adapters, normalized data contracts, source manifest, coverage/error handling and cached reference responses. |
| KAN-4 Web App Development | Connect mission inputs, job status, timeline/state lookup and site comparison to backend contracts. |
| KAN-5 Local Model AI Tool | Optional tool-calling/explanation assistant; remove model training from the critical path unless a specific justified dataset/task is selected. |
| KAN-6 Graphic Interface | Later wireframes, comparison readability and visible distinction between replay, analysis and simulation. |
| KAN-7 Data Manipulation & Optimization | Numeric DEM processing, slope/horizon products, cache strategy and measured performance. |
| KAN-8 NASA Tools & Website Analysis | Source inventory, API capability/coverage checks and reference comparisons; feed findings into KAN-2. |

Additional tickets needed: vehicle/mission profile; trajectory API integration; new-flight solver/phase integration; scoring and constraints; geometry/frame verification; failures/uncertainty; and reproducible demo/deployment. Each should have a small verifiable acceptance case instead of a broad label such as “AI model.”

## 11. Suggested build order for the remaining time

This is a prioritization proposal, not an agreed reduction of the full-flight requirement.

1. Recover the external surface-analysis prototype and choose one region, one historical flight and one documented vehicle scenario.
2. Integrate the verified WebGeocalc Blue Ghost request and Horizons body queries into a cached backend adapter; serve typed states to the timeline.
3. Complete one terrain-aware site comparison at an explicit touchdown time and surface duration, with visible metrics and provenance.
4. Evaluate one existing mission-solver example. Record which requested phases it actually models; preserve missing ascent/descent/optimization work as open tasks.
5. Connect results to the React map, trajectory view and comparison controls; test provider failure and unsupported dates.
6. Add optional explanations/uncertainty demonstrations only after the primary flow works. Keep a cached scenario available for the presentation.

Replaying a real flight plus computing surface conditions can produce a useful demonstrator quickly. It must not be presented as an arbitrary launch-date optimizer. A complete new-flight feature remains unfinished until the required phases and selected-time states work together.

## 12. Historical open decisions and verification record

Open decisions in the earlier full-flight proposal: actual vehicle/pad/mission architecture; flight solver; region and DEM coverage; observer/panel/antenna height; slope and other vehicle limits; landing-footprint size; surface duration and power/communications requirements; score weights/normalization; uncertainty ranges; sampling/error budgets; and which optional AI/sensor demonstrations fit the remaining time. Vehicle choices and score weights are not unresolved requirements of the general surface engine approved on 2026-11-15; its remaining numerical validation work is recorded in the canonical plan.

Verification in this update:

- Inspected repository structure, README and relevant planning/data documentation.
- WebGeocalc kernel discovery and CLPS body discovery returned HTTP 200 with successful payloads.
- WebGeocalc Blue Ghost state calculation completed and returned three finite position/velocity samples at the requested historical times.
- Horizons LRO and Moon vector requests returned tables with the expected targets, origins, frames, units and three samples each.
- Horizons Blue Ghost lookup returned a provider error despite HTTP 200; recorded rather than treated as a usable source.
- No local flight solver was installed/run, no full mission was optimized, and no application endpoint was implemented by this documentation task. API probes establish access and output format, not independent numerical validation of archived trajectories.
