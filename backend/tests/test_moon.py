import math

import pytest

from app.core.moon import (
    MOON_RADIUS_M,
    crosses_antimeridian,
    densify_ring,
    lonlat_to_stereo,
    normalize_lon,
    ring_area_km2,
    stereo_to_lonlat,
)


def _inverse_by_hand(x: float, y: float) -> tuple[float, float]:
    """Inversa della stereografica polare sud su sfera, scritta a mano per controllare pyproj."""
    rho = math.hypot(x, y)
    lat = -(90.0 - math.degrees(2.0 * math.atan(rho / (2.0 * MOON_RADIUS_M))))
    lon = math.degrees(math.atan2(x, y))
    return normalize_lon(lon), lat


@pytest.mark.parametrize(
    "x,y", [(-11000, 132000), (-19000, -4000), (154000, 51500), (-123400, -66100), (3, 4)]
)
def test_pyproj_matches_formula(x, y):
    lon, lat = stereo_to_lonlat(x, y)
    expected_lon, expected_lat = _inverse_by_hand(x, y)
    assert lon == pytest.approx(expected_lon, abs=1e-9)
    assert lat == pytest.approx(expected_lat, abs=1e-9)


def test_malapert_first_corner():
    lon, lat = stereo_to_lonlat(-11000, 132000)
    assert lat == pytest.approx(-85.63394, abs=1e-5)
    assert lon == pytest.approx(-4.76364, abs=1e-5)


@pytest.mark.parametrize("lon,lat", [(29.13, -84.78), (355.2, -85.6), (-130.0, -89.5)])
def test_roundtrip(lon, lat):
    back_lon, back_lat = stereo_to_lonlat(*lonlat_to_stereo(lon, lat))
    assert back_lon == pytest.approx(normalize_lon(lon), abs=1e-9)
    assert back_lat == pytest.approx(lat, abs=1e-9)


@pytest.mark.parametrize(
    "lon,expected", [(355.23636, -4.76364), (180.0, -180.0), (-180.0, -180.0), (360.0, 0.0)]
)
def test_normalize_lon(lon, expected):
    assert normalize_lon(lon) == pytest.approx(expected)


def test_densify_ring_keeps_corners_and_step():
    ring = [(0, 0), (1000, 0), (1000, 1000), (0, 1000), (0, 0)]
    dense = densify_ring(ring, 250)
    assert len(dense) == 17
    assert all(c in dense for c in ring)
    steps = [math.dist(a, b) for a, b in zip(dense[:-1], dense[1:], strict=True)]
    assert max(steps) <= 250 + 1e-9


def test_area_on_sphere_matches_scale_factor():
    # Quadrato di Malapert Massif (21 km). Fattore di scala della stereografica polare
    # alla latitudine φ: k = 2 / (1 + sin|φ|). Area sulla sfera ≈ area sul piano / k².
    corners = [
        (-11000, 111000),
        (10000, 111000),
        (10000, 132000),
        (-11000, 132000),
        (-11000, 111000),
    ]
    lonlat = [stereo_to_lonlat(x, y) for x, y in densify_ring(corners, 250)]
    _, center_lat = stereo_to_lonlat(-500, 121500)
    k = 2 / (1 + math.sin(math.radians(abs(center_lat))))
    assert ring_area_km2(lonlat) == pytest.approx(441.0 / k**2, rel=1e-3)


def test_crosses_antimeridian():
    assert crosses_antimeridian([170.0, 179.0, -179.0])
    assert not crosses_antimeridian([-4.0, 0.0, 4.0])
