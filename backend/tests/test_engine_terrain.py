"""Pendenza e orizzonte su terreni sintetici: piani noti, sfera liscia, ostacoli, bordi."""

import math

import numpy as np
import pytest

from app.core.moon import MOON_RADIUS_M, lonlat_to_stereo
from app.services.terrain import moontrek_dem as dem
from app.services.terrain.horizon import (
    RadialTier,
    compute_horizon,
    destination,
    lonlat_to_xy,
)
from app.services.terrain.slope import (
    circular_support,
    fit_slope,
    slope_band,
    stereographic_scale,
)

LAT, LON = -88.0, 30.0
X0, Y0 = lonlat_to_stereo(LON, LAT)
SCALE = stereographic_scale(LAT)


def raster_from(function, half_m, pixel_m, label="synthetic"):
    """Griglia centrata sul punto di prova; `function(x, y)` dà la quota in metri."""
    n = int(round(2 * half_m / pixel_m))
    x_left, y_top = X0 - half_m, Y0 + half_m
    cols = x_left + (np.arange(n) + 0.5) * pixel_m
    rows = y_top - (np.arange(n) + 0.5) * pixel_m
    gx, gy = np.meshgrid(cols, rows)
    return dem.Raster(function(gx, gy).astype(np.float32), x_left, y_top, pixel_m, label)


def plane(slope_deg, direction_deg=30.0):
    """Piano con pendenza nota in metri sul terreno (le coordinate di mappa sono scalate)."""
    gradient = math.tan(math.radians(slope_deg))
    ux, uy = math.cos(math.radians(direction_deg)), math.sin(math.radians(direction_deg))
    return lambda x, y: 100.0 + gradient * ((x - X0) * ux + (y - Y0) * uy) / SCALE


# --- Pendenza ----------------------------------------------------------------------------------


@pytest.mark.parametrize("slope_deg", [0.0, 2.5, 5.0, 10.0, 15.0, 27.0])
def test_plane_of_known_slope_is_recovered(slope_deg):
    raster = raster_from(plane(slope_deg), 200.0, 5.0)
    fit = fit_slope(raster, X0, Y0, SCALE)
    assert fit.status == "ok"
    assert fit.slope_deg == pytest.approx(slope_deg, abs=1e-3)
    assert fit.rms_residual_m < 1e-2
    # Supporto circolare di diametro 100 m su pixel da 5 m: circa pi*50^2/25 pixel.
    assert 290 <= fit.n_pixels <= 340 and fit.valid_fraction == 1.0


def test_map_scale_is_not_mistaken_for_slope():
    assert stereographic_scale(-90.0) == pytest.approx(1.0)
    assert stereographic_scale(-86.0) == pytest.approx(2 / (1 + math.sin(math.radians(86))))
    raster = raster_from(plane(10.0), 200.0, 5.0)
    # Ignorare il fattore di scala cambierebbe la pendenza misurata.
    wrong = fit_slope(raster, X0, Y0, 1.0)
    assert abs(wrong.slope_deg - 10.0) > 1e-4
    assert fit_slope(raster, X0, Y0, SCALE).slope_deg == pytest.approx(10.0, abs=1e-3)


def test_bands_have_exact_boundaries_and_no_filter():
    assert [slope_band(v) for v in (0.0, 4.999999, 5.0, 9.999999, 10.0, 14.999999, 15.0, 40.0)] == [
        1, 1, 2, 2, 3, 3, 4, 4,
    ]  # fmt: skip
    with pytest.raises(ValueError):
        slope_band(float("nan"))
    with pytest.raises(ValueError):
        slope_band(-0.1)


def test_nodata_in_support_makes_slope_unknown_not_interpolated():
    raster = raster_from(plane(8.0), 200.0, 5.0)
    row = col = raster.values.shape[0] // 2
    raster.values[row, col + 3] = np.nan
    fit = fit_slope(raster, X0, Y0, SCALE)
    assert fit.slope_deg is None and fit.status == "unknown"
    assert fit.reason == "nodata_in_support" and fit.valid_fraction < 1.0


def test_support_outside_coverage_or_too_coarse_is_unknown():
    edge = raster_from(plane(8.0), 200.0, 5.0)
    outside = fit_slope(edge, X0 + 190.0, Y0, SCALE)
    assert outside.slope_deg is None and outside.reason == "support_outside_dem_coverage"
    coarse = raster_from(plane(8.0), 600.0, 30.0)
    unresolved = fit_slope(coarse, X0, Y0, SCALE)
    # Un DEM a 30 m non diventa adatto a 100 m: nessun ricampionamento.
    assert unresolved.slope_deg is None and unresolved.reason == "support_not_resolved_by_dem"
    assert unresolved.n_expected < 16


def test_circular_support_is_a_circle_in_ground_metres():
    raster = raster_from(plane(0.0), 200.0, 5.0)
    support = circular_support(raster, X0, Y0, SCALE, 100.0)
    distance = np.hypot(support.dx_m, support.dy_m)
    assert distance.max() <= 50.0 + 1e-9 and distance.max() > 46.0 and support.inside_raster


# --- Griglie -----------------------------------------------------------------------------------


def test_bilinear_sampling_and_missing_data():
    raster = raster_from(lambda x, y: (x - X0) * 0.5 + (y - Y0) * 0.25, 100.0, 10.0)
    assert float(raster.sample(X0 + 12.0, Y0 - 7.0)) == pytest.approx(12.0 * 0.5 - 7.0 * 0.25)
    assert np.isnan(raster.sample(X0 + 500.0, Y0))  # fuori copertura
    assert float(raster.sample(X0, Y0)) == pytest.approx(0.0, abs=1e-6)  # la quota zero è valida
    raster.values[10, 10] = np.nan
    assert np.isnan(raster.sample(raster.x0 + 105.0, raster.y1 - 105.0))


def test_stack_uses_finest_grid_then_falls_back_without_inventing_terrain():
    fine = raster_from(lambda x, y: np.full(x.shape, 10.0), 100.0, 5.0, "fine")
    coarse = raster_from(lambda x, y: np.full(x.shape, 20.0), 1000.0, 50.0, "coarse")
    stack = dem.TerrainStack([fine, coarse])
    values = stack.sample(np.array([X0, X0 + 500.0, X0 + 5000.0]), np.array([Y0, Y0, Y0]))
    assert values[0] == 10.0 and values[1] == 20.0 and np.isnan(values[2])
    assert stack.sample(X0, Y0, start=1) == 20.0


def test_tiles_are_aligned_to_the_native_grid_and_clipped_to_the_product():
    product = dem.PRODUCTS["Site23_final_adj_5mpp_surf"]
    assert (product.width, product.height) == (4200, 4200)
    entry = dem.tile_entry("https://trek.nasa.gov/moon", product, 2, 0)
    assert entry["params"]["bbox"] == "4000.000,124500.000,10000.000,132000.000"
    assert entry["params"]["size"] == "1200,1500"  # ultimo tassello ritagliato al prodotto
    assert entry["params"]["interpolation"] == "RSP_NearestNeighbor"
    assert "trekarcgis2/rest/services/Site23_final_adj_5mpp_surf/ImageServer" in entry["url"]
    assert dem.window_pixels(product, (-600.0, 121400.0, -400.0, 121600.0)) == (
        2080,
        2080,
        2120,
        2120,
    )
    assert dem.window_pixels(product, (20000.0, 0.0, 30000.0, 1000.0)) is None
    with pytest.raises(dem.TerrainError):
        dem.tile_bounds(product, 3, 0)


def test_window_is_assembled_from_tiles():
    product = dem.PRODUCTS["Site23_final_adj_5mpp_surf"]
    asked = []

    def get_tile(i, j):
        asked.append((i, j))
        _, _, width, height = dem.tile_bounds(product, i, j)
        return np.full((height, width), 10.0 * i + j, dtype=np.float32), None

    bbox = (
        product.xmin + 7400.0,
        product.ymax - 7600.0,
        product.xmin + 7600.0,
        product.ymax - 7400.0,
    )
    raster, _ = dem.load_window(product, bbox, get_tile)
    assert sorted(asked) == [(0, 0), (0, 1), (1, 0), (1, 1)]
    assert raster.values.shape == (40, 40) and raster.pixel_m == 5.0
    assert raster.values[0, 0] == 0.0 and raster.values[0, -1] == 10.0
    assert raster.values[-1, 0] == 1.0 and raster.values[-1, -1] == 11.0
    assert raster.bounds == bbox


def test_service_metadata_must_match_the_registry():
    product = dem.PRODUCTS["LRO_LOLA_DEM_SPole45_100mp_v04"]
    wkt = (
        'PROJCS["Moon2000_spole",SPHEROID["Moon",1737400.0,0.0],'
        'PROJECTION["Stereographic_South_Pole"]]'
    )
    good = {
        "pixelSizeX": 100, "pixelSizeY": 100, "pixelType": "F32", "bandCount": 1,
        "extent": {"xmin": -1440000, "ymin": -1440000, "xmax": 1440000, "ymax": 1440000,
                   "spatialReference": {"wkt": wkt}},
    }  # fmt: skip
    assert dem.check_metadata(product, good)["pixel_m"] == 100.0
    for key, value in (("pixelSizeX", 240), ("pixelType", "U8")):
        with pytest.raises(dem.TerrainError):
            dem.check_metadata(product, good | {key: value})
    shifted = good | {"extent": good["extent"] | {"xmin": -1095930}}
    with pytest.raises(dem.TerrainError):
        dem.check_metadata(product, shifted)


# --- Orizzonte ---------------------------------------------------------------------------------


def test_projection_matches_the_project_reference():
    for lat, lon in ((-88.0, 30.0), (-85.99, 359.76), (-89.9, 200.0)):
        x, y = lonlat_to_xy(np.radians(lat), np.radians(lon))
        rx, ry = lonlat_to_stereo(lon, lat)
        assert x == pytest.approx(rx, abs=1e-6) and y == pytest.approx(ry, abs=1e-6)


def test_destination_follows_azimuth_from_north_through_east():
    lat0, lon0 = np.radians(LAT), np.radians(LON)
    gamma = 1000.0 / MOON_RADIUS_M
    north = destination(lat0, lon0, 0.0, gamma)
    east = destination(lat0, lon0, np.pi / 2, gamma)
    assert np.degrees(north[0]) > LAT and np.degrees(north[1]) == pytest.approx(LON)
    assert np.degrees(east[1]) > LON and abs(np.degrees(east[0]) - LAT) < 1e-3
    assert np.degrees(north[0]) - LAT == pytest.approx(np.degrees(gamma), rel=1e-9)


def test_smooth_sphere_horizon_is_the_geometric_dip():
    flat = raster_from(lambda x, y: np.zeros(x.shape), 6000.0, 10.0)
    profile = compute_horizon(
        dem.TerrainStack([flat]), LAT, LON, 2.0, 1.0, [RadialTier(0.0, 5000.0, 10.0, 0)]
    )
    dip = -math.degrees(math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + 2.0)))
    assert profile.complete.all() and profile.ground_height_m == 0.0
    assert profile.observer_radius_m == MOON_RADIUS_M + 2.0
    assert np.abs(profile.elevation_deg - dip).max() < 1e-3
    # Senza curvatura l'orizzonte di un piano tenderebbe a 0°: qui è sotto l'orizzontale.
    assert dip == pytest.approx(-0.0869, abs=1e-3)
    assert np.abs(profile.distance_m - math.sqrt(2 * MOON_RADIUS_M * 2.0)).max() < 60.0


def hill_height(x, y, centre, amplitude=400.0, sigma=300.0):
    return amplitude * np.exp(-((x - centre[0]) ** 2 + (y - centre[1]) ** 2) / (2 * sigma**2))


@pytest.mark.parametrize("azimuth_deg", [0.0, 90.0, 225.0])
def test_known_obstacle_gives_the_expected_elevation_in_the_right_azimuth(azimuth_deg):
    lat0, lon0 = np.radians(LAT), np.radians(LON)
    lat_c, lon_c = destination(lat0, lon0, np.radians(azimuth_deg), 3000.0 / MOON_RADIUS_M)
    centre = lonlat_to_xy(lat_c, lon_c)
    raster = raster_from(lambda x, y: hill_height(x, y, centre), 6000.0, 10.0)
    profile = compute_horizon(
        dem.TerrainStack([raster]), LAT, LON, 2.0, 0.5, [RadialTier(0.0, 5000.0, 5.0, 0)]
    )
    peak = int(np.nanargmax(profile.elevation_deg))
    assert profile.azimuth_deg[peak] == pytest.approx(azimuth_deg, abs=0.5)

    # Valore atteso dalla funzione analitica, non dalla griglia.
    distances = np.arange(1.0, 5000.0, 1.0)
    gamma = distances / MOON_RADIUS_M
    lat, lon = destination(lat0, lon0, np.radians(azimuth_deg), gamma)
    radius = MOON_RADIUS_M + hill_height(*lonlat_to_xy(lat, lon), centre)
    observer = MOON_RADIUS_M + float(hill_height(X0, Y0, centre)) + 2.0
    expected = np.degrees(
        np.arctan2(radius * np.cos(gamma) - observer, radius * np.sin(gamma))
    ).max()
    assert expected > 6.0
    assert profile.elevation_deg[peak] == pytest.approx(expected, abs=0.01)
    assert profile.distance_m[peak] == pytest.approx(distances[0] + 2800.0, abs=250.0)


def test_curvature_hides_distant_low_terrain():
    # Altopiano di 30 m oltre 20 km: su una Luna piatta sarebbe sopra l'orizzontale, sulla
    # sfera è sotto l'orizzonte geometrico e non alza il profilo.
    def plateau(x, y):
        return np.where(np.hypot(x - X0, y - Y0) > 20000.0, 30.0, 0.0)

    raster = raster_from(plateau, 31000.0, 50.0)
    profile = compute_horizon(
        dem.TerrainStack([raster]), LAT, LON, 2.0, 5.0, [RadialTier(0.0, 30000.0, 50.0, 0)]
    )
    gamma = 20000.0 / MOON_RADIUS_M
    plateau_elevation = math.degrees(
        math.atan2(
            (MOON_RADIUS_M + 30.0) * math.cos(gamma) - (MOON_RADIUS_M + 2.0),
            (MOON_RADIUS_M + 30.0) * math.sin(gamma),
        )
    )
    assert plateau_elevation < -0.2
    assert profile.elevation_deg.max() < -0.05 and profile.distance_m.max() < 5000.0


def test_missing_terrain_is_incomplete_not_flat():
    # Griglia che non arriva a 5 km verso est: quelle direzioni sono incomplete.
    half = 6000.0
    raster = raster_from(lambda x, y: np.zeros(x.shape), half, 10.0)
    raster.values[:, raster.values.shape[1] // 2 + 300 :] = np.nan
    profile = compute_horizon(
        dem.TerrainStack([raster]), LAT, LON, 2.0, 5.0, [RadialTier(0.0, 5000.0, 10.0, 0)]
    )
    east = int(np.argmin(np.abs(profile.azimuth_deg - 90.0)))
    west = int(np.argmin(np.abs(profile.azimuth_deg - 270.0)))
    assert not profile.complete[east] and profile.complete[west]
    assert np.isnan(profile.at(90.0)) and np.isfinite(profile.at(270.0))
    assert np.isnan(profile.at(float("nan")))


def test_profile_interpolation_wraps_around_north():
    flat = raster_from(lambda x, y: np.zeros(x.shape), 3000.0, 10.0)
    profile = compute_horizon(
        dem.TerrainStack([flat]), LAT, LON, 2.0, 90.0, [RadialTier(0.0, 2500.0, 10.0, 0)]
    )
    profile.elevation_deg[:] = [0.0, 1.0, 2.0, 3.0]
    assert profile.at(45.0) == pytest.approx(0.5)
    assert profile.at(315.0) == pytest.approx(1.5)  # fra 270° (3) e 360° = 0° (0)
    assert profile.at(-45.0) == pytest.approx(1.5)
    with pytest.raises(ValueError):
        compute_horizon(dem.TerrainStack([flat]), LAT, LON, 2.0, 7.0, [])


def test_radial_sampling_is_denser_near_the_observer():
    from app.services.terrain.horizon import radial_distances

    uniform = radial_distances(2.5, 100.0, 5.0)
    assert uniform[0] == 7.5 and uniform[-1] <= 100.0 + 2.5 and np.allclose(np.diff(uniform), 5.0)
    graded = radial_distances(2.5, 20000.0, 5.0, 0.001)
    steps = np.diff(graded)
    assert graded[0] == pytest.approx(2.5 * 1.001) and graded[-1] <= 20000.0 + 2.5
    assert (steps > 0).all() and steps.max() <= 5.0 + 1e-9
    near = graded < 1000.0
    assert np.allclose(steps[near[1:]] / graded[:-1][near[1:]], 0.001, rtol=1e-6)
    assert radial_distances(100.0, 50.0, 5.0).size == 0
    # Oltre la distanza in cui il passo relativo supera quello della fascia resta uniforme.
    assert np.allclose(np.diff(radial_distances(40000.0, 41000.0, 100.0, 0.005)), 100.0)


def test_steep_near_field_slope_converges_with_proportional_sampling():
    # Rampa a 20° che inizia a 10 m: l'orizzonte è deciso dal terreno a pochi metri, dove
    # l'elevazione angolare varia rapidamente con la distanza.
    def ramp(x, y):
        east = (x - X0) * np.cos(np.radians(LON)) - (y - Y0) * np.sin(np.radians(LON))
        return np.clip(east / SCALE - 10.0, 0.0, 30.0) * np.tan(np.radians(20.0))

    raster = raster_from(ramp, 400.0, 5.0)
    stack = dem.TerrainStack([raster])
    tiers = [RadialTier(2.5, 300.0, 5.0, 0)]
    coarse = compute_horizon(stack, LAT, LON, 2.0, 90.0, tiers)
    fine = compute_horizon(stack, LAT, LON, 2.0, 90.0, tiers, 0.0005)
    finer = compute_horizon(stack, LAT, LON, 2.0, 90.0, tiers, 0.00025)
    east = 1  # azimut 90°
    assert fine.elevation_deg[east] > 5.0
    assert abs(fine.elevation_deg[east] - finer.elevation_deg[east]) < 0.005
    assert fine.elevation_deg[east] >= coarse.elevation_deg[east]
