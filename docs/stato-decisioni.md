# Project decisions and current status

Reviewed against the working tree on **2026-11-15**. This is the current status reference; the validation reports describe their recorded executions rather than new runs during this documentation review.

## Implemented paths

| Path | Implementation | Validation boundary |
|---|---|---|
| Python V1 library/CLI | `app.services.engine.orchestrator`, `python -m app analyze` | Two demo points, three explicit epochs and 30-day windows; numerical checks passed, observational validation incomplete |
| Scientific HTTP service | `ScientificJobs` → `terrain.engine` → `ephemerides.scenario` | Real terrain and Horizons results; separate sampling, limits and validation status |
| Frontend | API catalogs, horizon/timeline, reports, catalog comparisons and up to four point comparisons | Uses HTTP products and local presentation/decision models; demo remains explicitly synthetic |
| Data service | Collection, preparation, saved raw responses, Parquet filtering and raster windows | Prepared means parsed/indexed, not scientifically validated |

The HTTP path does not call the V1 orchestrator. A successful merge or matching field names do not transfer validation between paths. Global DEM support is coarser than local polar products and cannot resolve a 100 m slope support.

## Scientific decisions retained

- V1 demonstrates identified points in **de Gerlache Rim 2** and **Malapert Massif**, at explicit UTC epochs and equal finite analysis durations. The demo has two points and three epochs. Points do not represent entire regions.
- The CLI observer is fixed at **2 m above the DEM**. HTTP accepts other nonnegative heights, subject to the actual terrain provider's limits; that does not extend CLI validation.
- JPL Horizons supplies topocentric Sun/Earth geometry. Numerical LRO-LOLA products supply terrain. QuickMap is a manual reference.
- C3 means a visible-disc fraction **≥0.5**. Full direct darkness (`fSun=0`) differs from reduced light (`0<fSun<0.5`). Earth visibility is geometric.
- Slope is a plane fit on a **100 m diameter circular support**, with descriptive bands `[0,5)`, `[5,10)`, `[10,15)`, `≥15°`. No universal automatic 10° rejection applies to the scientific engine.
- Missing measurements remain unknown with reasons; interval boundaries distinguish physical transitions, request clipping and data gaps.
- The scientific engine has no universal winner or success probability. Frontend mission profiles apply explicit user constraints and Pareto tradeoffs; the secondary visibility index and optional energy model are separate decision aids, not V1 validation results.

## Deferred scientific work

Regional 100 × 100 m grids, B(T), A5/A10/A15, four-neighbour components, annual P50, the ≥80% annual highlight, and automatic ±1/2/3-day persistence analysis remain deferred. Catalog-wide **point** comparisons already exist and are distinct from regional aggregation. AI agents, CAD and extended news/educational catalogs are not implemented features.

Flight trajectories, universal landing safety, hardware thermal behavior, validated RF links/relays, PSR access and ice estimates are outside the general geometric engine. The optional frontend battery calculation is an explicitly parameterized simplified model, not a validated spacecraft simulation.

## Remaining validation work

The [recorded review](validazione-engine-v1-revisione.md) reports 100/100 numerical checks passed for the refined CLI configuration, but the six-scene LROC Otsu benchmark failed. New independently reviewed observations are still required under the [LROC protocol](protocollo-validazione-lroc-v2.md). Physical terrain uncertainty remains unquantified. Native-container tests passed in that review; macOS bind-mount concurrency anomalies remain a separate limitation.

Future integration should establish an explicit adapter or shared implementation and dedicated verification before presenting CLI evidence as HTTP validation. Tolerances must be fixed before comparisons, and omitted or incomplete gates must remain visible.
