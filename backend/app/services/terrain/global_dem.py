"""Numeric Moon Trek global LOLA windows for sites outside the PGDA south-pole DEM."""

import hashlib
import json
import math
import uuid
from datetime import UTC, datetime

import numpy as np
import rasterio
import requests
from pyproj import CRS

from app.core.moon import MOON_RADIUS_M
from app.services.storage import _write_json

URL = (
    "https://trek.nasa.gov/moon/trekarcgis/rest/services/LRO_LOLA_DEM_Global_128ppd_v04/ImageServer"
)
PIXEL = 240


def calculate(root, parameters, progress):
    from .engine import TerrainError, bilinear, elevation_angles

    lat, lon = parameters["site"]["latDeg"], parameters["site"]["lonEastDeg"]
    radius = parameters["config"]["maxDistanceKm"] * 1000
    step = parameters["config"]["azimuthStepDeg"]
    if not 1000 <= radius <= 300000 or step < 0.1:
        raise TerrainError("Use a radius of 1–300 km and an azimuth step of at least 0.1°.")
    crs = CRS.from_proj4(f"+proj=aeqd +lat_0={lat} +lon_0={lon} +R={MOON_RADIUS_M} +units=m")
    sr = json.dumps({"wkt": crs.to_wkt(version="WKT1_ESRI")})
    edge = math.ceil(radius / PIXEL) * PIXEL + 3 * PIXEL
    size = int(2 * edge / PIXEL)
    params = {
        "bbox": f"{-edge},{-edge},{edge},{edge}",
        "size": f"{size},{size}",
        "bboxSR": sr,
        "imageSR": sr,
        "format": "tiff",
        "pixelType": "F32",
        "interpolation": "RSP_BilinearInterpolation",
        "f": "image",
    }
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    directory = root / "data/terrain/global"
    directory.mkdir(parents=True, exist_ok=True)
    path, meta = directory / f"{key}.tif", directory / f"{key}.json"
    progress(0.1, "Loading numeric global LOLA elevations from NASA Moon Trek")
    if not path.exists() or not meta.exists():
        response = requests.get(URL + "/exportImage", params=params, timeout=(15, 120))
        response.raise_for_status()
        temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
        try:
            temporary.write_bytes(response.content)
            with rasterio.open(temporary) as src:
                if src.crs is None or not CRS(src.crs).equals(crs, ignore_axis_order=True):
                    raise TerrainError("Moon Trek returned the wrong coordinate system.")
                if src.count != 1 or src.dtypes[0] != "float32":
                    raise TerrainError("Moon Trek did not return a numeric elevation band.")
            temporary.replace(path)
        finally:
            temporary.unlink(missing_ok=True)
        _write_json(
            meta,
            {
                "productId": "LRO_LOLA_DEM_Global_128ppd_v04",
                "url": URL,
                "request": params,
                "retrievedUtc": datetime.now(UTC).isoformat(),
                "sha256": hashlib.sha256(response.content).hexdigest(),
                "units": "m",
                "pixelSizeM": PIXEL,
                "coordinateFrame": "MOON_ME",
                "referenceRadiusM": MOON_RADIUS_M,
            },
        )
    source = json.loads(meta.read_text())
    with path.open("rb") as file:
        if hashlib.file_digest(file, "sha256").hexdigest() != source["sha256"]:
            raise TerrainError("Cached global DEM checksum failed.")
    with rasterio.open(path) as src:
        values = src.read(1, masked=True).filled(np.nan)
        transform = src.transform
    z0 = float(bilinear(values, transform, 0, 0))
    az = np.arange(round(360 / step), dtype=float) * step
    distances = np.unique(np.append(np.arange(PIXEL / 2, radius, PIXEL), radius))
    result = []
    progress(0.7, "Tracing the lunar horizon on global LOLA elevations")
    # On the site-centred spherical azimuthal equidistant map x=d*sin(az), y=d*cos(az).
    for chunk in np.array_split(az, max(1, math.ceil(len(az) / 90))):
        xs = np.sin(np.deg2rad(chunk))[:, None] * distances
        ys = np.cos(np.deg2rad(chunk))[:, None] * distances
        z = bilinear(values, transform, xs, ys)
        result.extend(
            np.max(
                elevation_angles(z, z0, parameters["observerHeightM"], distances), axis=1
            ).tolist()
        )
    profile = {
        "azimuthDeg": az.tolist(),
        "elevationDeg": result,
        "observer": {
            "site": parameters["site"],
            "surfaceHeightM": z0,
            "heightAboveSurfaceM": parameters["observerHeightM"],
            "referenceRadiusKm": MOON_RADIUS_M / 1000,
        },
        "params": parameters["config"],
        "algorithmVersion": "global-lola-spherical-1",
        "dem": {
            "productIds": [source["productId"]],
            "effectivePixelSizeM": PIXEL,
            "noDataFraction": 0,
        },
        "sources": [source],
        "coordinateFrame": "MOON_ME",
        "warnings": [
            "Global LOLA 128 pixels/degree resampled to a local 240 m grid; "
            "sub-pixel hills and boulders are unresolved.",
            "Sampled horizon for visualization; not a landing safety or slope assessment.",
        ],
    }
    result = {
        "id": hashlib.sha256(
            json.dumps([parameters, source["sha256"]], sort_keys=True).encode()
        ).hexdigest(),
        "origin": "engine",
        "preview": False,
        "profile": profile,
    }
    if parameters.get("includeLocalTerrain"):
        from .local_assessment import unknown_local_terrain

        result["localTerrain"] = unknown_local_terrain(
            source, "Global DEM resolution cannot resolve a native 100 m local terrain fit."
        )
    return result
