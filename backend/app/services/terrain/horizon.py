"""Maschera d'orizzonte H(azimut) dal terreno, con curvatura lunare.

Per ogni azimut si percorre l'arco di cerchio massimo che parte dall'osservatore e si prende
la massima elevazione angolare del terreno. L'elevazione è misurata rispetto al piano
perpendicolare alla verticale radiale dell'osservatore, la stessa convenzione di Horizons.
Dove il terreno manca la direzione è marcata incompleta: il valore trovato è solo un limite
inferiore, non un orizzonte piatto.
"""

from dataclasses import dataclass

import numpy as np

from app.core.moon import MOON_RADIUS_M
from app.services.terrain.moontrek_dem import TerrainStack


def lonlat_to_xy(lat_rad, lon_rad) -> tuple[np.ndarray, np.ndarray]:
    """Stereografica polare sud sulla sfera lunare, come `app.core.moon.lonlat_to_stereo`."""
    r = 2.0 * MOON_RADIUS_M * np.tan((np.pi / 2.0 + lat_rad) / 2.0)
    return r * np.sin(lon_rad), r * np.cos(lon_rad)


def destination(lat0_rad: float, lon0_rad: float, azimuth_rad, gamma_rad):
    """Punto raggiunto partendo con un azimut (da nord verso est) e un angolo al centro."""
    sin_lat = np.sin(lat0_rad) * np.cos(gamma_rad) + np.cos(lat0_rad) * np.sin(gamma_rad) * np.cos(
        azimuth_rad
    )
    sin_lat = np.clip(sin_lat, -1.0, 1.0)
    lat = np.arcsin(sin_lat)
    lon = lon0_rad + np.arctan2(
        np.sin(azimuth_rad) * np.sin(gamma_rad) * np.cos(lat0_rad),
        np.cos(gamma_rad) - np.sin(lat0_rad) * sin_lat,
    )
    return lat, lon


@dataclass(frozen=True)
class RadialTier:
    """Tratto di raggio [inner, outer] campionato ogni `step_m`, a partire dalla griglia `start`."""

    inner_m: float
    outer_m: float
    step_m: float
    start: int


@dataclass
class HorizonProfile:
    azimuth_step_deg: float
    elevation_deg: np.ndarray  # massimo trovato; NaN se nessun campione valido
    complete: np.ndarray  # True se tutti i campioni lungo la direzione erano coperti
    distance_m: np.ndarray  # distanza del terreno che determina l'orizzonte
    ground_height_m: float
    observer_radius_m: float

    @property
    def azimuth_deg(self) -> np.ndarray:
        return np.arange(self.elevation_deg.size) * self.azimuth_step_deg

    def at(self, azimuth_deg) -> np.ndarray:
        """Interpolazione lineare circolare; NaN se una delle due direzioni vicine è incompleta."""
        n = self.elevation_deg.size
        azimuth = np.asarray(azimuth_deg, dtype=float)
        finite = np.isfinite(azimuth)
        position = (np.where(finite, azimuth, 0.0) % 360.0) / self.azimuth_step_deg
        low = np.floor(position).astype(np.int64) % n
        high = (low + 1) % n
        weight = position - np.floor(position)
        known = np.where(self.complete, self.elevation_deg, np.nan)
        return np.where(finite, known[low] * (1.0 - weight) + known[high] * weight, np.nan)


def radial_distances(
    inner_m: float, outer_m: float, step_m: float, relative_step: float = 0.0
) -> np.ndarray:
    """Distanze dei campioni in (inner, outer].

    Il passo è min(step_m, relative_step * distanza): vicino all'osservatore l'elevazione
    angolare del terreno varia molto in pochi metri, quindi il campionamento è più fitto.
    """
    if outer_m <= inner_m:
        return np.empty(0)
    start = max(inner_m, 1e-3)
    parts = []
    if relative_step > 0 and relative_step * start < step_m:
        growth = 1.0 + relative_step
        limit = min(outer_m, step_m / relative_step)
        count = int(np.floor(np.log(limit / start) / np.log(growth)))
        geometric = start * growth ** np.arange(1, count + 1)
        parts.append(geometric)
        start = float(geometric[-1]) if geometric.size else start
    if start < outer_m:
        parts.append(np.arange(start + step_m, outer_m + step_m / 2, step_m))
    return np.concatenate(parts) if parts else np.empty(0)


def horizon_elevations(
    stack: TerrainStack,
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float,
    azimuths_deg,
    tiers: list[RadialTier],
    relative_step: float = 0.0,
    chunk: int = 120,
):
    """Massima elevazione del terreno nelle direzioni date.

    Restituisce (elevazione, completo, distanza, quota del suolo, raggio dell'osservatore).
    """
    lat0, lon0 = np.radians(lat_deg), np.radians(lon_deg)
    x0, y0 = lonlat_to_xy(lat0, lon0)
    ground = float(stack.sample(x0, y0))
    if not np.isfinite(ground):
        raise ValueError("Quota del terreno non disponibile nel punto dell'osservatore")
    observer_radius = MOON_RADIUS_M + ground + observer_height_m
    azimuths = np.radians(np.atleast_1d(np.asarray(azimuths_deg, dtype=float)))
    count = azimuths.size
    best = np.full(count, -np.inf)
    best_distance = np.full(count, np.nan)
    complete = np.ones(count, dtype=bool)
    for tier in tiers:
        distances = radial_distances(tier.inner_m, tier.outer_m, tier.step_m, relative_step)
        if distances.size == 0:
            continue
        gamma = distances / MOON_RADIUS_M
        for begin in range(0, count, chunk):
            block = slice(begin, min(begin + chunk, count))
            lat, lon = destination(lat0, lon0, azimuths[block, None], gamma[None, :])
            x, y = lonlat_to_xy(lat, lon)
            height = stack.sample(x, y, tier.start)
            radius = MOON_RADIUS_M + height
            elevation = np.degrees(
                np.arctan2(radius * np.cos(gamma) - observer_radius, radius * np.sin(gamma))
            )
            covered = np.isfinite(elevation)
            complete[block] &= covered.all(axis=1)
            elevation = np.where(covered, elevation, -np.inf)
            index = np.argmax(elevation, axis=1)
            value = elevation[np.arange(index.size), index]
            better = value > best[block]
            best[block] = np.where(better, value, best[block])
            best_distance[block] = np.where(better, distances[index], best_distance[block])
    found = np.isfinite(best)
    return (
        np.where(found, best, np.nan),
        complete & found,
        np.where(found, best_distance, np.nan),
        ground,
        observer_radius,
    )


def compute_horizon(
    stack: TerrainStack,
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float,
    azimuth_step_deg: float,
    tiers: list[RadialTier],
    relative_step: float = 0.0,
    chunk: int = 120,
) -> HorizonProfile:
    count = round(360.0 / azimuth_step_deg)
    if count < 4 or abs(count * azimuth_step_deg - 360.0) > 1e-9:
        raise ValueError("Il passo in azimut deve dividere 360°")
    elevation, complete, distance, ground, observer_radius = horizon_elevations(
        stack,
        lat_deg,
        lon_deg,
        observer_height_m,
        np.arange(count) * azimuth_step_deg,
        tiers,
        relative_step,
        chunk,
    )
    return HorizonProfile(
        azimuth_step_deg=azimuth_step_deg,
        elevation_deg=elevation,
        complete=complete,
        distance_m=distance,
        ground_height_m=ground,
        observer_radius_m=observer_radius,
    )
