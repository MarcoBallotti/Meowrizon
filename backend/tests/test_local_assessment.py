"""Native resolution and provenance must survive the mission-terrain adapter."""

import math

import numpy as np
import pytest
from rasterio.transform import from_origin

from app.services.terrain.local_assessment import assess_local_terrain, unknown_local_terrain
from app.services.terrain.slope import stereographic_scale


def fixture(pixel=20, slope=8):
    lat = -86
    transform = from_origin(-10 * pixel, 10 * pixel, pixel, pixel)
    x = (np.arange(20) + 0.5) * pixel - 10 * pixel
    values = np.broadcast_to(
        x / stereographic_scale(lat) * math.tan(math.radians(slope)), (20, 20)
    ).copy()
    source = {"pixelSizeM": pixel, "productId": "analytic-test-only", "sha256": "abc"}
    return values, transform, lat, source


def test_local_plane_slope_and_residual_preserve_native_data():
    values, transform, lat, source = fixture()
    result = assess_local_terrain(values, transform, 0, 0, lat, source)
    assert result["status"] == "ok"
    assert result["slopeDeg"] == pytest.approx(8)
    assert result["roughnessRmsM"] == pytest.approx(0, abs=1e-10)
    assert result["supportDiameterM"] == 100 and result["sourcePixelSizeM"] == 20
    assert result["sampleCount"] >= 16 and result["validFraction"] == 1
    assert result["sha256"] == "abc" and result["productId"] == "analytic-test-only"


def test_coarse_or_missing_elevations_are_unknown_not_flat():
    values, transform, lat, source = fixture(pixel=240)
    coarse = assess_local_terrain(values, transform, 0, 0, lat, source)
    assert coarse["status"] == "unknown" and coarse["slopeDeg"] is None
    values, transform, lat, source = fixture()
    values[9, 9] = np.nan
    missing = assess_local_terrain(values, transform, 0, 0, lat, source)
    assert missing["status"] == "unknown" and missing["roughnessRmsM"] is None


def test_global_resampling_is_not_presented_as_a_local_measurement():
    source = {"pixelSizeM": 240, "productId": "global-lola", "sha256": "sha"}
    result = unknown_local_terrain(source, "Global DEM cannot resolve the 100 m support.")
    assert result["slopeDeg"] is None and result["validFraction"] is None
    assert result["sourcePixelSizeM"] == 240
