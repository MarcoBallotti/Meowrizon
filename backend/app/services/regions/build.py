"""Costruzione di regions.geojson e sites.geojson a partire da catalogo e dati Moon Trek."""

import math
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from shapely.geometry import Point as ShapelyPoint
from shapely.geometry import Polygon
from shapely.geometry.polygon import orient

from app.core.moon import (
    MOON_RADIUS_M,
    crosses_antimeridian,
    densify_ring,
    lonlat_to_stereo,
    normalize_lon,
    ring_area_km2,
    stereo_to_lonlat,
)
from app.services.regions.catalog import Catalog, RegionEntry
from app.services.terrain.lola_products import covering_products

# Passo dei vertici aggiunti ai lati per disegnare il poligono in gradi.
DENSIFY_STEP_M = 250.0
# Gli angoli Moon Trek hanno rumore numerico (153999.9999 invece di 154000): si arrotonda al cm.
CORNER_DECIMALS = 2
LONLAT_DECIMALS = 7  # circa 3 mm sulla superficie lunare

REFERENCE = {
    "body": "Luna",
    "sphere_radius_m": MOON_RADIUS_M,
    "frame": "Mean Earth / polar axis",
    "lonlat": "gradi, longitudine Est tra -180 e 180, latitudine negativa a sud",
    "projection_m": "stereografica polare sud (Moon2000_spole, meridiano centrale 0)",
}


class RegionBuildError(ValueError):
    """I dati della fonte non tornano con il catalogo."""


@dataclass(frozen=True)
class BuiltRegion:
    entry: RegionEntry
    polygon_m: Polygon


def build_regions(
    catalog: Catalog, moontrek: dict[str, Any], source: dict[str, Any]
) -> tuple[dict[str, Any], list[BuiltRegion], list[str]]:
    """Restituisce (FeatureCollection, regioni con poligono in metri, avvisi)."""
    by_label = {f["attributes"]["label"]: f for f in moontrek["features"]}
    used_labels = {r.moontrek_label for r in catalog.regions}
    warnings = [
        f"Moon Trek contiene '{label}', che non è nel catalogo"
        for label in sorted(set(by_label) - used_labels)
    ]

    features, built = [], []
    for entry in catalog.regions:
        feature = by_label.get(entry.moontrek_label)
        if feature is None:
            raise RegionBuildError(
                f"Regione '{entry.id}': etichetta '{entry.moontrek_label}' assente su Moon Trek"
            )
        geojson, polygon_m = _region_feature(entry, feature["geometry"], catalog)
        features.append(geojson)
        built.append(BuiltRegion(entry, polygon_m))

    collection = _collection("regions", features, catalog, source)
    return collection, built, warnings


def build_sites(catalog: Catalog, regions: list[BuiltRegion]) -> dict[str, Any]:
    features = []
    for site in catalog.sites:
        properties: dict[str, Any] = {
            "id": site.id,
            "name": site.name,
            "kind": site.kind,
            "date": site.date,
            "source": site.source,
            "note": site.note,
            "in_sector": site.in_sector,
            "cell_size_m": catalog.cell_size_m,
        }
        if site.in_sector:
            properties |= _polar_site_terrain(site.id, site.lon, site.lat, catalog, regions)
        else:
            # Fuori dal settore la stereografica polare e i DEM polari non servono:
            # il terreno arriverà da un DEM globale, ancora da scegliere.
            properties |= {
                "x_m": None,
                "y_m": None,
                "cell_bounds_m": None,
                "region": None,
                "dem_near": None,
                "dem_covering": [],
            }
        features.append(
            {
                "type": "Feature",
                "id": site.id,
                "geometry": {
                    "type": "Point",
                    "coordinates": [_r(normalize_lon(site.lon)), _r(site.lat)],
                },
                "properties": properties,
            }
        )
    return _collection("sites", features, catalog, None)


def _polar_site_terrain(
    site_id: str, lon: float, lat: float, catalog: Catalog, regions: list[BuiltRegion]
) -> dict[str, Any]:
    half = catalog.cell_size_m / 2
    x, y = lonlat_to_stereo(lon, lat)
    cell = (x - half, y - half, x + half, y + half)
    inside = next(
        (r.entry.id for r in regions if r.polygon_m.contains(ShapelyPoint(x, y))),
        None,
    )
    dems = covering_products(*cell)
    if not dems:
        raise RegionBuildError(f"Sito '{site_id}': nessun DEM LOLA polare lo copre")
    return {
        "x_m": round(x, CORNER_DECIMALS),
        "y_m": round(y, CORNER_DECIMALS),
        "cell_bounds_m": [round(v, CORNER_DECIMALS) for v in cell],
        "region": inside,
        "dem_near": dems[0],
        "dem_covering": dems,
    }


def _region_feature(
    entry: RegionEntry, geometry: dict[str, Any], catalog: Catalog
) -> tuple[dict[str, Any], Polygon]:
    rings = geometry.get("rings", [])
    if len(rings) != 1:
        raise RegionBuildError(f"Regione '{entry.id}': attesi 1 anello, trovati {len(rings)}")
    corners = [(round(x, CORNER_DECIMALS), round(y, CORNER_DECIMALS)) for x, y in rings[0]]
    polygon_m = Polygon(corners)
    if not polygon_m.is_valid or polygon_m.area == 0:
        raise RegionBuildError(f"Regione '{entry.id}': poligono non valido")

    lonlat = [stereo_to_lonlat(x, y) for x, y in densify_ring(corners, DENSIFY_STEP_M)]
    lons = [p[0] for p in lonlat]
    lats = [p[1] for p in lonlat]
    if crosses_antimeridian(lons):
        raise RegionBuildError(f"Regione '{entry.id}': attraversa ±180°, andrebbe divisa")
    limit = catalog.sector.lat_limit
    if min(lats) > limit:
        raise RegionBuildError(
            f"Regione '{entry.id}': tutta a nord del limite del settore ({limit}°)"
        )

    xmin, ymin, xmax, ymax = polygon_m.bounds
    dems = covering_products(xmin, ymin, xmax, ymax)
    if not dems:
        raise RegionBuildError(f"Regione '{entry.id}': nessun DEM LOLA polare la copre")
    center_lon, center_lat = stereo_to_lonlat(polygon_m.centroid.x, polygon_m.centroid.y)
    cells_x = (xmax - xmin) / catalog.cell_size_m
    cells_y = (ymax - ymin) / catalog.cell_size_m
    is_rectangle = math.isclose(polygon_m.area, polygon_m.envelope.area, rel_tol=1e-9)
    aligned = is_rectangle and _is_whole(cells_x) and _is_whole(cells_y)

    ring_ll = orient(Polygon(lonlat), 1.0).exterior.coords  # antiorario, come chiede RFC 7946
    feature = {
        "type": "Feature",
        "id": entry.id,
        "geometry": {"type": "Polygon", "coordinates": [[[_r(x), _r(y)] for x, y in ring_ll]]},
        "properties": {
            "id": entry.id,
            "name": entry.name,
            "moontrek_label": entry.moontrek_label,
            "lists": list(entry.lists),
            "active": entry.active,
            "area_km2": round(ring_area_km2(lonlat), 3),
            "center_lon": _r(center_lon),
            "center_lat": _r(center_lat),
            "lat_min": _r(min(lats)),
            "lat_max": _r(max(lats)),
            "corners_m": [list(c) for c in corners],
            "bbox_m": [xmin, ymin, xmax, ymax],
            "cell_size_m": catalog.cell_size_m,
            "cells_x": round(cells_x) if aligned else None,
            "cells_y": round(cells_y) if aligned else None,
            "grid_aligned": aligned,
            "dem_near": dems[0],
            "dem_covering": dems,
        },
    }
    return feature, polygon_m


def _collection(
    kind: str, features: list[dict[str, Any]], catalog: Catalog, source: dict[str, Any] | None
) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "kind": kind,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "reference": REFERENCE,
        "sector": {"name": catalog.sector.name, "lat_limit": catalog.sector.lat_limit},
        "cell_size_m": catalog.cell_size_m,
    }
    if source is not None:
        meta["source"] = source
    # "meowrizon" è un membro aggiuntivo, ammesso da RFC 7946.
    return {"type": "FeatureCollection", "meowrizon": meta, "features": features}


def _r(value: float) -> float:
    return round(value, LONLAT_DECIMALS)


def _is_whole(value: float) -> bool:
    return math.isclose(value, round(value), abs_tol=1e-6)
