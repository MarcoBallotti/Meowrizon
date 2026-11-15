"""Pendenza locale: piano ai minimi quadrati su un supporto circolare di diametro 100 m.

Il piano si adatta in metri sul terreno: le coordinate stereografiche sono divise per il
fattore di scala locale della proiezione, così la distorsione cartografica non entra nella
pendenza. Se il DEM non risolve il supporto, la pendenza è sconosciuta: non si ricampiona.
"""

import math
from dataclasses import dataclass

import numpy as np

from app.services.terrain.moontrek_dem import Raster

BAND_EDGES_DEG = (5.0, 10.0, 15.0)
BAND_LABELS = ("[0,5)", "[5,10)", "[10,15)", ">=15")


def slope_band(slope_deg: float) -> int:
    """Fascia descrittiva 1..4 con confini esatti [0,5), [5,10), [10,15), >=15."""
    if not math.isfinite(slope_deg) or slope_deg < 0:
        raise ValueError("Pendenza non valida")
    return 1 + sum(slope_deg >= edge for edge in BAND_EDGES_DEG)


def stereographic_scale(lat_deg: float) -> float:
    """Fattore di scala della stereografica polare sud (scala vera al polo) alla latitudine."""
    return 2.0 / (1.0 + math.sin(math.radians(abs(lat_deg))))


@dataclass
class Support:
    """Pixel con il centro dentro il cerchio di supporto."""

    dx_m: np.ndarray  # metri sul terreno rispetto al centro
    dy_m: np.ndarray
    values: np.ndarray  # NaN dove il pixel manca
    inside_raster: bool  # False se il cerchio esce dalla griglia

    @property
    def n_expected(self) -> int:
        return int(self.values.size)


def circular_support(raster: Raster, x: float, y: float, scale: float, diameter_m: float):
    radius_map = diameter_m / 2.0 * scale
    px = raster.pixel_m
    rows, cols = raster.values.shape
    c_lo = math.floor((x - radius_map - raster.x0) / px - 0.5)
    c_hi = math.ceil((x + radius_map - raster.x0) / px - 0.5)
    r_lo = math.floor((raster.y1 - (y + radius_map)) / px - 0.5)
    r_hi = math.ceil((raster.y1 - (y - radius_map)) / px - 0.5)
    cc, rr = np.meshgrid(np.arange(c_lo, c_hi + 1), np.arange(r_lo, r_hi + 1))
    px_x = raster.x0 + (cc + 0.5) * px
    px_y = raster.y1 - (rr + 0.5) * px
    in_circle = (px_x - x) ** 2 + (px_y - y) ** 2 <= radius_map**2
    cc, rr, px_x, px_y = cc[in_circle], rr[in_circle], px_x[in_circle], px_y[in_circle]
    in_raster = (cc >= 0) & (cc < cols) & (rr >= 0) & (rr < rows)
    values = np.full(cc.shape, np.nan)
    values[in_raster] = raster.values[rr[in_raster], cc[in_raster]]
    return Support((px_x - x) / scale, (px_y - y) / scale, values, bool(in_raster.all()))


@dataclass
class SlopeFit:
    slope_deg: float | None
    status: str  # ok | unknown
    reason: str | None
    n_pixels: int
    n_expected: int
    valid_fraction: float | None
    rms_residual_m: float | None


def fit_slope(
    raster: Raster,
    x: float,
    y: float,
    scale: float,
    diameter_m: float = 100.0,
    min_pixels: int = 16,
    min_valid_fraction: float = 1.0,
) -> SlopeFit:
    support = circular_support(raster, x, y, scale, diameter_m)
    n_expected = support.n_expected
    if n_expected < min_pixels:
        return SlopeFit(None, "unknown", "support_not_resolved_by_dem", 0, n_expected, None, None)
    good = np.isfinite(support.values)
    n_pixels = int(good.sum())
    valid_fraction = n_pixels / n_expected
    if not support.inside_raster:
        return SlopeFit(
            None, "unknown", "support_outside_dem_coverage",
            n_pixels, n_expected, valid_fraction, None,
        )  # fmt: skip
    if valid_fraction < min_valid_fraction or n_pixels < min_pixels:
        return SlopeFit(
            None, "unknown", "nodata_in_support", n_pixels, n_expected, valid_fraction, None
        )
    design = np.column_stack([support.dx_m[good], support.dy_m[good], np.ones(n_pixels)])
    heights = support.values[good]
    coefficients, *_ = np.linalg.lstsq(design, heights, rcond=None)
    residual = heights - design @ coefficients
    return SlopeFit(
        slope_deg=math.degrees(math.atan(math.hypot(coefficients[0], coefficients[1]))),
        status="ok",
        reason=None,
        n_pixels=n_pixels,
        n_expected=n_expected,
        valid_fraction=valid_fraction,
        rms_residual_m=float(np.sqrt(np.mean(residual**2))),
    )
