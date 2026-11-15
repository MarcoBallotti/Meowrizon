# Scientific schema proposal

Status: **proposal for review**, based on contract revision 3 and the approved
`docs/criteri-algoritmo.md`. These are not implemented result types or new public
routes. The implemented transport remains the existing frontend's terrain/scenario
POST and GET routes. It currently returns explicit failed jobs because the engines
are unavailable. The archived v2 schema is not the implementation target.

## Common types and missing data (U02, U05, U07)

Proposed JSON shapes are written as TypeScript for clarity. JSON has no `undefined`,
NaN or Infinity. All times are exact Unix UTC milliseconds; request timestamps use
ISO 8601 UTC strings ending in Z. Distances ending in M are metres, Km kilometres,
areas Km2 square kilometres, and angles Deg degrees. Fractions are in [0,1].

```ts
type Range = { startMs: number; stopMs: number } // half-open [start,stop)
type Coverage = {
  requested: Range
  valid: Range[]       // sorted, nonoverlapping; never interpolate across gaps
  missing: Range[]     // valid + missing partition requested
  fraction: number    // valid duration / requested duration
}
type Measure =
  | { status: 'computed'; value: number; uncertainty: number | null }
  | { status: 'unavailable'; value: null; reasonCodes: string[] }
type Source = {
  datasetId: string; productId: string; url: string
  retrievedUtc: string; sha256: string
  version: string | null; units: string
  coordinateFrame: string; frameRealization: string | null
  corrections: string | null; timeScale: string | null
}
type Provenance = {
  algorithmVersion: string; sources: Source[]
  approximations: string[]; warnings: string[]
}
type Interval = {
  startMs: number; endMs: number
  startClipped: boolean; endClipped: boolean
  startCause: 'terrain' | 'eclipse' | 'combined' | 'coverage' | null
  endCause: 'terrain' | 'eclipse' | 'combined' | 'coverage' | null
}
type SearchEnd = {
  status: 'found' | 'already-below' | 'coverage-ended' | 'unavailable'
  eventMs: number | null
  verifiedUntilMs: number | null
  remainingH: number | null
  atLeastH: number | null
  reasonCodes: string[]
  numericalToleranceMs: number | null
  physicalUncertaintyMs: number | null
}
```

Uncertainty uses the same units as the measurement and is null if unquantified.
`computed` means a value was calculated, not that it is exact. Event boundaries
at a data gap use cause `coverage`; they are not physical sunsets. A search ending
at the data boundary has remainingH=null and, when known, a verified lower bound
in atLeastH. A missing measurement never becomes zero or false.

## Terrain

Keep the existing request `{site,observerHeightM,config}`. Proposed completed result
retains the legacy `id,origin,preview,profile` fields, and adds:

```ts
type TerrainAdditions = {
  schemaVersion: 'scientific-draft-1'
  reference: {
    coordinateFrame: string; frameRealization: string
    radiusM: number; verticalDatum: string
  }
  slope: {
    degrees: Measure
    supportShape: 'circle'; supportDiameterM: 100
    band: '0-5' | '5-10' | '10-15' | '15-plus' | null
    validSupportFraction: number
    method: string
  }
  provenance: Provenance
}
```

Slope bands have lower inclusive and upper exclusive boundaries. No slope band
excludes the point. Surface elevation and the near/far DEM coverage must be known
before returning a complete horizon profile. An incomplete horizon is unavailable;
zero elevation cannot stand for NoData. Effective DEM resolution is separate from
nominal pixel size. The support is a circle 100 m in diameter, not a square cell.

## Point scenario (U02, U06)

Keep the existing range/step/terrain-result-ID request for transport compatibility.
Propose an explicitly versioned result when the new engine is ready; migrate the
frontend types and consumers together, rather than changing meanings of the old
body-center fields. The legacy frontend cannot consume this new result unchanged.

```ts
type Track = {
  azimuthDeg: (number | null)[]; elevationDeg: (number | null)[]
  horizonDeg: (number | null)[]; marginDeg: (number | null)[]
  distanceKm: (number | null)[]; angularDiameterDeg: (number | null)[]
}
type Scenario = {
  schemaVersion: 'scientific-draft-1'
  id: string; origin: 'engine'; terrainAnalysisId: string
  timeScale: 'UTC'; range: Range; timesMs: number[]
  sun: Track & {
    fSunTerrain: (number | null)[]; fSun: (number | null)[]
    c3Visible: (boolean | null)[]
  }
  earth: Track & {
    fEarth: (number | null)[]; c3Visible: (boolean | null)[]
    illuminatedFraction: (number | null)[]
  }
  coverage: { terrain: Coverage; solar: Coverage; earth: Coverage }
  intervals: {
    sunC3: Interval[]; earthC3: Interval[]; bothC3: Interval[]
    fullDarkness: Interval[]; reducedLight: Interval[]
  }
  continuity: { sunC3: SearchEnd; earthC3: SearchEnd }
  provenance: Provenance
}
```

All sample arrays have the same length as timesMs. Include stop as a sample for
interpolation only; it adds no duration. C3 uses fraction >=0.5. Full darkness is
fSun=0; reduced light is 0<fSun<0.5. fSun uses the union of terrain and Earth
occultations, never the product of two scalar visible fractions. illuminatedFraction
describes Earth phase and does not determine geometric visibility. Intervals and
event searches must come from the refined model, not boolean interpolation.
Numerical zero tolerance and integration method belong in provenance.

Annual P50 is a separate product with a full UTC calendar-year range, coverage,
and `p50: Measure`. With incomplete coverage, annual p50 is unavailable; expose
covered-period statistics and their denominator separately. Do not extrapolate.
Date sensitivity preserves T and T±1/2/3 days, separate forward/backward same-cell
intersections, and separate regional alternatives. These are sampled-date results,
not claims of continuity between dates.

## Regional comparison (U01, U02, U03)

Proposed request fields: `regionIds:string[]`, `utc:string`,
`metric:'B.areaKm2'|'A5.areaKm2'|'A10.areaKm2'|'A15.areaKm2'|
'B.largestComponentKm2'|'A5.largestComponentKm2'|
'A10.largestComponentKm2'|'A15.largestComponentKm2'`,
`direction:'ascending'|'descending'`. This is a proposed initial metric set;
continuity and date persistence can be added after defining their aggregation.
Do not expose an HTTP URL until reviewed. No `overall`, weighted score or universal
winner. Without a requested ordering preserve catalog order.

Each result row should retain the canonical region ID and include:

```ts
type AreaMetric = {
  knownAreaKm2: number; largestKnownComponentKm2: number
  totalRegionAreaKm2: number; evaluableAreaKm2: number; unknownAreaKm2: number
  fractionOfTotal: number; coverageFraction: number
  status: 'complete' | 'partial' | 'unavailable'
  reasonCodes: string[]
}
type RegionalRow = {
  regionId: string; utc: string
  B: AreaMetric; A5: AreaMetric; A10: AreaMetric; A15: AreaMetric
  slopeBands: { band: string; areaKm2: number; evaluableAreaKm2: number }[]
  representative: null | {
    cellId: string; site: { latDeg: number; lonEastDeg: number }
    selectionRule: string; scenarioId: string
  }
  provenance: Provenance
}
```

The geometry-valid denominator applies to B; joint geometry-and-slope validity
applies to A5/A10/A15. Cumulative areas do not sum to a total. Component areas use
four neighbours, unknown cells never bridge components. Cell areas are clipped to
the region and measured on the reference sphere. A partial known area is a lower
bound. Retain all regions; distinguish unavailable from known zero. Do not silently
rank partial lower bounds as equivalent to complete totals. Point metrics displayed
together must use the same identified cell; a centroid is not an approved optimum.
Catalog IDs remain separate from demo points and historical site IDs.

## Eclipses and system state (U06, U09)

Propose eclipse requests with a terrain result ID and exact UTC search range.
Each event has `startMs,maxMs,endMs` (nullable if clipped), coverage, numerical and
physical uncertainties, `solarObscurationFraction`,
`sunTerrainVisibleFractionAtMax`, `sunVisibleFractionAtMax`,
`terrainObservableAtMax:boolean|null`, and `c3SolarAtMax:boolean|null`.
These two booleans replace the ambiguous visible badge. A totality above the
terrain can be observable while c3SolarAtMax=false. A complete no-event range
returns events=[]; an incomplete search additionally reports missing coverage.

Propose system requests with `startUtc,stopUtc,stepMinutes`. Results contain a
shared timesMs, position vectors in km for each body, coverage and provenance.
Every series explicitly declares `originBody`, `axesFrame`, `frameRealization`,
`timeScale` and `corrections`. Different origins/frames require separate series
metadata and validated transforms; do not silently rotate MOON_ME into ECLIPJ2000.
A globe state is a separately validated Moon-fixed solar direction at exact UTC.
Global observer quantities 14/15/19/20 alone are not a validated topocentric adapter.

Visualization configuration and tile proxy require reviewed layer IDs, Capabilities
grid/style/format bindings and availability metadata before defining public JSON.
Their proposed paths are not automatically implemented by this schema document.

## Job policy proposal (U04)

Current implemented boundary: POST validates and persists a **new** failed receipt,
returns 202; GET returns 200 for known receipts and 404 for unknown IDs/wrong job
family. Both use `{id,status,error:{code,message}}`. Records survive restart in
`backend/data/jobs/scientific/`; no automatic expiry, retry, dedup or successful
result caching is implemented. The receipt stores exact input parameters, with
longitude normalization, and contains no fake source revision.

Proposed future policy for review: bounded worker queue; queued/running/completed/
failed envelopes; recover interrupted jobs as failed; preserve completed terrain
dependencies; deduplicate only after source/model revision identity is established;
retry as a new attempt referencing the old job. Define retention/quota and expired-ID
behaviour before implementing cleanup or 410 responses. AbortController cancels a
client wait, not shared computation. Configure supported data coverage and execution
limits from measured engine behaviour; do not inherit arbitrary demo limits.

## Required approvals and evidence

Review the comparison metric selector and representative rule (U01/U03), new result
version and UI handling of null/partial states (U02), job retention/resources (U04),
actual coverage/error bounds (U05), eclipse badge meanings (U06), supported observer
heights/terrain quality (U07), Query configuration (U08), and orbit frame/adapter
validation (U09). None are closed merely by proposing field names. Validate slope,
horizon, disk unions, events, Horizons transforms and convergence using the evidence
required by the approved scientific criteria before publishing completed results.
