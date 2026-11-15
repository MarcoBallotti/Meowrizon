"""Sampled spherical horizons from actual PGDA LOLA elevation windows.

Near terrain uses 20 m pixels; far terrain uses the separate 240 m product.
This is a resolution-limited visualization, not the approved site assessment engine.
"""

import hashlib
import json
import math
import uuid
from datetime import UTC, datetime

import numpy as np
import rasterio
from pyproj import CRS, Geod, Transformer
from rasterio.windows import Window, from_bounds

from app.core.moon import LONLAT, MOON_RADIUS_M, SOUTH_POLAR_STEREO
from app.services.storage import _write_json

VERSION = "pgda-spherical-rays-1"
BASE = "https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/"
PRODUCTS = {20: "LDEM_80S_20MPP_ADJ", 240: "LDEM_60S_240MPP_ADJ"}
GEOD = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)
PROJECT = Transformer.from_crs(LONLAT, SOUTH_POLAR_STEREO, always_xy=True)


class TerrainError(ValueError):
    pass


def ray_points(lat, lon, azimuths, distances):
    az, distance = np.meshgrid(azimuths, distances, indexing="ij")
    xlon, ylat, _ = GEOD.fwd(np.full(az.shape, lon), np.full(az.shape, lat), az, distance)
    return PROJECT.transform(xlon, ylat)


def elevation_angles(surface, observer_surface, height, distances):
    theta = np.asarray(distances) / MOON_RADIUS_M
    radius = MOON_RADIUS_M + surface
    return np.rad2deg(
        np.arctan2(
            radius * np.cos(theta) - (MOON_RADIUS_M + observer_surface + height),
            radius * np.sin(theta),
        )
    )


def bilinear(values, transform, xs, ys):
    col = (np.asarray(xs) - transform.c) / transform.a - 0.5
    row = (np.asarray(ys) - transform.f) / transform.e - 0.5
    c, r = np.floor(col).astype(int), np.floor(row).astype(int)
    if (
        np.any(c < 0)
        or np.any(r < 0)
        or np.any(c + 1 >= values.shape[1])
        or np.any(r + 1 >= values.shape[0])
    ):
        raise TerrainError("Requested rays extend outside prepared DEM coverage.")
    fx, fy = col - c, row - r
    z = (
        values[r, c] * (1 - fx) * (1 - fy)
        + values[r, c + 1] * fx * (1 - fy)
        + values[r + 1, c] * (1 - fx) * fy
        + values[r + 1, c + 1] * fx * fy
    )
    if not np.all(np.isfinite(z)):
        raise TerrainError("NoData intersects the observer or a requested horizon ray.")
    return z


def window_for(root, lat, lon, radius, pixel):
    product = PRODUCTS[pixel]
    key = hashlib.sha256(json.dumps([VERSION, product, lat, lon, radius]).encode()).hexdigest()
    directory = root / "data/terrain/windows"
    directory.mkdir(parents=True, exist_ok=True)
    path, manifest = directory / f"{key}.tif", directory / f"{key}.json"
    if path.exists() and manifest.exists():
        provenance = json.loads(manifest.read_text())
        with path.open("rb") as file:
            if hashlib.file_digest(file, "sha256").hexdigest() != provenance["sha256"]:
                raise TerrainError(
                    "Cached elevation file checksum failed; remove the damaged window."
                )
        return path, provenance
    xs, ys = ray_points(lat, lon, np.arange(0, 360, 0.5), [radius])
    cx, cy = PROJECT.transform(lon, lat)
    bounds = (
        min(float(xs.min()), cx) - 3 * pixel,
        min(float(ys.min()), cy) - 3 * pixel,
        max(float(xs.max()), cx) + 3 * pixel,
        max(float(ys.max()), cy) + 3 * pixel,
    )
    url = BASE + product + ".TIF"
    temporary = path.with_suffix(f".{uuid.uuid4().hex}.tmp")
    try:
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".TIF",
            GDAL_HTTP_TIMEOUT="45",
            GDAL_HTTP_MAX_RETRY="2",
        ):
            with rasterio.open(url) as src:
                if src.crs is None or not CRS(src.crs).equals(
                    SOUTH_POLAR_STEREO, ignore_axis_order=True
                ):
                    # Named lunar datums can differ; verify projection and sphere explicitly.
                    crs = CRS(src.crs) if src.crs else None
                    if crs is None or not math.isclose(
                        crs.ellipsoid.semi_major_metre, MOON_RADIUS_M, abs_tol=0.01
                    ):
                        raise TerrainError("DEM reference sphere is not the Moon.")
                    test = Transformer.from_crs(LONLAT, crs, always_xy=True)
                    for ll in [(0, -85), (90, -85), (lon, lat)]:
                        if not np.allclose(
                            test.transform(*ll), PROJECT.transform(*ll), atol=0.01, rtol=0
                        ):
                            raise TerrainError(
                                "DEM projection does not match lunar south polar coordinates."
                            )
                raw = from_bounds(*bounds, src.transform)
                c, r = math.floor(raw.col_off), math.floor(raw.row_off)
                w = Window(
                    c,
                    r,
                    math.ceil(raw.col_off + raw.width) - c,
                    math.ceil(raw.row_off + raw.height) - r,
                )
                if c < 0 or r < 0 or c + w.width > src.width or r + w.height > src.height:
                    raise TerrainError("The requested circle is outside the selected PGDA product.")
                values = src.read(1, window=w, masked=True).astype("float32").filled(np.nan)
                values = values * src.scales[0] + src.offsets[0]
                transform = src.window_transform(w)
                with rasterio.open(
                    temporary,
                    "w",
                    driver="GTiff",
                    width=values.shape[1],
                    height=values.shape[0],
                    count=1,
                    dtype="float32",
                    crs=src.crs,
                    transform=transform,
                    nodata=np.nan,
                    compress="deflate",
                ) as out:
                    out.write(values, 1)
        temporary.replace(path)
        with path.open("rb") as file:
            digest = hashlib.file_digest(file, "sha256").hexdigest()
        provenance = {
            "productId": product,
            "url": url,
            "retrievedUtc": datetime.now(UTC).isoformat(),
            "sha256": digest,
            "pixelSizeM": pixel,
            "units": "m",
            "coordinateFrame": "MOON_ME",
            "frameVersion": "DE421",
            "referenceRadiusM": MOON_RADIUS_M,
            "boundsM": list(bounds),
            "file": str(path.relative_to(root)),
        }
        _write_json(manifest, provenance)
        return path, provenance
    finally:
        temporary.unlink(missing_ok=True)


def calculate(root, parameters, progress):
    lat, lon = parameters["site"]["latDeg"], parameters["site"]["lonEastDeg"]
    height = parameters["observerHeightM"]
    distance = parameters["config"]["maxDistanceKm"] * 1000
    step = parameters["config"]["azimuthStepDeg"]
    if not -90 < lat <= -80:
        from .global_dem import calculate as global_calculate
        return global_calculate(root, parameters, progress)
    if not 1000 <= distance <= 300000 or step < 0.1:
        raise TerrainError(
            "This visualization supports 1–300 km and azimuth steps of at least 0.1°."
        )
    near = min(distance, 5000)
    az = np.arange(round(360 / step), dtype=float) * step
    results, sources = [], []
    z0 = None
    for pixel, start, stop in [(20, 10, near), (240, near, distance)]:
        if pixel == 240 and stop <= start:
            continue
        progress(0.1 if pixel == 20 else 0.5, f"Loading PGDA LOLA {pixel} m terrain")
        path, source = window_for(root, lat, lon, stop, pixel)
        sources.append(source)
        with rasterio.open(path) as src:
            values, transform = src.read(1), src.transform
        if z0 is None:
            x, y = PROJECT.transform(lon, lat)
            z0 = float(bilinear(values, transform, x, y))
        ds = np.unique(np.append(np.arange(start, stop, pixel), stop))
        maxima = []
        for chunk in np.array_split(az, max(1, math.ceil(len(az) / 90))):
            xs, ys = ray_points(lat, lon, chunk, ds)
            zs = bilinear(values, transform, xs, ys)
            maxima.extend(np.max(elevation_angles(zs, z0, height, ds), axis=1).tolist())
        results.append(maxima)
    progress(0.95, "Saving sampled lunar horizon")
    profile = {
        "azimuthDeg": az.tolist(),
        "elevationDeg": np.max(results, axis=0).tolist(),
        "observer": {
            "site": parameters["site"],
            "surfaceHeightM": z0,
            "heightAboveSurfaceM": height,
            "referenceRadiusKm": MOON_RADIUS_M / 1000,
        },
        "dem": {
            "productIds": [s["productId"] for s in sources],
            "effectivePixelSizeM": max(s["pixelSizeM"] for s in sources),
            "noDataFraction": 0,
        },
        "params": parameters["config"],
        "algorithmVersion": VERSION,
        "coordinateFrame": "MOON_ME",
        "frameVersion": "DE421",
        "sources": sources,
        "warnings": [
            "Sampled visualization, not a validated landing-site assessment.",
            "20 m terrain within 5 km; 240 m terrain farther away. Narrow peaks may be missed.",
            "Bilinear elevations and finite radial/azimuth sampling; "
            "sub-pixel obstacles are unresolved.",
            "No slope, illumination, eclipse or radio-link suitability is inferred.",
        ],
    }
    identifier = hashlib.sha256(
        json.dumps([VERSION, parameters, [s["sha256"] for s in sources]], sort_keys=True).encode()
    ).hexdigest()
    return {"id": identifier, "origin": "engine", "preview": False, "profile": profile}
