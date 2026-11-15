"""Riferimento geodetico della Luna e proiezione stereografica polare sud.

Tutte le fonti del progetto usano la stessa sfera e la stessa proiezione:
- Moon Trek, layer delle regioni Artemis III: WKT "Moon2000_spole", sfera 1737400 m,
  Stereographic_South_Pole, meridiano centrale 0;
- DEM LOLA polari della PDS: A_AXIS_RADIUS = 1737.4 km, POLAR STEREOGRAPHIC centrata a -90°,
  longitudine positiva verso Est, sistema MEAN EARTH/POLAR AXIS;
- JPL Horizons: Luna sferica di 1737.4 km.

Convenzioni:
- i calcoli (celle, pendenze, ritagli dei DEM) si fanno in metri sul piano stereografico;
- le coordinate verso il frontend sono in gradi, longitudine Est tra -180 e 180.
"""

import math
from collections.abc import Iterable, Sequence
from functools import lru_cache

from pyproj import CRS, Geod, Transformer

MOON_RADIUS_M = 1_737_400.0

SOUTH_POLAR_STEREO = CRS.from_proj4(
    f"+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R={MOON_RADIUS_M} +units=m +no_defs"
)
LONLAT = CRS.from_proj4(f"+proj=longlat +R={MOON_RADIUS_M} +no_defs")

_GEOD = Geod(a=MOON_RADIUS_M, b=MOON_RADIUS_M)

Point = tuple[float, float]


@lru_cache
def _stereo_to_lonlat() -> Transformer:
    return Transformer.from_crs(SOUTH_POLAR_STEREO, LONLAT, always_xy=True)


@lru_cache
def _lonlat_to_stereo() -> Transformer:
    return Transformer.from_crs(LONLAT, SOUTH_POLAR_STEREO, always_xy=True)


def normalize_lon(lon: float) -> float:
    """Porta una longitudine Est nell'intervallo [-180, 180)."""
    return (lon + 180.0) % 360.0 - 180.0


def stereo_to_lonlat(x: float, y: float) -> Point:
    """Metri stereografici polari sud -> (longitudine Est in [-180, 180), latitudine)."""
    lon, lat = _stereo_to_lonlat().transform(x, y)
    return normalize_lon(lon), lat


def lonlat_to_stereo(lon: float, lat: float) -> Point:
    """(longitudine Est, in 0…360 o -180…180, latitudine) -> metri stereografici polari sud."""
    return _lonlat_to_stereo().transform(lon, lat)


def densify_ring(ring: Sequence[Point], step_m: float) -> list[Point]:
    """Aggiunge vertici lungo i lati di un anello chiuso, al massimo ogni ``step_m`` metri.

    Un lato dritto sul piano stereografico diventa una curva in latitudine e longitudine:
    senza vertici intermedi la forma disegnata in gradi non sarebbe quella originale.
    """
    out: list[Point] = []
    for (x0, y0), (x1, y1) in zip(ring[:-1], ring[1:], strict=True):
        n = max(1, math.ceil(math.hypot(x1 - x0, y1 - y0) / step_m))
        out.extend((x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n))
    out.append(ring[-1])
    return out


def ring_area_km2(lonlat_ring: Sequence[Point]) -> float:
    """Area sulla sfera lunare di un anello in gradi. La stereografica non conserva le aree."""
    lons, lats = zip(*lonlat_ring, strict=True)
    area_m2, _ = _GEOD.polygon_area_perimeter(lons, lats)
    return abs(area_m2) / 1e6


def crosses_antimeridian(lons: Iterable[float]) -> bool:
    """True se due vertici consecutivi saltano più di 180° di longitudine."""
    values = list(lons)
    return any(abs(a - b) > 180.0 for a, b in zip(values[:-1], values[1:], strict=True))
