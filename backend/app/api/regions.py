"""Regioni Artemis III e siti di atterraggio, letti dai file creati da init-regions."""

from typing import Any

from fastapi import APIRouter, HTTPException

from app.core.config import get_settings
from app.services.regions import store

router = APIRouter(tags=["regioni"])

_NOT_READY = "Dati non inizializzati: eseguire `python -m app.cli init-regions`"


@router.get("/regions")
def regions(active: bool | None = None) -> dict[str, Any]:
    """Regioni in GeoJSON (gradi, longitudine Est ±180). Con `active` filtra per stato."""
    collection = _load(store.regions_path(get_settings()))
    if active is not None:
        collection["features"] = [
            f for f in collection["features"] if f["properties"]["active"] is active
        ]
    return collection


@router.get("/sites")
def sites() -> dict[str, Any]:
    """Siti di atterraggio in GeoJSON, ognuno con la sua cella di 100 × 100 m."""
    return _load(store.sites_path(get_settings()))


def _load(path) -> dict[str, Any]:
    collection = store.read_geojson(path)
    if collection is None:
        raise HTTPException(status_code=503, detail=_NOT_READY)
    return collection
