# Scientific evaluation criteria

Approved scientific definitions, reviewed for current status on **2026-11-15**. These criteria define the **point-based V1 library/CLI** and deferred regional work. The HTTP/frontend path now exists separately; its additional features do not retroactively change V1 validation or these definitions. See [project status](stato-decisioni.md) and the [validation review](validazione-engine-v1-revisione.md).

The scientific question is: **at an exact UTC epoch T, what sunlight, geometric Earth visibility and terrain slope do identified lunar points offer, and how do those conditions change with the selected date?**

## V1 scope

The demonstration uses 2–3 identified points within de Gerlache Rim 2 and Malapert Massif, at least one in each region, and at least two explicit dates. The implemented demo uses two polygon centers and three dates. Selection must be reproducible and checked against both polygon and DEM; a center is not inherently favorable or representative.

Inputs are identified coordinates, exact UTC epochs and a common positive analysis duration. The demo uses 30 days as a **computational analysis window**, not a spacecraft lifetime. Retain absolute UTC and elapsed time from T; do not round T to an hour. The CLI observer is fixed at **2 m above the DEM**, a team convention.

V1 delivers a Python library, CLI, versioned JSON, configurations, provenance, reusable caches, direct point/date comparisons and a validation report. It computes terrain, topocentric Sun/Earth geometry, finite-disc fractions, eclipses and temporal windows. It does not compute regional grids/areas, annual P50, automatic seven-date scans, vehicle safety or a universal score.

## Sources and provenance

- **JPL Horizons [F5,F32]** supplies direct topocentric geometry: Sun `COMMAND='10'`, Earth `'399'`, observer `CENTER='coord@301'`, with DEM altitude plus 2 m referred to the verified service datum. V1 uses observer quantities `4,13,20`, kilometre ranges and apparent geometry without refraction. There is no SPICE/SpiceyPy dependency.
- **NASA Moon Trek [F3]** supplies historical polygons, product catalogs, numeric raster access and display layers.
- **NASA PDS/PGDA LRO-LOLA [F19]** supplies numerical terrain and available quality/reference products. Imagery colors are not elevations.
- **LROC [F30]** supplies dated observations for independent illumination/shadow comparisons.
- **QuickMap** supports optional manual comparison, not numeric acquisition by scraping.

Keep URL, product/version, producer, acquisition time, SHA-256, units, frame, realization, projection/WKT, radius/datum, NoData, nominal/effective resolution and available error/count metadata. Preserve original Horizons requests, responses, headers, time scale, corrections and coverage. DE441 ephemerides and Mean Earth DE421 terrain names alone establish neither compatibility nor incompatibility: verify frame, epoch, height and longitude explicitly.

The catalog retains 13 historical 2022 candidate polygons and 9 documented sites. Catalog-wide HTTP point comparisons are distinct from the narrow V1 demonstration and from complete regional sampling. Resampling coarse data does not create detail, and uncertain historical coordinates cannot establish lander conditions at 100 m scale.

## Local geometry and disc fractions

Compute H(azimuth) from numerical terrain, lunar curvature and observer height, including near and distant terrain. Preserve incomplete directions; absent terrain must never become flat ground. Angular/radial sampling and outer radius require convergence studies.

Keep three separate angles: body-center elevation `e` above the local horizontal, terrain horizon `H` in that direction, and clearance `m=e-H`. For example, `e=2°`, `H=1.4°` gives `m=0.6°`. Clearance alone does not describe a disc crossing an irregular skyline or a solar eclipse.

| Quantity | Definition |
|---|---|
| `fSunTerrain` | Fraction of the solar disc not hidden by terrain |
| `fSun` | Fraction hidden by neither terrain nor Earth |
| `fEarth` | Geometric fraction of Earth's disc not hidden by terrain, independent of illuminated phase |

All fractions lie in `[0,1]`. Solar occultation uses the **union** of the terrain and Earth masks, not multiplication of their scalar fractions. Retain terrain/eclipse/combined causes. The initial Earth occulter is opaque; atmospheric and scattered-light effects are unmodeled and must be declared.

**C3 visibility means fraction ≥0.5**, for both Sun and Earth. This is a team convention, not a NASA charging or radio threshold. Center-above-horizon is only equivalent in an ideal uniform-horizon case without additional occultation.

| Solar condition | Definition |
|---|---|
| C3 visible | `fSun ≥ 0.5` |
| Reduced direct light | `0 < fSun < 0.5` |
| Complete direct darkness | `fSun = 0` |
| Below C3 | `fSun < 0.5`, including reduced light and darkness |

Full direct darkness does not imply no reflected light or any particular temperature. Numerical zero tolerances must be recorded and validated; they must not silently replace the physical definition.

## Point metrics and intervals

For each point/epoch retain Sun/Earth C3 states, fractions, elevations and terrain clearances; remaining current Sun/Earth windows; simultaneous windows; complete darkness and below-C3 intervals; slope and quality. Dates use the same duration so results are comparable.

Search only within `[T,T+duration)` and actual source coverage. Automatic extension beyond the requested interval is deferred. Search/refine crossings and check brief events even when adjacent coarse samples have the same state. Do not interpolate booleans or infer physical precision from the root solver's tolerance.

- If a condition is known false at T, remaining active-window time is zero. Unknown is null, not zero.
- If darkness already exists at T, report the observed remainder; its earlier start remains unknown unless already covered.
- Distinguish observed transitions, left/right request clipping and data gaps. A request/cache boundary is not sunset or Earthset.
- Without an observed end, return the investigated limit and verified duration lower bound, not zero, infinity or a completed duration. A total event duration requires both physical boundaries.
- Data gaps break verified continuity; never join intervals through unknown coverage.

Report metric-specific status/reasons and coverage. A metric that is unknown in V1 is null with a reason; deferred V2 metrics are omitted and identified as unsupported capabilities. Never serialize NaN/Infinity or fill missing science with synthetic data.

## Slope

Fit a plane in appropriate local metric coordinates over a **100 m diameter circular support** centered on the point. Preserve fit method, native resolution, valid samples, NoData, support and uncertainty. The support is distinct from a 100 × 100 m future grid and from a landing dispersion ellipse.

| Descriptive band | Exact range |
|---|---|
| 1 | `0° ≤ slope < 5°` |
| 2 | `5° ≤ slope < 10°` |
| 3 | `10° ≤ slope < 15°` |
| 4 | `slope ≥ 15°` |

Bands are common team conventions. **There is no automatic rejection at 10°.** Preserve the continuous value; do not label bands as universal vehicle capability. Insufficient support/resolution makes slope unavailable without automatically invalidating independent visibility metrics. If uncertainty crosses a band boundary, report classification instability. Numerical sensitivity is not physical DEM uncertainty, and mean slope does not resolve small rocks/craters.

## Deferred annual and permanent-shadow metrics

**P50** is the fraction of duration with `fSun ≥0.5` over a full UTC calendar year, from January 1 to the next January 1 (365/366 days), including eclipses and refined events. The ≥80% highlight is a team convention, not energy sufficiency. Never extrapolate an incomplete year; report covered-period statistics separately.

`Pany` (any solar disc visible) and time-mean `fSun` differ from P50. PGDA `AVGVISIB` comparisons require matched definition, height, period and occultation treatment. Gläser's **92.27%** is a multi-year result at a particular 2 m point, not a universal maximum or annual P50 benchmark [F7,F25].

PSR products are separate context, without automatic filtering or weights. One dark month does not establish permanent shadow; a surface PSR does not automatically describe an observer 2 m above the terrain.

VIPER's **50-hour** low-power hibernation reference and approximately nine hours of PSR operation are vehicle-specific context [F28], not universal warnings, survival thresholds or ranking weights. Diviner surface temperatures do not determine hardware temperatures without an engineering model [F27].

## Deferred regional aggregation

Use a 100 × 100 m sampling grid, with polygon clipping and lunar projection-area correction. Point measurements approximate a cell; they do not establish uniform conditions over every square metre. Verify that approximation with subsampling.

Let **B(T)** contain cells where both `fSun ≥0.5` and `fEarth ≥0.5`, with valid geometric data. Slope is not part of B.

| Output | Definition |
|---|---|
| B area | Area of jointly visible cells |
| A5 | Area of B with slope <5° |
| A10 | Area of B with slope <10° |
| A15 | Area of B with slope <15° |
| Connected area | Largest four-neighbour component of B and each cumulative subset |

A5/A10/A15 are cumulative and must not be summed. Report km², percentage of the full region, metric-specific valid area and missing area. Use area on the lunar reference surface, without a `1/cos(slope)` terrain-area multiplier. Only shared sides connect cells; corner contact and unknown cells do not join components. With partial coverage, known favorable area is a partial lower bound rather than a complete total.

Preserve metric-specific validity: slope can be unknown while geometry is known. Report no jointly visible cells for an entire region only with complete relevant coverage; disjoint Sun/Earth areas must not be misreported as absence of either body everywhere.

## Comparisons and date sensitivity

The scientific output uses explicit metrics and no universal weighted/lexicographic winner. Each ordering names its metric, direction, thresholds, date and coverage. Catalog order implies no preference. Complete totals and partial estimates must not be presented as equivalent.

Combined metrics for a point must come from the **same identified coordinate/cell**, with selection method. Maxima achieved at different points remain separate statistics, not the capabilities of an invented composite site.

V1 compares the same points at explicitly supplied epochs. Deferred date scans evaluate T and T±1/2/3 days at the same UTC time, preserving all results/gaps. Separate regional alternatives (B/A5/A10/A15 at each date) from persistence of the same cells (intersections). Compute advances `{T,T-1,…,T-k}` and delays `{T,T+1,…,T+k}` separately for k=1,2,3. A poor +1-day result does not erase a favorable +2-day result. Discrete dates do not prove continuity between them. Slope remains fixed; annual P50 changes if the selected year changes.

## Verification and completion

Required evidence includes analytic terrain/disc cases; Horizons parser, units/frame/height/time checks; independent intermediate-time interpolation queries; compatible PGDA slope comparisons; near/far terrain and event convergence; dated LROC observations; reproducible source/configuration manifests; and separate numerical error/physical uncertainty reporting.

Fix tolerances before comparisons and record method, case, source version, error and outcome. A skipped or incomplete required check is not a pass. Agreement between models sharing a DEM is not independent observational validation. Horizons self-comparison verifies acquisition/interpolation, not independent astronomical truth. NASA-STD-7009 is a methodological reference, not a claim of project conformance [F31].

The implemented V1 has versioned outputs and real reproducible demo data, but remains **observationally incomplete**. See the recorded [review](validazione-engine-v1-revisione.md) and [pending LROC protocol](protocollo-validazione-lroc-v2.md). Those results apply only to their documented points, dates, products and numerical configuration.

## References

Reference IDs are retained from the approved specification; omitted IDs are not reassigned.

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview* (2025). Architecture-specific slope/landing requirements, not universal limits. [NTRS](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf)
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge* (2021). Architecture-specific HLS tolerance. [NTRS](https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf)
- **[F3]** NASA Moon Trek, historical *Artemis III Candidate Landing Regions*, `A3_Named_regions_SP`. [Product](https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP)
- **[F5]** JPL [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
- **[F7]** E. Mazarico et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*. [NASA record](https://ntrs.nasa.gov/citations/20120010094), [PGDA products](https://pgda.gsfc.nasa.gov/products/69), [AVGVISIB definition](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/avgvisib_75s_120m_201608.lbl).
- **[F12]** NASA Space Apps, [Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
- **[F19]** M. K. Barker, NASA PGDA, [A New View of the Lunar South Pole from LOLA](https://pgda.gsfc.nasa.gov/products/90); [5 m DEM/error/clone products](https://pgda.gsfc.nasa.gov/products/78).
- **[F20]** NASA, [VIPER Lunar Operations](https://science.nasa.gov/mission/viper/lunar-operations/). Vehicle-specific slope context.
- **[F21]** NASA, [Blue Ghost Mission One Press Kit](https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf). Descent context; does not establish the withdrawn numerical slope thresholds.
- **[F22]** USGS, [Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma](https://www.usgs.gov/publications/lunar-vise-landing-site-selection-and-characterization-mons-gruithuisen-gamma). The abstract supports selection tradeoffs, not a mandatory 4 m support.
- **[F25]** Arizona Board of Regents/ASU, [Gläser et al. (2014)](https://experts.azregents.edu/en/publications/illumination-conditions-at-the-lunar-south-pole-using-high-resolu/). International research, 19-year illumination study; not a NASA standard.
- **[F26]** T. George et al., [Artemis III Site Selection Update](https://ntrs.nasa.gov/citations/20250011660). Architecture-dependent selection context.
- **[F27]** NASA PDS, [LRO Diviner](https://pds-geosciences.wustl.edu/missions/lro/diviner.htm).
- **[F28]** NASA NTRS, [VIPER specifications, slide 2](https://ntrs.nasa.gov/api/citations/20240013291/downloads/PESTO-VIPER-intro.pdf).
- **[F29]** H. J. Fincannon, NASA Glenn, [Lunar Environment and Lunar Power Needs](https://ntrs.nasa.gov/api/citations/20205002224/downloads/Lunar%20Environment%20and%20Lunar%20Power%20Needs_2.pdf).
- **[F30]** LROC, [WAC Time-Weighted South Pole Illumination Map](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH).
- **[F31]** NASA, [Standard for Models and Simulations](https://standards.nasa.gov/standard/NASA/NASA-STD-7009).
- **[F32]** JPL, [Horizons System Manual](https://ssd.jpl.nasa.gov/horizons/manual.html).
