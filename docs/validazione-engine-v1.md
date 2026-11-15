# Initial engine V1 validation report

**Historical evidence, retained for reproducibility.** This report records the initial execution on **2026-11-15**. It is superseded for current convergence outcomes by the [validation review](validazione-engine-v1-revisione.md), which preserves the original tolerances and failed observational benchmark. No scientific checks were rerun for the documentation translation.

Configuration: `backend/config/analysis.demo.json`, two polygon-center points (de Gerlache Rim 2 and Malapert Massif), epochs **2026-12-01**, **2026-12-04**, **2027-02-01** at 00:00 UTC, 30-day windows.

**Initial outcome: V1 validation incomplete.** Dated LROC orthophoto agreement did not meet the predeclared criterion, and one of 100 convergence checks failed. The engine must not be described as validated.

Tolerances were written before comparisons in `backend/config/analysis.tolerances.json` and were not changed. They are team numerical choices, not NASA limits. Original evidence was saved under `backend/data/analysis/validation/evidence.json` and `evidence-initial-config.json`; current CLI runs use unique evidence filenames.

## Initial checks

| Check | Source/case | Metric/tolerance | Recorded result | Outcome |
|---|---|---|---|---|
| Offline engine tests | Synthetic engine cases | All pass | 93/93 | Passed |
| Backend suite | Project image | All tests | 177/178; pre-existing `test_second_writer_cannot_modify_the_manifest` failure | No new regressions recorded |
| Lint | ruff | No errors in new files | Zero new-file errors; pre-existing `app/api/coverage.py` finding | New files passed |
| Interpolation | Direct intermediate Horizons, 720 times × six scenarios | Direction/radius/separation 0.002° / 0.0002° / 0.002° | ≤1.3e-6° / 1.4e-7° / 1.6e-6° | Passed |
| DEM alignment | 16 × 16 blocks at doubled export resolution, four products | Maximum 0 m | 0 m | Passed |
| Malapert slope | PGDA 100 m support, 121 nodes | Median/P95 ≤1°/3° | 0.089° / 0.320° | Passed |
| de Gerlache slope | Same | Same | 0.754° / 2.688° | Passed with limitations |
| Horizon azimuth | 0.125° vs 0.0625° | RMS ≤0.02° | 0.0012° / 0.0006° | Passed |
| Radial spacing | Halved spacing | Maximum ≤0.02° | 0.0046° / 0.0028° | Passed |
| Outer radius | 300 vs 225 km | Maximum ≤0.02° | 0.000° | Passed for those radii |
| Fractions | Five variants × six scenarios | Difference ≤0.01 | ≤0.0029 | Passed |
| Events | Five variants × six scenarios | Shift ≤60 s | ≤50.6 s in 29 cases; 337.5 s in one | One failure |
| Eclipse | 2025-03-14, both points | Geometric consistency | Total eclipse obtained | Passed internal consistency |
| LROC | Six dated Malapert NAC orthophotos | Agreement ≥0.90 | 0.796–0.872 | Failed |

## Initial configuration changes

The first configuration used 0.25° azimuth spacing and uniform radial spacing equal to the pixel size. It failed seven of 88 checks. The intermediate configuration used 0.125° and relative radial refinement.

| Check | First configuration | Intermediate configuration |
|---|---:|---:|
| Halved radial spacing, de Gerlache | 0.601° | 0.0046° |
| Halved radial spacing, Malapert | 0.073° | 0.0028° |
| Halved-azimuth events, de Gerlache 2027-02-01 | 140.6 s | 22.5 s |
| Halved-azimuth events, Malapert 2027-02-01 | 118.1 s | 337.5 s |
| Halved-azimuth fractions, Malapert dates | 0.0101–0.0114 | 0.0015–0.0029 |

At de Gerlache, 124 of 360 initial directions are controlled by terrain about 20 m away, where apparent terrain elevation changes by about 0.3° per metre. Radial spacing became `min(tier_spacing,0.0005*distance)`. This materially changed predictions: the first Malapert darkness end on 2026-12-06 moved from 01:28 to 02:32 UTC.

The remaining 337.5 s shift was a grazing solar-limb/crest transition at Malapert in February 2027. The later review refined azimuth further and resolved that numerical failure without changing the 60 s criterion. The original low-rate note threshold (0.6 fraction/hour) flagged most transitions at these latitudes; the recorded per-boundary rates are more informative than a generic warning.

## Ephemerides

Direct `coord@301` queries use quantities **4,13,20**. Actual headers confirmed `MEAN_ME`, a 1737.4 km sphere, altitude in km, apparent geometry without refraction and azimuth north through east. The parser rejects incompatible frame/radius/site/units/columns.

Cubic direction-vector interpolation of hourly samples matched direct half-step queries within printed Horizons precision (~1e-6°); fraction effect ≤2.1e-6. This verifies acquisition/interpolation, not independent astronomical validation of Horizons.

## Slope and terrain

| Point | DEM | Point slope | Nearest PGDA node: engine/reference | Median / P95 / max error | Correlation |
|---|---|---:|---|---|---:|
| malapert-center | `Site23_final_adj_5mpp_surf` | 3.71° | 4.81° / 4.77° | 0.089° / 0.320° / 0.657° | 0.996 |
| dgr2-center | `LRO_LOLA_DEM_SPole875_5mp_v04` | 9.21° | 11.01° / 10.15° | 0.754° / 2.688° / 3.197° | 0.800 |

Reference: NASA PGDA product 90, window-read slope raster, ETag `W/"24edcc2e-188979eb648"`, size **619,564,078 bytes**. Malapert shares the reference product family, so tight agreement indicates fit consistency rather than independent ground truth. de Gerlache uses a different v04 DEM based on altimetry through September 2011; only 3.8% of its support pixels contain LOLA spots. Most disagreement there reflects terrain differences rather than numerical fit error.

Support ±10% / center ±one-pixel sensitivity was 0.17° at de Gerlache and 0.38° at Malapert, without changing the point bands. **Physical DEM uncertainty was not quantified.** Moon Trek does not distribute an applicable error layer for these accessed products.

All 2,880 intermediate-config horizon directions were complete at both points. Controlling terrain reached 167/169 km; none of those directions depended on terrain beyond 225 km. Seam elevation differences: 5 m/30 m v04 mean 0.04 m, SD 0.77 m, max 10 m; site23/30 m mean 0.04 m, SD 3.35 m, max 28 m; 30/100 m SD 1.7–1.9 m.

A wrong catalog extent for the 100 m product (±1095.93 rather than ±1440 km) caused an off-grid tile to be discarded; metadata/registry checks now reject that mismatch. Another initial defect left 109/1440 directions incomplete because far-terrain windows did not follow the real surface circle; it was corrected.

## Real eclipse geometry

Window: 2025-03-13 through 2025-03-15. The cited NASA GSFC catalog records the 2025-03-14 total lunar eclipse with maximum **06:59:56 TD** and penumbral duration **362.6 min**. These catalog values are context, not a completed independent contact-time comparison.

| Point | Earth/Sun overlap (UTC, March 14) | Minimum separation | Maximum coverage | Local darkness/cause |
|---|---|---|---|---|
| dgr2-center | 04:21:28–09:26:01 | 0.072° at 06:54 | 1.0 | Already terrain-dark |
| malapert-center | 04:22:11–09:26:45 | 0.071° at 06:55 | 1.0 | 05:30:29–08:21:27, terrain and Earth together |

Minimum separation is smaller than the angular-radius difference (0.910°−0.267°), consistent with local totality. Malapert's solar disc was partly above terrain, so darkness required the union of masks. The February 2027 demo showed no overlap at either point; the cited 2027-02-20 event is penumbral with gamma −1.048 and did not reach these south-polar points in this calculation.

## Dated LROC benchmark

Source: NASA PDS `LRO-L-LROC-5-RDR-V1.0`, ASU/LROC `NAC_DTM_MALAPERT02` and `NAC_DTM_MALAPERT03`, dated **4 m/pixel** orthophotos served by `pds.mcp.nasa.gov`. Samples are inside Malapert Massif, around latitudes −85.8°/−86.1°, longitude 359.7°E, projected x −2.1 to +0.4 km and y 111–132 km.

Predeclared rule: prediction is ground-level `fSunTerrain` (0 m observer, not V1's 2 m) at mean acquisition time; observation is I/F averaged over 20 m, light above the image's Otsu threshold. Score nonpartial predictions on a **152 m sample grid**.

| Image suffix | UTC epoch | Sun azimuth / elevation | Samples | Predicted shadow / light | Agreement | Half-threshold agreement | Outcome |
|---|---|---|---:|---|---:|---:|---|
| `MALAPERT02_M139906018` | 2010-09-23 18:32:49 | 353.9° / 5.74° | 1023 | 1 / 1022 | 0.811 | 0.960 | Failed |
| `MALAPERT02_M139912793` | 2010-09-23 20:25:44 | 353.4° / 5.73° | 1861 | 4 / 1857 | 0.828 | 0.967 | Failed |
| `MALAPERT02_M139919591` | 2010-09-23 22:19:01 | 352.8° / 5.73° | 1012 | 3 / 1009 | 0.840 | 0.968 | Failed |
| `MALAPERT03_M141080135` | 2010-10-07 08:41:27 | 188.3° / −2.35° | 734 | 6 / 727 | 0.872 | 0.952 | Failed |
| `MALAPERT03_M141086909` | 2010-10-07 10:34:21 | 188.0° / −2.35° | 1459 | 10 / 1446 | 0.834 | 0.948 | Failed |
| `MALAPERT03_M141093708` | 2010-10-07 12:27:40 | 187.5° / −2.35° | 774 | 5 / 769 | 0.796 | 0.933 | Failed |

The scenes are almost entirely lit: only 29 of 6,863 grid samples were predicted shadow (21 dark observations, eight light). Thus this benchmark poorly tests shadow-boundary placement. Most disagreement is 1,161 predicted-lit samples below Otsu. Without two distinct populations, Otsu splits illuminated terrain and is unsuitable as an independent shadow reference.

Post-result diagnostics **do not count as a pass**: rank correlation between observed I/F and predicted local-incidence cosine (40 m local plane) was 0.85–0.96. Dark-sample median cosine was 0.09–0.21 versus 0.27–0.50 for light samples, consistent with shallow illumination. October images show lit high terrain (4–5 km elevation) despite the Sun being 2.35° below local horizontal. A second Horizons query 5–7 km away changed the transferred fixed lunar-frame solar direction by ≤1.9e-6°.

The producer reports LOLA registration RMS **1.6–2.2 m**; the 5 m DEM is largely interpolated. No suitable dated de Gerlache orthophoto was found in that search. `MALAPERT01` overlapped only a 36 m edge strip and was excluded. The halved-threshold numbers are sensitivity diagnostics, not replacement criteria or rescued outcomes.

## Reproducibility and historical timings

Two runs with the same cached sources generated byte-identical `result.json`. Independent fresh acquisition in a separate directory gave zero numerical differences, excluding source hashes/acquisition timestamps. Offline mode used no requests with complete cache and returned exit 2 when data was missing.

| Initial 0.125° configuration condition | Recorded time |
|---|---:|
| Cold sources: 70 downloads, approximately 497 MB | 339.9 s |
| Raw sources cached; terrain/series recomputed | 19.4 s |
| Everything cached, including offline | 0.6 s |

These are local Docker/MacBook measurements, not performance guarantees.

## Subsequent work

The later [review](validazione-engine-v1-revisione.md) resolves the numerical convergence failure by refinement, records classification matrices and cache checks, and preserves the failed Otsu outcome. Independent new LROC scenes/labels and physical terrain uncertainty remain open. Initial handoff notes about unupdated README files or checks not yet rerun describe that historical run, not current project instructions.
