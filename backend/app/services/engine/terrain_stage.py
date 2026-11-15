"""Terreno per punto: quota, pendenza e orizzonte. Non dipende dalla data, quindi si riusa."""

import json
import math
from dataclasses import dataclass

import numpy as np

from app.core.moon import MOON_RADIUS_M, lonlat_to_stereo
from app.services.engine.acquisition import SourceFetcher
from app.services.engine.cache import JsonCache, key_of
from app.services.engine.models import (
    ALGORITHM_VERSION,
    HorizonResult,
    Measure,
    NumericConfig,
    PointRequest,
    PointResult,
    SlopeResult,
    TierRequest,
    TierUsed,
)
from app.services.terrain import moontrek_dem as dem
from app.services.terrain.horizon import (
    HorizonProfile,
    RadialTier,
    compute_horizon,
    destination,
    lonlat_to_xy,
)
from app.services.terrain.slope import (
    BAND_LABELS,
    circular_support,
    fit_slope,
    slope_band,
    stereographic_scale,
)

DEM_UNCERTAINTY = (
    "non quantificata: Moon Trek non distribuisce un layer numerico di errore per questo "
    "prodotto; la sensibilità riportata è soltanto numerica"
)


def clean(values) -> list:
    """Array -> lista JSON, con null al posto dei valori non finiti."""
    return [float(v) if np.isfinite(v) else None for v in np.asarray(values, dtype=float)]


@dataclass
class TierPlan:
    product: dem.DemProduct
    inner_m: float
    outer_m: float
    step_m: float
    bbox: tuple[float, float, float, float]
    tiles: list[tuple[int, int, object, str]]  # i, j, percorso, sha256


def _plan_product(product, bbox, fetcher: SourceFetcher, base_url: str, role: str):
    path, _ = fetcher.get(dem.metadata_entry(base_url, product), "dem_service_metadata")
    info = dem.check_metadata(product, json.loads(path.read_text(encoding="utf-8")))
    window = dem.window_pixels(product, bbox)
    if window is None:
        raise dem.TerrainError(f"{product.label} non copre l'area richiesta")
    col0, row0, col1, row1 = window
    tiles = []
    for j in range(row0 // dem.TILE_PX, (row1 - 1) // dem.TILE_PX + 1):
        for i in range(col0 // dem.TILE_PX, (col1 - 1) // dem.TILE_PX + 1):
            details = {
                "product": product.label,
                "tile": [i, j],
                "tile_px": dem.TILE_PX,
                "pixel_m": product.pixel_m,
                "family": product.family,
                "origin": product.origin,
                "vertical_reference": info["vertical_reference"],
                "resampling": "RSP_NearestNeighbor su griglia nativa",
            }
            tile_path, sha = fetcher.get(dem.tile_entry(base_url, product, i, j), role, details)
            tiles.append((i, j, tile_path, sha))
    return tiles


def plan_tiers(
    lat_deg: float,
    lon_deg: float,
    tiers: list[TierRequest],
    min_distance_m: float,
    fetcher: SourceFetcher,
    base_url: str,
    margin_m: float = 0.0,
) -> list[TierPlan]:
    """Individua (e acquisisce o ritrova in cache) i tasselli necessari a ogni fascia."""
    x, y = lonlat_to_stereo(lon_deg, lat_deg)
    plans, inner = [], min_distance_m
    for tier in tiers:
        if tier.product not in dem.PRODUCTS:
            raise dem.TerrainError(f"Prodotto DEM non registrato: {tier.product}")
        product = dem.PRODUCTS[tier.product]
        # Il cerchio di raggio `outer` sul terreno non è un cerchio sulla mappa: la scala
        # della stereografica cresce allontanandosi dal polo. Si proietta il bordo vero.
        ring = destination(
            math.radians(lat_deg),
            math.radians(lon_deg),
            np.radians(np.arange(0.0, 360.0, 1.0)),
            tier.outer_radius_m / MOON_RADIUS_M,
        )
        ring_x, ring_y = lonlat_to_xy(*ring)
        pad = 2 * product.pixel_m + 1e-4 * tier.outer_radius_m + margin_m
        bbox = (
            min(float(ring_x.min()), x) - pad,
            min(float(ring_y.min()), y) - pad,
            max(float(ring_x.max()), x) + pad,
            max(float(ring_y.max()), y) + pad,
        )
        tiles = _plan_product(product, bbox, fetcher, base_url, "dem_tile")
        plans.append(TierPlan(product, inner, tier.outer_radius_m, tier.radial_step_m, bbox, tiles))
        inner = tier.outer_radius_m
    return plans


def load_raster(product: dem.DemProduct, bbox, tiles) -> dem.Raster:
    lookup = {(i, j): path for i, j, path, _ in tiles}

    def get_tile(i, j):
        return dem.read_tile(lookup[(i, j)], product, i, j), None

    raster, _ = dem.load_window(product, bbox, get_tile)
    return raster


def load_stack(plans: list[TierPlan]) -> dem.TerrainStack:
    return dem.TerrainStack([load_raster(p.product, p.bbox, p.tiles) for p in plans])


def radial_tiers(plans: list[TierPlan]) -> list[RadialTier]:
    return [RadialTier(p.inner_m, p.outer_m, p.step_m, k) for k, p in enumerate(plans)]


def seam_statistics(fine: dem.Raster, coarse: dem.Raster, limit: int = 20000) -> dict | None:
    """Differenza di quota fra due griglie nei centri dei pixel grossolani che la fine copre."""
    xmin, ymin, xmax, ymax = fine.bounds
    cx = np.arange(coarse.x0 + coarse.pixel_m / 2, coarse.bounds[2], coarse.pixel_m)
    cy = np.arange(coarse.y1 - coarse.pixel_m / 2, coarse.bounds[1], -coarse.pixel_m)
    cx = cx[(cx > xmin + fine.pixel_m) & (cx < xmax - fine.pixel_m)]
    cy = cy[(cy > ymin + fine.pixel_m) & (cy < ymax - fine.pixel_m)]
    if cx.size == 0 or cy.size == 0:
        return None
    stride = max(1, math.ceil(math.sqrt(cx.size * cy.size / limit)))
    gx, gy = np.meshgrid(cx[::stride], cy[::stride])
    difference = fine.sample(gx, gy) - coarse.sample(gx, gy)
    difference = difference[np.isfinite(difference)]
    if difference.size == 0:
        return None
    return {
        "fine": fine.label,
        "coarse": coarse.label,
        "samples": int(difference.size),
        "mean_m": float(difference.mean()),
        "median_m": float(np.median(difference)),
        "std_m": float(difference.std()),
        "p95_abs_m": float(np.percentile(np.abs(difference), 95)),
        "max_abs_m": float(np.abs(difference).max()),
    }


def measure_slope(
    raster: dem.Raster,
    x: float,
    y: float,
    scale: float,
    numeric: NumericConfig,
    count_raster: dem.Raster | None,
    count_product: str | None,
) -> SlopeResult:
    diameter = numeric.slope_diameter_m
    fit = fit_slope(raster, x, y, scale, diameter, numeric.slope_min_pixels)
    sensitivity, stable, band = None, None, None
    if fit.slope_deg is not None:
        band = slope_band(fit.slope_deg)
        px = raster.pixel_m
        variants = [
            fit_slope(raster, x, y, scale, diameter * factor, numeric.slope_min_pixels)
            for factor in (0.9, 1.1)
        ] + [
            fit_slope(raster, x + dx, y + dy, scale, diameter, numeric.slope_min_pixels)
            for dx, dy in ((px, 0), (-px, 0), (0, px), (0, -px))
        ]
        values = [v.slope_deg for v in variants if v.slope_deg is not None]
        if values:
            sensitivity = max(abs(v - fit.slope_deg) for v in values)
            stable = all(slope_band(v) == band for v in values)
    shots = None
    if count_raster is not None:
        counts = circular_support(count_raster, x, y, scale, diameter)
        if counts.inside_raster and np.isfinite(counts.values).all() and counts.n_expected:
            shots = float((counts.values > 0).mean())
    return SlopeResult(
        value_deg=fit.slope_deg,
        status=fit.status,
        reason=fit.reason,
        band=band,
        band_label=BAND_LABELS[band - 1] if band else None,
        support="circular, least-squares plane in local ground metres",
        diameter_m=diameter,
        dem_product=raster.label,
        dem_pixel_m=raster.pixel_m,
        n_pixels=fit.n_pixels,
        valid_fraction=fit.valid_fraction,
        rms_residual_m=fit.rms_residual_m,
        numeric_sensitivity_deg=sensitivity,
        band_stable_under_sensitivity=stable,
        lola_count_product=count_product if count_raster is not None else None,
        support_fraction_with_lola_shots=shots,
        dem_uncertainty=DEM_UNCERTAINTY,
    )


def horizon_result(profile: HorizonProfile) -> HorizonResult:
    complete = int(profile.complete.sum())
    total = int(profile.complete.size)
    return HorizonResult(
        azimuth_start_deg=0.0,
        azimuth_step_deg=profile.azimuth_step_deg,
        convention=(
            "elevazione del terreno rispetto al piano perpendicolare alla verticale radiale "
            "dell'osservatore; azimut da nord verso est; curvatura della sfera inclusa"
        ),
        elevation_deg=clean(profile.elevation_deg),
        complete=[bool(v) for v in profile.complete],
        distance_m=clean(profile.distance_m),
        directions=total,
        directions_complete=complete,
        status="ok" if complete == total else "approximate",
        reason=None
        if complete == total
        else f"{total - complete} direzioni senza copertura completa del terreno",
    )


def profile_from_result(point: PointResult) -> HorizonProfile | None:
    if point.horizon is None or point.observer_radius_m is None:
        return None
    h = point.horizon
    to_array = lambda values: np.array(  # noqa: E731
        [np.nan if v is None else v for v in values], dtype=float
    )
    return HorizonProfile(
        azimuth_step_deg=h.azimuth_step_deg,
        elevation_deg=to_array(h.elevation_deg),
        complete=np.array(h.complete, dtype=bool),
        distance_m=to_array(h.distance_m),
        ground_height_m=point.elevation.value,
        observer_radius_m=point.observer_radius_m,
    )


def _failed_point(request: PointRequest, x, y, scale, height, reason: str) -> PointResult:
    return PointResult(
        id=request.id,
        region=request.region,
        lat_deg=request.lat_deg,
        lon_east_deg=request.lon_east_deg % 360.0,
        x_m=x,
        y_m=y,
        map_scale=scale,
        selection=request.selection,
        elevation=Measure(value=None, unit="m", status="unknown", reason=reason),
        elevation_product=None,
        observer_height_m=height,
        observer_radius_m=None,
        horizons_site_alt_km=None,
        tiers=[],
        tier_seams=[],
        slope=SlopeResult(
            value_deg=None,
            status="unknown",
            reason=reason,
            band=None,
            band_label=None,
            support="circular, least-squares plane in local ground metres",
            diameter_m=100.0,
            dem_product=None,
            dem_pixel_m=None,
            n_pixels=0,
            valid_fraction=None,
            rms_residual_m=None,
            numeric_sensitivity_deg=None,
            band_stable_under_sensitivity=None,
            lola_count_product=None,
            support_fraction_with_lola_shots=None,
            dem_uncertainty=DEM_UNCERTAINTY,
        ),  # fmt: skip
        horizon=None,
        terrain_cache_key=None,
        status="unknown",
        reason=reason,
    )


def compute_point_terrain(
    request: PointRequest,
    tiers: list[TierRequest],
    numeric: NumericConfig,
    observer_height_m: float,
    fetcher: SourceFetcher,
    base_url: str,
    cache: JsonCache,
) -> tuple[PointResult, HorizonProfile | None, bool]:
    """Restituisce (risultato del punto, profilo d'orizzonte, True se preso dalla cache)."""
    x, y = lonlat_to_stereo(request.lon_east_deg, request.lat_deg)
    scale = stereographic_scale(request.lat_deg)
    try:
        plans = plan_tiers(
            request.lat_deg, request.lon_east_deg, tiers, numeric.min_distance_m, fetcher, base_url
        )
        count_label = dem.COUNT_PRODUCTS.get(plans[0].product.label)
        count_tiles, count_bbox = [], None
        if count_label:
            half = numeric.slope_diameter_m * scale + 4 * plans[0].product.pixel_m
            count_bbox = (x - half, y - half, x + half, y + half)
            count_tiles = _plan_product(
                dem.PRODUCTS[count_label], count_bbox, fetcher, base_url, "lola_shot_count_tile"
            )
    except dem.TerrainError as exc:
        return _failed_point(request, x, y, scale, observer_height_m, str(exc)), None, False

    inputs = {
        "algorithm": ALGORITHM_VERSION,
        "stage": "terrain",
        "lat_deg": request.lat_deg,
        "lon_east_deg": request.lon_east_deg % 360.0,
        "observer_height_m": observer_height_m,
        "moon_radius_m": MOON_RADIUS_M,
        "tiers": [
            {
                "product": p.product.label,
                "inner_m": p.inner_m,
                "outer_m": p.outer_m,
                "step_m": p.step_m,
                "tiles": [[i, j, sha] for i, j, _, sha in p.tiles],
            }
            for p in plans
        ],
        "count_tiles": [[i, j, sha] for i, j, _, sha in count_tiles],
        "numeric": {
            "azimuth_step_deg": numeric.azimuth_step_deg,
            "min_distance_m": numeric.min_distance_m,
            "radial_relative_step": numeric.radial_relative_step,
            "slope_diameter_m": numeric.slope_diameter_m,
            "slope_min_pixels": numeric.slope_min_pixels,
        },
    }
    key = key_of(inputs)
    stored = cache.get(key)
    if stored is not None:
        point = PointResult.model_validate(stored)
        point = point.model_copy(update={"id": request.id, "selection": request.selection})
        return point, profile_from_result(point), True

    rasters = [load_raster(p.product, p.bbox, p.tiles) for p in plans]
    stack = dem.TerrainStack(rasters)
    ground, ground_product = float("nan"), None
    for raster in rasters:
        value = float(raster.sample(x, y))
        if math.isfinite(value):
            ground, ground_product = value, raster.label
            break
    if not math.isfinite(ground):
        reason = "quota non disponibile nel punto: nessun DEM valido"
        return _failed_point(request, x, y, scale, observer_height_m, reason), None, False

    count_raster = (
        load_raster(dem.PRODUCTS[count_label], count_bbox, count_tiles) if count_label else None
    )
    slope = measure_slope(rasters[0], x, y, scale, numeric, count_raster, count_label)
    profile = compute_horizon(
        stack,
        request.lat_deg,
        request.lon_east_deg,
        observer_height_m,
        numeric.azimuth_step_deg,
        radial_tiers(plans),
        numeric.radial_relative_step,
    )
    seams = [
        stats
        for fine, coarse in zip(rasters[:-1], rasters[1:], strict=True)
        if (stats := seam_statistics(fine, coarse)) is not None
    ]
    used = [
        TierUsed(
            product=p.product.label,
            family=p.product.family,
            pixel_m=p.product.pixel_m,
            inner_radius_m=p.inner_m,
            outer_radius_m=p.outer_m,
            radial_step_m=p.step_m,
            window_m=list(r.bounds),
            valid_fraction=float(np.isfinite(r.values).mean()),
            tiles=len(p.tiles),
        )
        for p, r in zip(plans, rasters, strict=True)
    ]
    horizon = horizon_result(profile)
    point = PointResult(
        id=request.id,
        region=request.region,
        lat_deg=request.lat_deg,
        lon_east_deg=request.lon_east_deg % 360.0,
        x_m=float(x),
        y_m=float(y),
        map_scale=scale,
        selection=request.selection,
        elevation=Measure(
            value=ground,
            unit="m sopra la sfera di 1737400 m",
            status="ok" if ground_product == rasters[0].label else "approximate",
            reason=None
            if ground_product == rasters[0].label
            else "quota dalla fascia più grossolana: la più fine non copre il punto",
        ),
        elevation_product=ground_product,
        observer_height_m=observer_height_m,
        observer_radius_m=profile.observer_radius_m,
        horizons_site_alt_km=(ground + observer_height_m) / 1000.0,
        tiers=used,
        tier_seams=seams,
        slope=slope,
        horizon=horizon,
        terrain_cache_key=key,
        status="ok" if horizon.status == "ok" else "approximate",
        reason=horizon.reason,
    )
    cache.put(key, inputs, point.model_dump(mode="json"))
    return point, profile, False
