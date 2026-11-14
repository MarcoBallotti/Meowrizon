"""Controlla che le librerie native dell'ambiente conda si carichino davvero."""

import importlib

import pytest

MODULES = ["osgeo.gdal", "rasterio", "numpy", "scipy.ndimage", "pyproj", "shapely", "httpx"]


@pytest.mark.parametrize("name", MODULES)
def test_import(name):
    importlib.import_module(name)


def test_pyproj_has_proj_database():
    from pyproj import CRS

    # Stereografica polare sud sulla sfera lunare, come i DEM LOLA e i poligoni Artemis.
    crs = CRS.from_proj4("+proj=stere +lat_0=-90 +lon_0=0 +k=1 +x_0=0 +y_0=0 +R=1737400 +units=m")
    assert crs.is_projected
