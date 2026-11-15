# LROC observational protocol v2 — pending

Registered on **2026-11-15**, before applying a new method to verification scenes. The Otsu v1 benchmark remains failed; this protocol neither changes its tolerances nor retroactively replaces its outcome. See the [review](validazione-engine-v1-revisione.md).

## Data selection and separation

The six already examined MALAPERT02/MALAPERT03 orthophotos are **development only**, even after changing threshold or annotator. Verification requires distinct acquisitions with known date/geometry, overlap with a V1 polygon and observable light/shadow. Do not split adjacent pixels from one acquisition between development and verification. If the method changes after inspecting verification, that scene becomes development.

Selection must not use engine predictions or errors. Retain all candidates, exclusions/reasons, footprints, metadata, hashes and dates. Simulated shaded relief is not observation. Multi-epoch mosaics require identification of original segments/acquisitions rather than a single assumed solar epoch.

## Independent reference

A qualified annotator, blinded to predictions, marks confidently illuminated terrain, cast shadow and uncertain areas on radiometrically calibrated orthophotos. A second reviewer checks boundaries/interpretation; disagreements remain uncertain. Darkness alone is not proof of cast shadow: inspect crest/edge morphology, context, albedo, incidence, saturation and NoData. Do not impose an exclusion fraction to improve agreement.

`backend/data/analysis/validation/review-20261115/annotation/` contains development-scene samples, stereographic metre coordinates, I/F, empty annotation fields and observed-data-only views. `label=-1` means unannotated/uncertain, 0 shadow, 1 light. These are not already established scientific labels. Record annotator/reviewer identities, reasons and label hashes before comparison.

Model labels are not ground truth. Annotating the six existing scenes does not turn them into holdout data; new acquisitions and a controlled reference are still required.

## Comparison and unchanged criteria

- Compare ground-level `fSunTerrain`, using line timestamps when available. If using mean epoch, quantify start/end-acquisition effects; samples changing state are temporally ambiguous and must be counted.
- Retain v1 convention: shadow at zero fraction, light at fraction ≥0.5, intermediate fractions partial; declare numerical epsilon. Record unknown/partial cases separately.
- Primary metric: agreement on independently labeled samples with decidable predictions, criterion **≥0.90 unchanged**. Missing either class or independent reference leaves the benchmark incomplete.
- Report reference-row/prediction-column 2 × 2 matrix, precision/recall for each class, balanced accuracy, scene counts, coverage, exclusions and absent classes. These diagnostics have no newly invented numerical pass threshold.
- For **dense georeferenced masks**, extract light/shadow edges only within annotated areas, excluding NoData/uncertain edges. Report bidirectional nearest-edge distances, median/P95 in metres, scale and registration uncertainty. The sparse 152 m sample grid is not a dense mask. Without edges the metric is unavailable.
- Adjacent pixels are not independent observations. Report per-scene metrics rather than treating pixel count as independent sample count.

## Recorded candidate search and limits

The 2026-11-15 search recorded:

- [MALAPERTA01](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_MALAPERTA01): centered at −80.29°, outside V1 regions; not Malapert Massif.
- [ESALL_MP1](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_ESALL_MP1): DLR processing. PDS hosting does not make the producer US-based; excluded under the restrictive team source policy.
- [DEGERRIMLO1](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_DEGERRIMLO1): mosaic of 144 NAC acquisitions, 656 segments and three subsolar-longitude ranges from 2009–2013. Useful for identifying originals, not a single-epoch scene. Listed candidates include `M168932116L`, `M168938902L`, `M168945689L`; segment footprints/orthorectification remain unverified.
- The six existing NASA LRO/ASU orthophotos served by `pds.mcp.nasa.gov` remain accepted development data.

This search does not establish that no suitable scenes exist. No new independently reviewed reference was produced. The observational gate remains open: acquire/georeference a new extensive-shadow scene, complete blinded annotation/review and apply the frozen protocol. Claims covering both regions require evidence in both.
