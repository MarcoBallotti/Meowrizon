"""Local 100 m terrain evidence from the native DEM already loaded for the horizon.

These are a mean plane slope and residual RMS, not a landing ellipse hazard assessment.
"""

import math

from app.services.terrain.moontrek_dem import Raster
from app.services.terrain.slope import fit_slope, stereographic_scale


def unknown_local_terrain(source, reason):
    return {
        "status": "unknown",
        "reason": reason,
        "slopeDeg": None,
        "roughnessRmsM": None,
        "supportDiameterM": 100,
        "sourcePixelSizeM": source["pixelSizeM"],
        "sampleCount": 0,
        "validFraction": None,
        "productId": source["productId"],
        "sha256": source["sha256"],
    }


def assess_local_terrain(values, transform, x, y, latitude, source):
    if (
        transform.b != 0
        or transform.d != 0
        or transform.a <= 0
        or not math.isclose(transform.a, -transform.e, abs_tol=1e-8)
    ):
        return unknown_local_terrain(source, "Unsupported DEM grid for a local plane fit.")
    raster = Raster(values, transform.c, transform.f, transform.a, source["productId"])
    fit = fit_slope(raster, x, y, stereographic_scale(latitude), diameter_m=100)
    result = unknown_local_terrain(source, fit.reason)
    result.update(
        status=fit.status,
        slopeDeg=fit.slope_deg,
        roughnessRmsM=fit.rms_residual_m,
        sampleCount=fit.n_pixels,
        validFraction=fit.valid_fraction,
    )
    return result
