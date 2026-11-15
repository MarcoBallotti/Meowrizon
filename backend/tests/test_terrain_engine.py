"""Analytic geometry/NoData checks; these fixtures are never application fallback data."""

from unittest.mock import patch

import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin

from app.core.moon import MOON_RADIUS_M, SOUTH_POLAR_STEREO
from app.services.terrain import engine


def test_curvature_matches_analytic_sphere_horizon():
    height = 2
    central_angle = np.arccos(MOON_RADIUS_M / (MOON_RADIUS_M + height))
    angle = engine.elevation_angles(0, 0, height, MOON_RADIUS_M * central_angle)
    assert angle == pytest.approx(-np.degrees(central_angle), abs=1e-9)
    # On the surface, a point at central angle theta lies theta/2 below horizontal.
    assert engine.elevation_angles(0, 0, 0, 100_000) == pytest.approx(
        -np.degrees(100_000 / MOON_RADIUS_M) / 2, abs=1e-9
    )


def test_bilinear_pixel_centers_and_nodata_are_not_silently_filled():
    values = np.arange(9, dtype=float).reshape(3, 3) * 2
    transform = from_origin(0, 60, 20, 20)
    assert engine.bilinear(values, transform, 20, 40) == 4
    with pytest.raises(engine.TerrainError, match="outside"):
        engine.bilinear(values, transform, -1, 40)
    values[1, 1] = np.nan
    with pytest.raises(engine.TerrainError, match="NoData"):
        engine.bilinear(values, transform, 20, 40)


def test_complete_pipeline_against_constant_radius_sphere(tmp_path):
    lat, lon = -89.5, 120
    x, y = engine.PROJECT.transform(lon, lat)
    path = tmp_path / "analytic-sphere.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=520,
        height=520,
        count=1,
        dtype="float32",
        crs=SOUTH_POLAR_STEREO,
        transform=from_origin(x - 5200, y + 5200, 20, 20),
        nodata=np.nan,
    ) as dst:
        dst.write(np.full((520, 520), 100, dtype="float32"), 1)
    parameters = {
        "site": {"latDeg": lat, "lonEastDeg": lon},
        "observerHeightM": 2,
        "config": {"azimuthStepDeg": 5, "maxDistanceKm": 5},
    }
    source = {"productId": "analytic-test-only", "sha256": "test", "pixelSizeM": 20}
    with patch.object(engine, "window_for", return_value=(path, source)):
        result = engine.calculate(tmp_path, parameters, lambda *args: None)
    profile = result["profile"]
    expected = -np.degrees(np.arccos((MOON_RADIUS_M + 100) / (MOON_RADIUS_M + 102)))
    np.testing.assert_allclose(profile["elevationDeg"], expected, atol=1e-6, rtol=0)
    assert len(profile["azimuthDeg"]) == 72
    assert profile["observer"]["surfaceHeightM"] == pytest.approx(100)


def test_geodesic_rays_preserve_requested_distance_and_azimuth():
    lat, lon = -89.5, -137
    azimuths = np.arange(0, 360, 45)
    x, y = engine.ray_points(lat, lon, azimuths, [150_000])
    lons, lats = engine.PROJECT.transform(x[:, 0], y[:, 0], direction="INVERSE")
    bearings, _, distances = engine.GEOD.inv(np.full(8, lon), np.full(8, lat), lons, lats)
    np.testing.assert_allclose(distances, 150_000, atol=1e-6, rtol=0)
    np.testing.assert_allclose((bearings - azimuths + 180) % 360 - 180, 0, atol=1e-9)


def test_earth_dem_is_rejected_before_reading_elevations(tmp_path):
    path = tmp_path / "wrong-planet.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=10,
        height=10,
        count=1,
        dtype="float32",
        crs="EPSG:3031",
        transform=from_origin(-100, 100, 20, 20),
    ) as dst:
        dst.write(np.zeros((10, 10), dtype="float32"), 1)
    open_raster = rasterio.open
    with patch.object(engine.rasterio, "open", side_effect=lambda *a, **kw: open_raster(path)):
        with pytest.raises(engine.TerrainError, match="not the Moon"):
            engine.window_for(tmp_path, -89.5, 120, 1000, 20)


def test_unsupported_site_is_explicit_and_does_not_fetch(tmp_path):
    parameters = {
        "site": {"latDeg": 10, "lonEastDeg": 10},
        "observerHeightM": 2,
        "config": {"azimuthStepDeg": 1, "maxDistanceKm": 150},
    }
    with patch.object(engine, "window_for") as fetch:
        with pytest.raises(engine.TerrainError, match="south-polar"):
            engine.calculate(tmp_path, parameters, lambda *args: None)
        fetch.assert_not_called()
