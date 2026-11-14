import dataclasses
import json
import math

import pytest
from shapely.geometry import Polygon

from app.core.moon import stereo_to_lonlat
from app.services.regions.build import RegionBuildError, build_regions, build_sites
from app.services.regions.catalog import SiteEntry
from app.services.regions.moontrek import SourceError, parse_response


@pytest.fixture
def built(catalog, moontrek_bytes):
    return build_regions(catalog, parse_response(moontrek_bytes), {"name": "test"})


def _props(collection, region_id):
    return next(f for f in collection["features"] if f["id"] == region_id)["properties"]


def test_all_catalog_regions_built(built):
    collection, regions, warnings = built
    assert len(collection["features"]) == 17
    assert warnings == []
    without = [f for f in collection["features"] if f["geometry"] is None]
    assert {f["id"] for f in without} == {
        "peak-near-cabeus-b",
        "mons-mouton-plateau",
        "mons-mouton",
        "slater-plain",
    }
    assert all(f["properties"]["status"] == "senza_poligono" for f in without)
    assert sum(1 for r in regions if r.polygon_m is not None) == 13


@pytest.mark.parametrize(
    "region_id,cells,dem",
    [
        ("connecting-ridge", 160, "ldem_875s_5m"),
        ("de-gerlache-rim-2", 200, "ldem_875s_5m"),
        ("malapert-massif", 210, "ldem_85s_10m"),
        ("haworth", 298, "ldem_85s_10m"),
        ("amundsen-rim", 200, "ldem_80s_20m"),
    ],
)
def test_grid_and_dem(built, region_id, cells, dem):
    p = _props(built[0], region_id)
    assert p["grid_aligned"] is True
    assert (p["cells_x"], p["cells_y"]) == (cells, cells)
    assert p["dem_near"] == dem


def test_malapert_properties(built):
    p = _props(built[0], "malapert-massif")
    assert p["lists"] == ["2022", "2024"]
    assert p["active"] is True
    assert p["corners_m"][0] == [-11000.0, 132000.0]
    k = 2 / (1 + math.sin(math.radians(abs(p["center_lat"]))))
    assert p["area_km2"] == pytest.approx(441.0 / k**2, rel=1e-3)
    # Malapert scavalca il meridiano 0: in ±180 resta un intervallo normale. Gli estremi di
    # longitudine sono gli angoli più vicini al polo (y = 111000 m): lon = atan2(x, y).
    feature = next(f for f in built[0]["features"] if f["id"] == "malapert-massif")
    lons = [c[0] for c in feature["geometry"]["coordinates"][0]]
    assert min(lons) == pytest.approx(math.degrees(math.atan2(-11000, 111000)), abs=1e-6)
    assert max(lons) == pytest.approx(math.degrees(math.atan2(10000, 111000)), abs=1e-6)


def test_polygons_are_valid_geojson(built):
    for f in built[0]["features"]:
        if f["geometry"] is None:
            continue
        ring = f["geometry"]["coordinates"][0]
        assert ring[0] == ring[-1]
        assert all(-180.0 <= lon < 180.0 and -90.0 <= lat <= -80.0 for lon, lat in ring)
        assert Polygon(ring).exterior.is_ccw  # RFC 7946: anello esterno antiorario
        assert len(ring) > 5  # lati infittiti, non solo i 4 angoli


def test_region_slightly_north_of_sector_is_kept(built):
    # Nobile Rim 2 ha il centro a nord di 84°S, ma una parte sta nel settore
    p = _props(built[0], "nobile-rim-2")
    assert p["center_lat"] > -84.0
    assert p["lat_min"] < -84.0


def test_unknown_label_is_an_error(catalog, moontrek_data):
    wrong = dataclasses.replace(catalog.regions[0], moontrek_label="Regione Inesistente")
    bad = dataclasses.replace(catalog, regions=(wrong, *catalog.regions[1:]))
    with pytest.raises(RegionBuildError, match="Regione Inesistente"):
        build_regions(bad, moontrek_data, {})


def test_label_missing_from_catalog_is_a_warning(catalog, moontrek_data):
    fewer = dataclasses.replace(catalog, regions=catalog.regions[1:])
    _, _, warnings = build_regions(fewer, moontrek_data, {})
    assert warnings == ["Moon Trek contiene 'Connecting Ridge', che non è nel catalogo"]


def test_source_errors_are_detected(moontrek_data):
    with pytest.raises(SourceError, match="errore"):
        parse_response(json.dumps({"error": {"code": 400}}).encode())
    wrong_crs = {**moontrek_data, "spatialReference": {"wkt": "GEOGCS[...]"}}
    with pytest.raises(SourceError, match="riferimento"):
        parse_response(json.dumps(wrong_crs).encode())


def test_sites_are_placed_in_regions(catalog, built):
    lon, lat = stereo_to_lonlat(-500, 121500)  # dentro il quadrato di Malapert Massif
    sites = (
        SiteEntry("dentro", "Dentro Malapert", lat, lon, "personalizzato", "test", None),
        SiteEntry("im-2-target", "IM-2, punto previsto", -84.78, 29.13, "previsto", "LROC", None),
    )
    collection = build_sites(dataclasses.replace(catalog, sites=sites), built[1])
    inside, im2 = (f["properties"] for f in collection["features"])
    assert inside["region"] == "malapert-massif"
    assert im2["region"] is None  # IM-2 non cade in nessuna regione Artemis con contorno
    xmin, ymin, xmax, ymax = inside["cell_bounds_m"]
    assert (xmax - xmin, ymax - ymin) == pytest.approx((100.0, 100.0))
    assert im2["dem_near"] == "ldem_85s_10m"
