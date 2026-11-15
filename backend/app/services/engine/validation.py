"""Evidenza su dati reali per il rapporto di validazione V1.

Ogni controllo misura uno scarto e lo confronta con una tolleranza fissata prima di vedere i
risultati (`config/analysis.tolerances.json`). Un esito negativo resta nel risultato: qui non
si cambia nessuna tolleranza. Confrontare l'interpolazione con lo stesso servizio verifica
l'acquisizione, non l'accuratezza astronomica di Horizons.
"""

import hashlib
import json
import time
from datetime import UTC, datetime

import numpy as np

from app.core.config import Settings as CoreSettings
from app.services.engine.acquisition import SourceFetcher, load_regions
from app.services.engine.cache import JsonCache
from app.services.engine.models import AnalysisRequest, to_iso, to_ms
from app.services.engine.orchestrator import EnginePaths, validate_points
from app.services.engine.scenario_stage import compute_scenario, load_tracks
from app.services.engine.terrain_stage import (
    compute_point_terrain,
    load_raster,
    plan_tiers,
    radial_tiers,
)
from app.services.engine.validation_metrics import validation_status
from app.services.ephemerides.interpolation import separation_deg
from app.services.terrain import moontrek_dem as dem
from app.services.terrain.horizon import HorizonProfile, RadialTier, compute_horizon
from app.services.terrain.slope import fit_slope, stereographic_scale
from app.services.visibility.discs import disc_fractions
from app.settings import Settings

PGDA_SLOPE_URL = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/LDRM_80S_50MPP_ADJ_SLP_100M.TIF"
ECLIPSE_T = "2025-03-13T12:00:00Z"  # finestra di 2 giorni attorno all'eclissi del 14/03/2025
ECLIPSE_DURATION_S = 2 * 86400


def _check(name: str, value: float | None, limit: float, unit: str, higher_is_better=False):
    if value is None or not np.isfinite(value):
        return {"metric": name, "value": None, "tolerance": limit, "unit": unit, "pass": None}
    ok = value >= limit if higher_is_better else value <= limit
    return {
        "metric": name,
        "value": float(value),
        "tolerance": limit,
        "unit": unit,
        "pass": bool(ok),
    }


def _ms(text: str) -> int:
    return to_ms(datetime.fromisoformat(text.replace("Z", "+00:00")))


def _transitions(scenario, name: str) -> list[int]:
    """Istanti delle transizioni osservate (non i bordi della richiesta o delle lacune)."""
    out = []
    for interval in getattr(scenario.windows, name):
        if interval.start_kind == "observed_transition":
            out.append(_ms(interval.start_utc))
        if interval.end_kind == "observed_transition":
            out.append(_ms(interval.end_utc))
    return sorted(out)


def _event_shift(base, variant) -> dict:
    result = {"count_match": True, "max_shift_s": 0.0, "transitions": 0, "by_window": {}}
    for name in ("sun_c3", "earth_c3", "joint_c3", "dark"):
        a, b = _transitions(base, name), _transitions(variant, name)

        def topology(scenario, window=name):
            return [(w.start_kind, w.end_kind) for w in getattr(scenario.windows, window)]

        same_topology = topology(base) == topology(variant)
        entry = {"base": len(a), "variant": len(b), "topology_match": same_topology}
        if len(a) == len(b) and same_topology:
            shift = max((abs(x - y) / 1000.0 for x, y in zip(a, b, strict=True)), default=0.0)
            entry["max_shift_s"] = shift
            result["max_shift_s"] = max(result["max_shift_s"], shift)
            result["transitions"] += len(a)
        else:
            result["count_match"] = False
        result["by_window"][name] = entry
    return result


def _fraction_change(base, variant) -> dict:
    """Variazione massima delle frazioni agli stessi istanti UTC."""
    index = {utc: k for k, utc in enumerate(variant.series.utc)}
    change = {"f_sun": 0.0, "f_earth": 0.0, "samples": 0, "status_changes": 0}
    pairs = (
        ("f_sun", base.series.sun.fraction_visible, variant.series.sun.fraction_visible),
        ("f_earth", base.series.earth.fraction_visible, variant.series.earth.fraction_visible),
    )
    for k, utc in enumerate(base.series.utc):
        j = index.get(utc)
        if j is None:
            continue
        change["samples"] += 1
        for name, a, b in pairs:
            if (a[k] is None) != (b[j] is None):
                change["status_changes"] += 1
            elif a[k] is not None:
                change[name] = max(change[name], abs(a[k] - b[j]))
    return change


def _subsample(profile: HorizonProfile, factor: int) -> HorizonProfile:
    return HorizonProfile(
        azimuth_step_deg=profile.azimuth_step_deg * factor,
        elevation_deg=profile.elevation_deg[::factor],
        complete=profile.complete[::factor],
        distance_m=profile.distance_m[::factor],
        ground_height_m=profile.ground_height_m,
        observer_radius_m=profile.observer_radius_m,
    )


# --- Controlli ---------------------------------------------------------------------------------


def check_interpolation(point, profile, t_ms, duration_s, numeric, fetcher, url, tol) -> dict:
    """Serie interpolata contro query Horizons dirette a metà passo, non usate dal calcolo."""
    duration_ms = int(round(duration_s * 1000))
    step_ms = numeric.ephemeris_step_s * 1000
    tracks, _ = load_tracks(point, t_ms, duration_ms, numeric, fetcher, url)
    _, _, direct = load_tracks(
        point, t_ms, duration_ms - step_ms, numeric, fetcher, url, step_ms // 2, True
    )
    times = direct["sun"].times_ms
    out = {"point": point.id, "t_utc": to_iso(t_ms), "independent_samples": int(times.size)}
    interp = {body: tracks[body].evaluate(times) for body in ("sun", "earth")}
    checks = []
    for body in ("sun", "earth"):
        table = direct[body]
        error = separation_deg(
            interp[body]["azimuth_deg"], interp[body]["elevation_deg"],
            table.azimuth_deg, table.elevation_deg,
        )  # fmt: skip
        radius = np.abs(interp[body]["radius_deg"] - table.angular_diameter_deg / 2.0)
        out[body] = {
            "direction_max_deg": float(np.nanmax(error)),
            "direction_mean_deg": float(np.nanmean(error)),
            "radius_max_deg": float(np.nanmax(radius)),
            "range_max_relative": float(
                np.nanmax(np.abs(interp[body]["range_km"] / table.range_km - 1.0))
            ),
        }
        checks.append(
            _check(f"{body}_direction_max", out[body]["direction_max_deg"],
                   tol["direction_max_abs_deg"], "deg")
        )  # fmt: skip
        checks.append(
            _check(f"{body}_radius_max", out[body]["radius_max_deg"],
                   tol["angular_radius_max_abs_deg"], "deg")
        )  # fmt: skip
    sep_direct = separation_deg(
        direct["sun"].azimuth_deg, direct["sun"].elevation_deg,
        direct["earth"].azimuth_deg, direct["earth"].elevation_deg,
    )  # fmt: skip
    sep_interp = separation_deg(
        interp["sun"]["azimuth_deg"], interp["sun"]["elevation_deg"],
        interp["earth"]["azimuth_deg"], interp["earth"]["elevation_deg"],
    )  # fmt: skip
    out["separation_max_deg"] = float(np.nanmax(np.abs(sep_direct - sep_interp)))
    checks.append(
        _check("sun_earth_separation_max", out["separation_max_deg"],
               tol["sun_earth_separation_max_abs_deg"], "deg")
    )  # fmt: skip

    # Effetto sulle frazioni dei dischi, con lo stesso orizzonte.
    def fractions(sun, earth):
        s = disc_fractions(profile.at, *sun, occulter=earth, strips=numeric.disc_strips)
        e = disc_fractions(profile.at, *earth, strips=numeric.disc_strips)
        return s.f_visible, e.f_visible

    def from_table(t):
        return t.azimuth_deg, t.elevation_deg, t.angular_diameter_deg / 2.0

    def from_track(v):
        return v["azimuth_deg"], v["elevation_deg"], v["radius_deg"]

    fd = fractions(from_table(direct["sun"]), from_table(direct["earth"]))
    fi = fractions(from_track(interp["sun"]), from_track(interp["earth"]))
    out["f_sun_max_change"] = float(np.nanmax(np.abs(fd[0] - fi[0])))
    out["f_earth_max_change"] = float(np.nanmax(np.abs(fd[1] - fi[1])))
    out["checks"] = checks
    return out


def slope_classification(reference, engine) -> dict:
    """Diagnostic only: rows = PGDA, columns = engine; no new acceptance threshold."""
    reference, engine = np.asarray(reference), np.asarray(engine)
    good = np.isfinite(reference) & np.isfinite(engine) & (reference >= 0) & (engine >= 0)
    ref, est = reference[good], engine[good]
    edges = np.array([5.0, 10.0, 15.0])
    rb, eb = np.searchsorted(edges, ref, side="right"), np.searchsorted(edges, est, side="right")
    matrix = np.zeros((4, 4), dtype=int)
    np.add.at(matrix, (rb, eb), 1)
    discordant = rb != eb
    return {
        "labels": ["[0,5)", "[5,10)", "[10,15)", ">=15"],
        "rows": "PGDA",
        "columns": "engine",
        "matrix": matrix.tolist(),
        "valid": int(good.sum()),
        "requested": int(reference.size),
        "agreement": float((rb == eb).mean()) if rb.size else None,
        "agreement_by_reference_class": [
            float(matrix[i, i] / matrix[i].sum()) if matrix[i].sum() else None for i in range(4)
        ],
        "adjacent_errors": int((np.abs(rb - eb) == 1).sum()),
        "nonadjacent_errors": int((np.abs(rb - eb) > 1).sum()),
        "absent_reference_classes": np.flatnonzero(matrix.sum(axis=1) == 0).tolist(),
        "discordances": [
            {
                "flat_index": int(index),
                "reference_deg": float(r),
                "engine_deg": float(e),
                "reference_distance_to_boundary_deg": float(np.min(np.abs(edges - r))),
                "engine_distance_to_boundary_deg": float(np.min(np.abs(edges - e))),
            }
            for index, r, e in zip(
                np.flatnonzero(good)[discordant], ref[discordant], est[discordant], strict=True
            )
        ],
    }


def check_pgda_slope(point, raster: dem.Raster, numeric, tol, half_nodes: int = 5) -> dict:
    """Pendenza dell'engine sui centri dei pixel PGDA (griglia a 50 m, base 100 m)."""
    import rasterio
    import requests
    from rasterio.windows import Window

    scale = stereographic_scale(point.lat_deg)
    head = requests.head(PGDA_SLOPE_URL, timeout=30)
    with rasterio.Env(
        GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF"
    ):
        with rasterio.open("/vsicurl/" + PGDA_SLOPE_URL) as source:
            transform, crs = source.transform, source.crs.to_dict()
            col = int((point.x_m - transform.c) // transform.a)
            row = int((transform.f - point.y_m) // -transform.e)
            window = Window(
                col - half_nodes, row - half_nodes, 2 * half_nodes + 1, 2 * half_nodes + 1
            )
            reference = source.read(1, window=window, masked=True).astype(float).filled(np.nan)
    if abs(float(crs.get("R", 0)) - 1737400.0) > 0.5 or crs.get("proj") != "stere":
        raise dem.TerrainError(f"PGDA: sistema di riferimento inatteso {crs}")
    engine = np.full(reference.shape, np.nan)
    for r in range(reference.shape[0]):
        for c in range(reference.shape[1]):
            x = transform.c + (col - half_nodes + c + 0.5) * transform.a
            y = transform.f + (row - half_nodes + r + 0.5) * transform.e
            fit = fit_slope(raster, x, y, scale, numeric.slope_diameter_m, numeric.slope_min_pixels)
            if fit.slope_deg is not None:
                engine[r, c] = fit.slope_deg
    difference = engine - reference
    good = np.isfinite(difference)
    absolute = np.abs(difference[good])
    centre = (half_nodes, half_nodes)
    out = {
        "point": point.id,
        "engine_dem": raster.label,
        "reference": {
            "product": "NASA GSFC PGDA product 90, LDRM_80S_50MPP_ADJ_SLP_100M.TIF",
            "url": PGDA_SLOPE_URL,
            "etag": head.headers.get("ETag"),
            "last_modified": head.headers.get("Last-Modified"),
            "content_length": head.headers.get("Content-Length"),
            "pixel_m": transform.a,
            "window_origin_col_row": [col - half_nodes, row - half_nodes],
            "window_sha256": hashlib.sha256(reference.astype("<f4").tobytes()).hexdigest(),
            "access": "lettura a finestra (COG, HTTP range), solo per il confronto",
        },
        "classification": slope_classification(reference, engine),
        "samples": {
            "reference_deg": np.where(np.isfinite(reference), reference, None).tolist(),
            "engine_deg": np.where(np.isfinite(engine), engine, None).tolist(),
        },
        "nodes": int(good.sum()),
        "nodes_requested": int(reference.size),
        "engine_at_point_deg": point.slope.value_deg,
        "engine_at_nearest_node_deg": float(engine[centre]),
        "pgda_at_nearest_node_deg": float(reference[centre]),
        "signed_mean_deg": float(difference[good].mean()),
        "median_abs_deg": float(np.median(absolute)),
        "p95_abs_deg": float(np.percentile(absolute, 95)),
        "max_abs_deg": float(absolute.max()),
        "correlation": float(np.corrcoef(engine[good], reference[good])[0, 1]),
    }
    out["checks"] = [
        _check("pgda_median_abs_difference", out["median_abs_deg"],
               tol["pgda_median_abs_difference_deg"], "deg"),
        _check("pgda_p95_abs_difference", out["p95_abs_deg"],
               tol["pgda_p95_abs_difference_deg"], "deg"),
    ]  # fmt: skip
    return out


def check_horizon_convergence(point_request, plans, stack, numeric, height, tol) -> tuple:
    """Passo in azimut, passo radiale e raggio massimo sul terreno reale."""
    lat, lon = point_request.lat_deg, point_request.lon_east_deg
    tiers = radial_tiers(plans)
    fine_step = numeric.azimuth_step_deg / 2.0
    relative = numeric.radial_relative_step
    fine = compute_horizon(stack, lat, lon, height, fine_step, tiers, relative)
    azimuth = {}
    for factor in (2, 4, 8):
        coarse = _subsample(fine, factor)
        error = coarse.at(fine.azimuth_deg) - fine.elevation_deg
        azimuth[f"{fine_step * factor:g}"] = {
            "rms_deg": float(np.sqrt(np.nanmean(error**2))),
            "max_abs_deg": float(np.nanmax(np.abs(error))),
        }
    default = _subsample(fine, 2)  # il profilo usato dall'engine
    # Passo radiale dimezzato: sia il passo delle fasce sia quello proporzionale alla distanza.
    halved = compute_horizon(
        stack, lat, lon, height, default.azimuth_step_deg,
        [RadialTier(t.inner_m, t.outer_m, t.step_m / 2.0, t.start) for t in tiers],
        relative / 2.0,
    )  # fmt: skip
    coarse = _subsample(fine, 16)  # stesse direzioni per il confronto sul raggio massimo
    reduced_outer = 0.75 * tiers[-1].outer_m
    reduced = compute_horizon(
        stack, lat, lon, height, coarse.azimuth_step_deg,
        tiers[:-1] + [RadialTier(tiers[-1].inner_m, reduced_outer, tiers[-1].step_m,
                                 tiers[-1].start)],
        relative,
    )  # fmt: skip
    radial = float(np.nanmax(np.abs(halved.elevation_deg - default.elevation_deg)))
    radius = float(np.nanmax(np.abs(reduced.elevation_deg - coarse.elevation_deg)))
    default_key = f"{numeric.azimuth_step_deg:g}"
    out = {
        "point": point_request.id,
        "azimuth_step_vs_finest": azimuth,
        "finest_step_deg": fine_step,
        "radial_step_halved_max_abs_deg": radial,
        "radial_step_halved_rms_deg": float(
            np.sqrt(np.nanmean((halved.elevation_deg - default.elevation_deg) ** 2))
        ),
        "max_radius_m": tiers[-1].outer_m,
        "reduced_radius_m": reduced_outer,
        "reduced_radius_max_abs_deg": radius,
        "farthest_horizon_defining_terrain_m": float(np.nanmax(fine.distance_m)),
        "directions_defined_beyond_reduced_radius": int(
            np.sum(fine.distance_m > reduced_outer)
        ),
        "checks": [
            _check(f"azimuth_{default_key}_vs_{fine_step:g}_rms",
                   azimuth[default_key]["rms_deg"], tol["azimuth_refinement_rms_deg"], "deg"),
            _check("radial_step_halved_max", radial, tol["radial_refinement_max_abs_deg"], "deg"),
            _check("max_radius_reduced_max", radius, tol["max_radius_reduction_max_abs_deg"],
                   "deg"),
        ],
    }  # fmt: skip
    return out, fine, halved


def check_scenario_convergence(
    point, profile, fine_profile, radial_profile, t_ms, duration_s, numeric, fetcher, url,
    tolerances,
) -> dict:  # fmt: skip
    """Effetto di orizzonte più fitto, più strisce, scansione e effemeridi più fitte."""
    duration_ms = int(round(duration_s * 1000))
    tracks, info = load_tracks(point, t_ms, duration_ms, numeric, fetcher, url)
    base = compute_scenario(point, profile, t_ms, duration_s, numeric, tracks, info, None)
    half_step = numeric.model_copy(update={"ephemeris_step_s": numeric.ephemeris_step_s // 2})
    tracks_half, info_half = load_tracks(point, t_ms, duration_ms, half_step, fetcher, url)
    variants = {
        "azimuth_step_halved": compute_scenario(
            point, fine_profile, t_ms, duration_s, numeric, tracks, info, None
        ),
        "radial_step_halved": compute_scenario(
            point, radial_profile, t_ms, duration_s, numeric, tracks, info, None
        ),
        "disc_strips_doubled": compute_scenario(
            point, profile, t_ms, duration_s,
            numeric.model_copy(update={"disc_strips": numeric.disc_strips * 2}),
            tracks, info, None,
        ),
        "scan_step_divided_by_3": compute_scenario(
            point, profile, t_ms, duration_s,
            numeric.model_copy(update={"scan_step_s": numeric.scan_step_s / 3.0}),
            tracks, info, None,
        ),
        "ephemeris_step_halved": compute_scenario(
            point, profile, t_ms, duration_s, half_step, tracks_half, info_half, None
        ),
    }  # fmt: skip
    out = {"point": point.id, "t_utc": to_iso(t_ms), "variants": {}, "checks": []}
    f_tol, e_tol = tolerances["fractions"], tolerances["events"]
    for name, variant in variants.items():
        fractions, events = _fraction_change(base, variant), _event_shift(base, variant)
        out["variants"][name] = {"fractions": fractions, "events": events}
        out["checks"].append(
            _check(f"{name}:fraction_max_change", max(fractions["f_sun"], fractions["f_earth"]),
                   f_tol["max_abs_change"], "fraction")
        )  # fmt: skip
        shift = events["max_shift_s"] if events["count_match"] else None
        check = _check(f"{name}:event_max_shift", shift, e_tol["convergence_max_shift_s"], "s")
        if not events["count_match"]:
            check["pass"] = False
            check["note"] = "numero di transizioni diverso"
        out["checks"].append(check)
    return out


def check_dem_alignment(point, plans, fetcher: SourceFetcher, base_url: str) -> list[dict]:
    """I tasselli devono essere pixel nativi: un blocco chiesto a doppia risoluzione con
    nearest neighbour deve replicare 2x2 gli stessi valori."""
    import rasterio

    out = []
    for plan in plans:
        product = plan.product
        i, j, path, _ = plan.tiles[0]
        col0, row0, width, height = dem.tile_bounds(product, i, j)
        tile = dem.read_tile(path, product, i, j)
        a, b, n = width // 2, height // 2, 16
        x0 = product.xmin + (col0 + a) * product.pixel_m
        y1 = product.ymax - (row0 + b) * product.pixel_m
        entry = {
            "name": f"engine-dem-check-{product.label.lower()}"[:80],
            "provider": "moon_trek",
            "format": "tiff",
            "url": dem.service_url(base_url, product) + "/exportImage",
            "params": {
                "bbox": f"{x0:.3f},{y1 - n * product.pixel_m:.3f},"
                f"{x0 + n * product.pixel_m:.3f},{y1:.3f}",
                "size": f"{2 * n},{2 * n}",
                "format": "tiff",
                "pixelType": product.pixel_type,
                "interpolation": "RSP_NearestNeighbor",
                "f": "image",
            },
        }
        check_path, _ = fetcher.get(entry, "dem_alignment_check", {"product": product.label})
        with rasterio.open(check_path) as source:
            doubled = source.read(1).astype(float)
        native = tile[b : b + n, a : a + n].astype(float)
        difference = np.abs(doubled - np.kron(native, np.ones((2, 2))))
        out.append(
            {
                "point": point.id,
                "product": product.label,
                "block_px": n,
                "max_abs_difference_m": float(np.nanmax(difference)),
                "pass": bool(np.nanmax(difference) == 0.0),
            }
        )
    return out


def check_real_eclipse(point, profile, numeric, fetcher, url) -> dict:
    """Occultazione del Sole da parte della Terra su dati reali: eclissi lunare del 14/03/2025."""
    t_ms = _ms(ECLIPSE_T)
    tracks, info = load_tracks(point, t_ms, ECLIPSE_DURATION_S * 1000, numeric, fetcher, url)
    scenario = compute_scenario(
        point, profile, t_ms, ECLIPSE_DURATION_S, numeric, tracks, info, None
    )
    minutes = np.arange(t_ms, t_ms + ECLIPSE_DURATION_S * 1000 + 1, 60_000, dtype=np.int64)
    sun, earth = tracks["sun"].evaluate(minutes), tracks["earth"].evaluate(minutes)
    separation = separation_deg(
        sun["azimuth_deg"], sun["elevation_deg"], earth["azimuth_deg"], earth["elevation_deg"]
    )
    k = int(np.nanargmin(separation))
    intervals = [w.model_dump(mode="json") for w in scenario.windows.earth_over_sun_disc]
    total_possible = bool(separation[k] < earth["radius_deg"][k] - sun["radius_deg"][k])
    peak = max((w["peak_sun_fraction_covered_by_earth"] or 0.0 for w in intervals), default=0.0)
    return {
        "point": point.id,
        "window_start_utc": ECLIPSE_T,
        "duration_s": ECLIPSE_DURATION_S,
        "minimum_separation_deg": float(separation[k]),
        "minimum_separation_utc": to_iso(int(minutes[k])),
        "sun_radius_deg": float(sun["radius_deg"][k]),
        "earth_radius_deg": float(earth["radius_deg"][k]),
        "sun_elevation_at_minimum_deg": float(sun["elevation_deg"][k]),
        "sun_horizon_at_minimum_deg": float(profile.at(sun["azimuth_deg"][k])),
        "earth_over_sun_disc": intervals,
        "peak_cover": peak,
        "geometry_says_total": total_possible,
        "consistent": bool((peak >= 1.0 - 1e-6) == total_possible),
        "dark_intervals": [w.model_dump(mode="json") for w in scenario.windows.dark],
        "below_c3_intervals": [w.model_dump(mode="json") for w in scenario.windows.below_c3],
    }


def run_validation(
    request: AnalysisRequest,
    tolerances: dict,
    *,
    paths: EnginePaths,
    core: CoreSettings,
    settings: Settings | None = None,
    checks: set[str] | None = None,
) -> dict:
    settings = settings or Settings()
    wanted = checks or {"interpolation", "slope", "convergence", "alignment", "eclipse", "lroc"}
    numeric = request.numeric
    evidence = {
        "schema": "meowrizon.analysis.validation/1",
        "tolerances_fixed_on": tolerances.get("fixed_on"),
        "request": request.description,
        "checks_run": sorted(wanted),
    }
    started = time.perf_counter()
    with SourceFetcher(paths.raw, settings.user_agent, paths.lock, False) as fetcher:
        regions = load_regions(core, fetcher)
        validate_points(request, regions)
        cache = JsonCache(paths.terrain_cache)
        for name in (
            "interpolation", "slope", "horizon", "scenarios", "alignment", "eclipse", "lroc"
        ):  # fmt: skip
            evidence[name] = []
        for point_request in request.points:
            tiers = request.terrain[point_request.region]
            point, profile, _ = compute_point_terrain(
                point_request, tiers, numeric, request.observer_height_m, fetcher,
                core.moontrek_base_url, cache,
            )  # fmt: skip
            plans = plan_tiers(
                point_request.lat_deg, point_request.lon_east_deg, tiers,
                numeric.min_distance_m, fetcher, core.moontrek_base_url,
            )  # fmt: skip
            rasters = [load_raster(p.product, p.bbox, p.tiles) for p in plans]
            stack = dem.TerrainStack(rasters)
            if "alignment" in wanted:
                evidence["alignment"] += check_dem_alignment(
                    point, plans, fetcher, core.moontrek_base_url
                )
            if "slope" in wanted:
                evidence["slope"].append(
                    check_pgda_slope(point, rasters[0], numeric, tolerances["slope"])
                )
            fine = radial = None
            if "convergence" in wanted:
                horizon, fine, radial = check_horizon_convergence(
                    point_request, plans, stack, numeric, request.observer_height_m,
                    tolerances["horizon"],
                )  # fmt: skip
                evidence["horizon"].append(horizon)
            for epoch in request.epochs_utc:
                t_ms = to_ms(epoch)
                if "interpolation" in wanted:
                    evidence["interpolation"].append(
                        check_interpolation(
                            point,
                            profile,
                            t_ms,
                            request.duration_s,
                            numeric,
                            fetcher,
                            core.horizons_api_url,
                            tolerances["interpolation"],
                        )  # fmt: skip
                    )
                if fine is not None:
                    evidence["scenarios"].append(
                        check_scenario_convergence(
                            point,
                            profile,
                            fine,
                            radial,
                            t_ms,
                            request.duration_s,
                            numeric,
                            fetcher,
                            core.horizons_api_url,
                            tolerances,
                        )  # fmt: skip
                    )
            if "eclipse" in wanted:
                evidence["eclipse"].append(
                    check_real_eclipse(point, profile, numeric, fetcher, core.horizons_api_url)
                )
        if "lroc" in wanted:
            from app.services.engine import lroc_check

            for site, product in lroc_check.DEFAULT_IMAGES:
                evidence["lroc"].append(
                    lroc_check.check_image(
                        site,
                        product,
                        request,
                        regions[lroc_check.REGION].polygon_m,
                        fetcher,
                        core,
                        settings,
                        paths,
                        tolerances["lroc"],
                    )  # fmt: skip
                )
        evidence["sources"] = fetcher.sorted_records()
    all_checks = [
        check
        for group in ("interpolation", "slope", "horizon", "scenarios")
        for item in evidence[group]
        for check in item["checks"]
    ]
    evidence["summary"] = {
        "checks": len(all_checks),
        "passed": sum(c["pass"] is True for c in all_checks),
        "failed": sum(c["pass"] is False for c in all_checks),
        "not_evaluated": sum(c["pass"] is None for c in all_checks),
        "alignment_passed": (
            all(a["pass"] for a in evidence["alignment"]) if evidence["alignment"] else None
        ),
        "lroc_images": len(evidence["lroc"]),
        "lroc_passed": sum(item.get("pass") is True for item in evidence["lroc"]),
        "lroc_failed": sum(item.get("pass") is False for item in evidence["lroc"]),
        "elapsed_s": round(time.perf_counter() - started, 1),
    }
    evidence["summary"].update(validation_status(evidence))
    return evidence


def write_evidence(evidence: dict, paths: EnginePaths, name: str | None = None):
    folder = paths.root / "validation"
    folder.mkdir(parents=True, exist_ok=True)
    name = name or datetime.now(UTC).strftime("evidence-%Y%m%dT%H%M%S-%fZ.json")
    path = folder / name
    if path.exists():
        raise FileExistsError(f"Evidence already exists: {path}")
    path.write_text(
        json.dumps(evidence, ensure_ascii=False, indent=1, allow_nan=False) + "\n", encoding="utf-8"
    )
    return path
