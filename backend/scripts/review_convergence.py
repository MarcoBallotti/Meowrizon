"""Reproduce the grazing event with successive independent azimuth refinements."""

import json
import time

from app.core.config import get_settings
from app.services.engine.acquisition import SourceFetcher
from app.services.engine.cache import JsonCache
from app.services.engine.models import to_ms
from app.services.engine.orchestrator import EnginePaths, load_request
from app.services.engine.scenario_stage import compute_scenario, load_tracks
from app.services.engine.terrain_stage import (
    compute_point_terrain,
    load_raster,
    plan_tiers,
    radial_tiers,
)
from app.services.engine.validation import _event_shift
from app.services.terrain.horizon import compute_horizon
from app.services.terrain.moontrek_dem import TerrainStack
from app.settings import Settings

request = load_request("config/analysis.demo.json")
paths, core, settings = EnginePaths.default(), get_settings(), Settings()
folder = paths.root / "validation/review-20261115"
folder.mkdir(parents=True, exist_ok=True)
rows = []
with SourceFetcher(paths.raw, settings.user_agent, paths.lock, True) as fetcher:
    pr = request.points[1]
    point, profile, _ = compute_point_terrain(
        pr,
        request.terrain[pr.region],
        request.numeric,
        2.0,
        fetcher,
        core.moontrek_base_url,
        JsonCache(paths.terrain_cache),
    )
    plans = plan_tiers(
        pr.lat_deg,
        pr.lon_east_deg,
        request.terrain[pr.region],
        request.numeric.min_distance_m,
        fetcher,
        core.moontrek_base_url,
    )
    stack = TerrainStack([load_raster(p.product, p.bbox, p.tiles) for p in plans])
    t = to_ms(request.epochs_utc[-1])
    tracks, info = load_tracks(
        point, t, int(request.duration_s * 1000), request.numeric, fetcher, core.horizons_api_url
    )
    previous = None
    for step in [0.125, 0.0625, 0.03125, 0.015625]:
        start = time.perf_counter()
        horizon = compute_horizon(
            stack,
            pr.lat_deg,
            pr.lon_east_deg,
            2.0,
            step,
            radial_tiers(plans),
            request.numeric.radial_relative_step,
        )
        scenario = compute_scenario(
            point, horizon, t, request.duration_s, request.numeric, tracks, info, None
        )
        row = {
            "step_deg": step,
            "elapsed_s": time.perf_counter() - start,
            "shift_from_previous": _event_shift(previous, scenario) if previous else None,
            "dark": [w.model_dump(mode="json") for w in scenario.windows.dark],
        }
        rows.append(row)
        (folder / "azimuth-ladder.json").write_text(json.dumps(rows, indent=2))
        print(step, row["elapsed_s"], row["shift_from_previous"], flush=True)
        previous = scenario
