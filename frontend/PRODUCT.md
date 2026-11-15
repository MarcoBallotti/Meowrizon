# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- Students exploring why some lunar sites see the Sun and the Earth and others do not.
- Teachers presenting the same scenes on a classroom projector or interactive whiteboard.
- Mission planners comparing sites and dates with technical data, free coordinates and A/B comparisons.
One global audience switch (Student / Teacher / Planner) adapts the whole app; there is no local Simple/Detailed toggle.

## Product Purpose
Moonrizon compares lunar locations and dates using the real terrain horizon, sunlight and geometric Earth visibility. It is built for the NASA Space Apps Challenge 2026, challenge "Lunar Landing Site Navigator". Success: anyone can see, from the ground of a site, when the Sun and the Earth are above the local horizon, and compare sites against stated mission requirements.

## Positioning
The local horizon simulator: a first-person view of the sky from the site, where the far ridge is the engine's terrain horizon from LRO-LOLA and the Sun and Earth sit at their true apparent size from JPL Horizons. Today the same answer needs QuickMap, Moon Trek, JPL Horizons and mission portals used separately.

## Operating Context
Judged at Space Apps (pitch deck + demo video), used in classrooms on projectors, and by planners at a desk. UI language is English only.

## Capabilities and Constraints
- 3D Moon globe, local horizon scene, timeline with eclipses, reports, comparison of up to four points.
- Catalog: 13 historical 2022 Artemis candidate regions and 16 documented sites. A region center is a point estimate.
- Site classifier: mission requirements gate (sunlight, Earth visibility, simultaneous visibility, outages, shared window, slope, roughness, DEM resolution, optional battery), then Pareto fronts, then a secondary visibility index (harmonic mean of the three visibility fractions × continuity).
- Results support preliminary comparison; they do not certify landing safety, power availability or radio performance. Independent LROC validation, regional grids and annual statistics are future work.
- No login or accounts exist.

## Brand Commitments
- Name in the pitch: Moonrizon (code also carries the earlier name Meowrizon).
- Logo: "dome cat", a dome with cat ears on the horizon with two suns (small ochre above, larger sky blue below), see `public/favicon.svg`.

## Evidence on Hand
Real NASA data sources (LRO-LOLA, JPL Horizons), the catalog above, the running app. No users, testimonials, benchmarks or validation results beyond `docs/validazione-engine-v1-revisione.md` exist; do not invent any.

## Product Principles
1. Show the horizon, not a number: the scene is the answer.
2. Every number keeps its source and its limits.
3. Same data, three depths: student, teacher, planner.
4. Calm motion: no camera rotations.

## Accessibility & Inclusion
Must read on a classroom projector: large type, strong contrast, colour never carries meaning alone.
