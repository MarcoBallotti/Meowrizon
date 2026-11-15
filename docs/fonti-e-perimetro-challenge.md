# Scientific sources and challenge scope

This preserves the source policy and research decisions recorded on **2026-11-15**, updated to distinguish the implemented software from the original implementation assignment. It is not a fresh review of external mission schedules or challenge rules.

## Challenge interpretation and evidence

The [Lunar Landing Site Navigator challenge](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) calls for an intuitive comparison of lunar locations/dates, showing Sun and Earth relative to the local horizon. The recorded research initially had only indexed text because direct access failed; a later note records reading the complete served description, goals, considerations and resources. That later reading confirmed site/date comparison, time to sunset/Earthset, solar elevation, illumination and Earth-visibility windows, real topography and libration.

Known-site catalogs and free coordinates were optional possibilities, not mandatory universal coverage. Listed resources included QuickMap, Moon Trek, Horizons and the CSA portal. The team's **NASA or US institutional scientific-source policy** is stricter than the challenge and must be identified as a team decision.

Geometric availability supports preliminary energy/communication discussion. Actual watts, autonomy and RF performance need additional vehicle/system models. Horizon/body/window visualization remains essential to the final product; a numerical ranking alone does not meet that interpretation.

## Accepted scientific provenance

NASA/JPL, NASA NTRS, PGDA, Moon Trek, official NASA mission products, US federal agencies such as USGS, and documented US public institutional research records such as Arizona Board of Regents/ASU are accepted. A US institutional record does not imply every author is American or that research is a NASA standard.

University-hosted NASA PDS/LROC nodes can be official mission channels. Conversely, Moon Trek hosting alone does not make every layer NASA-produced: record producer, mission, institution and product. The terrain choice remains **LRO-LOLA**; mixed-mission products require an explicit provenance review.

QuickMap is optional for manual exploration; numerical evidence must trace back to original products. Official software documentation, container images and local proposals are technical references rather than scientific NASA evidence.

## Bibliographic decisions retained

| Earlier reference | Adopted reference | Scope/limitation |
|---|---|---|
| collectSPACE region announcement | [Original NASA 2022 announcement](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) | Same historical catalog |
| IAU nominal solar radius | [NASA Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html) | Same 695,700 km value, tabulated as mean volumetric radius; NASA is not claimed as origin of the IAU nominal constant |
| Intuitive Machines IM-2 target-distance report | [NASA Marshall 2025 achievements](https://www.nasa.gov/marshall-science-achievements/) | Mission outcome context, not a safety threshold |
| Gläser 2014 publisher/DLR record | [Arizona Board of Regents/ASU record](https://experts.azregents.edu/en/publications/illumination-conditions-at-the-lunar-south-pole-using-high-resolu/) | Same study/abstract, 19 years and 92.27% at 2 m; not annual P50 or complete reproduction inputs |
| Lunar-VISE publisher record | [USGS institutional record](https://www.usgs.gov/publications/lunar-vise-landing-site-selection-and-characterization-mons-gruithuisen-gamma) | Selection context, without inferring the 4 m slope-support method from the abstract |
| Wueller 2026 | [PGDA illumination](https://pgda.gsfc.nasa.gov/products/69) and [NASA selection context](https://ntrs.nasa.gov/citations/20250011660) | Not equivalent to specific accessibility/volatile conclusions; F24 withdrawn and not reassigned |
| Blue Ghost LPSC 2022 slope figures | [NASA 2025 press kit](https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf) | Context only; numerical equivalence unverified, old ≤10°/~<5° claims withdrawn |
| VIPER USRA abstract | [NASA NTRS specifications](https://ntrs.nasa.gov/api/citations/20240013291/downloads/PESTO-VIPER-intro.pdf) | 50 h low-power hibernation / 9 h PSR operation, specific to VIPER |
| George 2026 USRA abstract | [NASA NTRS record](https://ntrs.nasa.gov/citations/20250011660) | Same update, architecture-specific |
| CSA educational content | [NASA Moon overview](https://science.nasa.gov/moon/) | General educational alternative, not equivalence of every page |
| ESA MIDAS flight notes | NASA GMAT context | Earlier trajectory idea withdrawn; no verified functional equivalence or new trajectory requirement |
| IAU Gazetteer | [USGS Gazetteer](https://planetarynames.wr.usgs.gov/) | Preserve IAU naming attribution and nominal-coordinate uncertainty |

Changing bibliography does not convert team conventions into NASA requirements: C3 at 50%, observer height 2 m, slope bands 0/5/10/15°, future 100 m grid and annual 80% highlight remain explicit project choices.

## Approved V1 and remaining scope

V1 demonstrates 2–3 identified points across two development regions, explicit dates and equal finite windows. Preserve coordinates/elevation/DEM/quality, true horizon and Sun/Earth tracks, disc fractions and eclipses, windows/outages, supported slope measurements, unknowns, clipping, provenance and verification. A point does not represent a region.

Regional grids, areas/components, annual P50 and automatic date-persistence scans remain deferred. Catalog-wide HTTP point comparisons have since been implemented; they do not establish those regional capabilities or extend the CLI validation. AI/CAD/news extensions remain deferred.

Universal touchdown/traversability safety, hardware thermal behavior, RF/relay performance, flight design, PSR routes and ice quantities are outside the geometric engine. The current optional frontend energy calculation is a separate parameterized approximation; it does not revise the V1 scientific contract or establish actual hardware survival.

The [scientific criteria](criteri-algoritmo.md), [current status](stato-decisioni.md), [data guide](guida-dati.md) and [validation review](validazione-engine-v1-revisione.md) define the retained operational/scientific references. Source provenance and completed validation are separate claims; NASA origin is not NASA approval.
