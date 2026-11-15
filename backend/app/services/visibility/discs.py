"""Frazioni visibili dei dischi di Sole e Terra sopra un orizzonte irregolare.

Il disco è diviso in strisce verticali. In ogni striscia la parte visibile è la corda del
disco meno ciò che sta sotto il terreno e, per il Sole, meno ciò che è coperto dal disco
terrestre: è l'unione delle due occultazioni, non il prodotto di due frazioni.

Convenzioni: Terra opaca e circolare con il raggio angolare equatoriale di Horizons; nessuna
luce diffusa o rifratta dall'atmosfera terrestre; piano tangente attorno al centro del disco.
"""

from dataclasses import dataclass

import numpy as np

from app.services.ephemerides.interpolation import separation_deg


@dataclass
class DiscFractions:
    f_terrain: np.ndarray  # frazione del disco non nascosta dal terreno
    f_visible: np.ndarray  # frazione non nascosta né dal terreno né dall'occultatore
    occulter_cover: np.ndarray  # frazione del disco coperta dal solo occultatore (geometrica)
    clearance_deg: np.ndarray  # massimo di (lembo superiore - orizzonte) sulle strisce


def _strip_offsets(strips: int) -> np.ndarray:
    return -1.0 + (2.0 * np.arange(strips) + 1.0) / strips


def disc_fractions(
    horizon_at,
    azimuth_deg,
    elevation_deg,
    radius_deg,
    occulter: tuple | None = None,
    strips: int = 64,
) -> DiscFractions:
    """`horizon_at(azimut)` restituisce H in gradi o NaN se la direzione non è nota.

    `occulter` è (azimut, elevazione, raggio) di un disco opaco davanti a quello misurato.
    Il risultato è NaN dove serve una direzione d'orizzonte sconosciuta.
    """
    az = np.atleast_1d(np.asarray(azimuth_deg, dtype=float))
    el = np.atleast_1d(np.asarray(elevation_deg, dtype=float))
    rho = np.atleast_1d(np.asarray(radius_deg, dtype=float))
    # Coordinate nel piano tangente, relative al centro del disco: xi lungo l'azimut
    # (gradi di cielo), eta lungo l'elevazione.
    xi = rho[:, None] * _strip_offsets(strips)[None, :]
    half = np.sqrt(np.clip(rho[:, None] ** 2 - xi**2, 0.0, None))
    cos_el = np.cos(np.radians(el))[:, None]
    with np.errstate(invalid="ignore", divide="ignore"):
        horizon = horizon_at(az[:, None] + xi / cos_el) - el[:, None]
    chord = half + half
    total = chord.sum(axis=1)
    unknown = np.isnan(horizon).any(axis=1) | ~np.isfinite(total) | (total <= 0)
    safe_total = np.where(total > 0, total, np.nan)

    # Parte della corda sopra il terreno: da max(-half, orizzonte) a +half.
    low = np.maximum(-half, np.where(np.isnan(horizon), -half, horizon))
    above = np.clip(half - low, 0.0, None)
    f_terrain = above.sum(axis=1) / safe_total

    if occulter is None:
        cover = np.zeros(az.size)
        f_visible = f_terrain.copy()
    else:
        o_az, o_el, o_rho = (np.atleast_1d(np.asarray(v, dtype=float)) for v in occulter)
        # Posizione dell'occultatore: direzione dall'approssimazione locale, distanza dalla
        # separazione angolare esatta.
        d_xi = ((o_az - az + 180.0) % 360.0 - 180.0) * np.cos(np.radians(el))
        d_eta = o_el - el
        approx = np.hypot(d_xi, d_eta)
        exact = separation_deg(az, el, o_az, o_el)
        with np.errstate(invalid="ignore", divide="ignore"):
            scale = np.where(approx > 0, exact / approx, 1.0)
        c_xi, c_eta = (d_xi * scale)[:, None], (d_eta * scale)[:, None]
        o_half = np.sqrt(np.clip(o_rho[:, None] ** 2 - (xi - c_xi) ** 2, 0.0, None))
        o_bottom, o_top = c_eta - o_half, c_eta + o_half
        # Parte della corda coperta dall'occultatore, con e senza terreno.
        covered_all = np.clip(np.minimum(half, o_top) - np.maximum(-half, o_bottom), 0.0, None)
        covered_above = np.clip(np.minimum(half, o_top) - np.maximum(low, o_bottom), 0.0, None)
        covered_above = np.minimum(covered_above, above)
        cover = covered_all.sum(axis=1) / safe_total
        f_visible = (above - covered_above).sum(axis=1) / safe_total
        occulter_unknown = ~np.isfinite(o_az) | ~np.isfinite(o_el) | ~np.isfinite(o_rho)
        cover = np.where(occulter_unknown, np.nan, cover)
        f_visible = np.where(occulter_unknown, np.nan, f_visible)

    f_terrain = np.where(unknown, np.nan, np.clip(f_terrain, 0.0, 1.0))
    f_visible = np.where(unknown, np.nan, np.clip(f_visible, 0.0, 1.0))
    with np.errstate(invalid="ignore"):
        clearance = np.where(unknown, np.nan, np.max(half - horizon, axis=1))
    return DiscFractions(f_terrain, f_visible, np.clip(cover, 0.0, 1.0), clearance)
