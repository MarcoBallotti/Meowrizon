# V1 validation review — 2026-11-15

**Outcome: V1 validation incomplete.** Numerical checks passed for the refined configuration; an independent observational light/shadow reference remains incomplete. No tolerance was relaxed, and no NASA approval is implied.

This supplements the [initial report](validazione-engine-v1.md) without erasing it. Existing PGDA samples and six LROC scenes were retained; samples were not selected by model error to improve outcomes. The numbers below are the recorded review evidence, not checks rerun during documentation translation.

## Reproducibility and repository state

Base commit: `234cd7838f069627289e05d3b7de0403ca5b6f8c`, with pre-existing uncommitted changes and merge conflicts during the review. The commit alone does **not** identify the executed code; file fingerprints are in the review artifacts.

`backend/config/analysis.tolerances.json` retained SHA-256:

```text
e1292735b88228a833b5ca4401618ae59c54e8633ab4b6ebbb719615aabe3e2a
```

Evidence is under ignored `backend/data/analysis/validation/`. Versioned scripts reproduce it. Previous JSON/LROC grids are copied to `review-20261115/previous-*`. New evidence filenames include unique UTC timestamps and do not overwrite earlier runs.

### Test suites and filesystem behavior

- Initial macOS bind mount: **177/178** passed, including the already reported lock-test failure.
- Storage source/tests matched HEAD; the baseline lock test passed when HEAD was extracted into the native Docker filesystem.
- Native filesystem lock diagnostics blocked both a second descriptor in-process and a separate process. The bind mount exhibited different semantics. An experimental explicitly multiprocess test did not resolve this consistently and was withdrawn, retaining the original test.
- An intermediate mounted run also raised `FileNotFoundError` while reading a job during an update. It was neither hidden nor attributed to the engine without proof.
- Final native-container suite, using copied source and the original tests except review additions: **184/184 passed**, with one network test excluded by existing configuration. This includes **99 engine tests**.
- Concurrency reliability on the macOS bind mount was not established. Native success does not certify that mounted deployment/filesystem.

Artifacts: `review-20261115/tests-native.xml`, `tests-native.txt`, `tests-final.xml` (intermediate failures), `baseline-lock-test.txt`. Review-file lint passed; the entire conflicted repository was not declared lint-clean.

### Cache

Two real offline runs with HTTP explicitly forbidden produced the same result SHA-256:

```text
f85cd8033f3a9292352fe801be83f8320cdd13ebe37d80ba34393e8915bee38d
```

First: terrain cached, six series recomputed in about **11.3 s**. Second: all series cached, about **0.9 s**. No downloads. These are local timings. Tests cover invalidation by DEM, parameters and algorithm version, missing/corrupt cache and offline behavior. The 340 s cold-download measurement was not repeated.

## Slope classification

Rules remain `[0,5)`, `[5,10)`, `[10,15)`, `≥15°`, without automatic 10° exclusion. Tests cover synthetic fits and exact boundaries. The real comparison retains **121 PGDA nodes per region**, with the initial report's scale/support.

| Region | Band agreement | Adjacent errors | Nonadjacent errors | Median / P95 error |
|---|---:|---:|---:|---|
| de Gerlache Rim 2 | 105/121 = 86.78% | 16 | 0 | 0.754° / 2.688° |
| Malapert Massif | 118/121 = 97.52% | 3 | 0 | 0.089° / 0.320° |

Matrices: rows are PGDA reference bands, columns engine bands, ordered 0–5 / 5–10 / 10–15 / ≥15°.

```text
de Gerlache                 Malapert
 0   0   0   0              25   2   0   0
 0  14   3   0               1  89   0   0
 0   3  86   2               0   0   4   0
 0   0   8   5               0   0   0   0
```

**Limits:** de Gerlache's ≥15° band is recognized in only **5/13 cases (38.46%)**; <5° is absent. Malapert has no ≥15° samples and only four 10–15° samples. Overall agreement cannot be extended to every band or the whole region. Spatially adjacent nodes are not 121 independent observations.

The three Malapert disagreements are within **0.018°** of the reference 5° threshold. Some de Gerlache disagreements are more than 2° from a threshold, so they are not all rounding effects. Per-disagreement distances remain in JSON without a new arbitrary “near threshold” criterion.

Degree-error gates passed under original tolerances, but the matrices expose their limitations. Different DEMs at de Gerlache and partly shared inputs at Malapert mean this does not isolate algorithm error or provide independent ground truth. Point numerical sensitivity is not physical DEM uncertainty or a band confidence interval.

[NASA PGDA product 90](https://pgda.gsfc.nasa.gov/products/90) supplies error layers for its own adjusted DEM/slope products. They cannot be transferred to the Moon Trek v04 DEM or a 100 m fit without demonstrating correspondence. Physical uncertainty of the current outputs remains unquantified; this does not mean NASA offers no uncertainty products in general.

## Observed light/shadow

The Otsu v1 benchmark remains **failed for all six scenes**: agreement **79.6–87.2%**, below 90%. New diagnostics on the same reference give balanced accuracy about **0.503–0.519**: overall agreement hides severe imbalance. These measure agreement with Otsu labels, not accuracy against independently established shadows.

The [LROC v2 protocol](protocollo-validazione-lroc-v2.md) retains ≥0.90 and separates development from verification. `review-20261115/annotation/` contains six georeferenced CSVs and observed-data-only SVGs, without predictions. Initial labels are all unannotated; 0/1 classes were not invented. Sparse grids cannot support dense shadow-edge distances in metres.

Candidate search/exclusions remain in the protocol: the de Gerlache mosaic combines epochs; Malapert A lies outside the development regions; ESALL_MP1 was processed by DLR and was not treated as a US-produced substitute. This search does not establish that no suitable scenes exist.

**Remaining blocker:** a suitable new georeferenced acquisition with extensive shadows and independently reviewed labels is missing. Segment identification/orthorectification and controlled annotation must precede new agreement/edge measurements. Existing six scenes remain development data. Success in one region would not automatically validate the other. No new observational gate was declared passed.

## Grazing transition and convergence

Case: Malapert, 30 days from **2027-02-01**, with identical ephemerides, disc integration and terrain; only azimuth spacing changes.

| Azimuth spacing | Maximum shift from previous spacing | Compared transitions |
|---|---:|---:|
| 0.125° | Historical reference | 18 |
| 0.0625° | 337.500 s | 18 |
| 0.03125° | 45.937 s | 18 |
| 0.015625° | 22.500 s | 18 |

Each maximum is over all 18 transitions and need not concern the same event. The originally failing event is the sixth darkness start on **2027-02-10**: **05:36:03.281 UTC** at 0.125°, **05:30:25.781** at 0.0625°/0.03125°, and **05:30:24.844** at 0.015625°. Later maxima of 45.937/22.500 s concern other boundaries.

`review-20261115/azimuth-ladder.json` contains the ladder, all darkness intervals and computation times. The **60 s** criterion did not change. Demo spacing is now **0.03125°**, refined against **0.015625°**. The generic model default remains **0.125°**; these outcomes apply to the explicit demo configuration.

Across six scenarios and five variants each (azimuth, radial spacing, disc strips, time scan, ephemeris spacing), maximum event shift was **26.25 s**. Boundary counts **and types** were checked: equal counts with different topology are not convergence. Fraction differences stayed within **0.01**. March 2025 eclipse geometry remained consistent at both points, without a complete independent NASA contact-time validation.

Convergence on a fixed DEM does not establish 26 s physical accuracy. Terrain error, effective resolution and grazing transitions remain limitations. The 300/225 km radius comparison tests those radii only and cannot alone exclude obstacles beyond 300 km.

## Changes and reproduction

The review refined demo azimuth spacing from 0.125° to 0.03125°, added band matrices/PGDA threshold distances and masked NoData handling, and added class-specific light/shadow diagnostics. Full gates include eclipse/alignment, preserve omitted/incomplete states and compare boundary topology. Evidence uses unique filenames, rejects overwrites and NaN/Infinity. Added tests cover these properties and cache-version invalidation. Classification thresholds and the tolerance file were unchanged.

No frontend changes, UI/E2E tests, commits or pushes were part of that scientific review.

From the repository root:

```sh
docker compose run --rm --no-deps backend python -m scripts.review_validation
docker compose run --rm --no-deps backend python -m scripts.review_tests_native
docker compose run --rm --no-deps backend python -m scripts.review_cache
```

The first saves manifest/code/config/package fingerprints and checks source invariance during execution. `validate-engine` exits **4** unless complete validation passes, even if a requested `--check` subset passes. Review-script execution without an exception is not scientific certification.

## Final recorded outcome and scope

Run **`20261115T051605-067665Z`**, elapsed **385.5 s**. Evidence: `backend/data/analysis/validation/evidence-review-20261115T051605-067665Z.json`. `code_unchanged_during_run=true` records equal start/end source/config/test hashes. Initial manifest: `review-20261115/manifest-20261115T051605-067665Z.json`; environment: `review-20261115/environment.json`.

| Gate | Final recorded outcome | Evidence |
|---|---|---|
| Native-container backend suite | Passed | 184 tests, including 99 engine tests |
| macOS bind-mount suite | Not passed | Lock and intermediate job-read anomalies |
| Ephemerides/interpolation | Passed | Independent intermediate Horizons samples |
| Slope degree errors | Passed | Original tolerances; band matrices/limits retained |
| Horizon/scenario convergence | Passed | Stable topology; events ≤26.25 s versus 60 s |
| DEM alignment | Passed | Zero differences in compared blocks |
| Internal eclipse geometry | Passed | Both points; not independent contact-time validation |
| LROC Otsu v1 | Failed | 0/6 scenes above ≥0.90 |
| New independent LROC benchmark | Incomplete | New scenes/reviewed labels missing |
| Physical terrain uncertainty | Incomplete | Not quantified for these products/metrics |

Final JSON reports **100/100 numerical checks passed** and a separate LROC failure; `summary.status` is **`incomplete`**. Classification diagnostics add no tolerances and do not certify every slope band.

Scope: the two demo points; epochs December 1/4, 2026 and February 1, 2027; 30-day windows; declared products/configuration; March 2025 eclipse comparison. This does not establish universal validity for all coordinates, dates, DEMs or the separate HTTP implementation.

**Supported claim:** implemented, reproducible V1 engine with numerical checks passed in the documented configuration and measured classification limitations. Independent observational validation remains incomplete, physical terrain uncertainty remains unquantified, and NASA source provenance is not NASA approval.
