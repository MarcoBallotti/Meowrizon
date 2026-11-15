"""Interpolazione delle effemeridi topocentriche fra i campioni di Horizons.

Si interpola il versore della direzione (Est, Nord, Zenit), non gli angoli: così non esistono
salti a 359°/0°. I campioni mancanti spezzano la serie in tratti indipendenti: fuori da un
tratto il valore è sconosciuto, non estrapolato.
"""

import numpy as np
from scipy.interpolate import CubicSpline

from app.services.ephemerides.horizons_topo import TopocentricTable


def angles_to_unit(azimuth_deg, elevation_deg) -> np.ndarray:
    az, el = np.radians(azimuth_deg), np.radians(elevation_deg)
    return np.stack([np.cos(el) * np.sin(az), np.cos(el) * np.cos(az), np.sin(el)], axis=-1)


def unit_to_angles(unit) -> tuple[np.ndarray, np.ndarray]:
    unit = np.asarray(unit, dtype=float)
    norm = np.linalg.norm(unit, axis=-1)
    with np.errstate(invalid="ignore", divide="ignore"):
        elevation = np.degrees(np.arcsin(np.clip(unit[..., 2] / norm, -1.0, 1.0)))
    azimuth = np.degrees(np.arctan2(unit[..., 0], unit[..., 1])) % 360.0
    return azimuth, elevation


def separation_deg(az1, el1, az2, el2) -> np.ndarray:
    """Distanza angolare fra due direzioni, stabile anche per angoli piccoli."""
    a, b = angles_to_unit(az1, el1), angles_to_unit(az2, el2)
    cross = np.linalg.norm(np.cross(a, b), axis=-1)
    dot = np.sum(a * b, axis=-1)
    return np.degrees(np.arctan2(cross, dot))


class BodyTrack:
    """Direzione, raggio angolare e distanza di un corpo in funzione del tempo."""

    def __init__(self, table: TopocentricTable, step_s: int, max_gap_factor: float = 1.5):
        self.body = table.body
        self.times_ms = table.times_ms
        good = (
            np.isfinite(table.azimuth_deg)
            & np.isfinite(table.elevation_deg)
            & np.isfinite(table.angular_diameter_deg)
            & np.isfinite(table.range_km)
        )
        self.missing_samples = int((~good).sum())
        self._segments = []
        limit_ms = step_s * 1000 * max_gap_factor
        indices = np.flatnonzero(good)
        if indices.size == 0:
            return
        breaks = np.flatnonzero(
            (np.diff(indices) > 1) | (np.diff(table.times_ms[indices]) > limit_ms)
        )
        for chunk in np.split(indices, breaks + 1):
            t = table.times_ms[chunk].astype(float) / 1000.0
            values = np.column_stack(
                [
                    angles_to_unit(table.azimuth_deg[chunk], table.elevation_deg[chunk]),
                    table.angular_diameter_deg[chunk] / 2.0,
                    table.range_km[chunk],
                ]
            )
            spline = CubicSpline(t, values, axis=0) if chunk.size >= 2 else None
            self._segments.append((t[0], t[-1], spline, values[0]))

    @property
    def segments_ms(self) -> list[tuple[int, int]]:
        return [(int(round(a * 1000)), int(round(b * 1000))) for a, b, _, _ in self._segments]

    def evaluate(self, times_ms) -> dict[str, np.ndarray]:
        """Valori agli istanti dati; NaN dove la serie non copre l'istante."""
        t = np.atleast_1d(np.asarray(times_ms, dtype=float)) / 1000.0
        out = np.full((t.size, 5), np.nan)
        for start, stop, spline, single in self._segments:
            inside = (t >= start) & (t <= stop)
            if not inside.any():
                continue
            out[inside] = spline(t[inside]) if spline is not None else single
        azimuth, elevation = unit_to_angles(out[:, :3])
        return {
            "azimuth_deg": azimuth,
            "elevation_deg": elevation,
            "radius_deg": out[:, 3],
            "range_km": out[:, 4],
            "valid": np.isfinite(out[:, 3]),
        }
