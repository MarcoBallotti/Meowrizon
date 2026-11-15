"""Download dei contorni delle regioni Artemis III dal layer Moon Trek A3_Named_regions_SP [F3]."""

import json
from typing import Any

import httpx

from app.core.config import Settings

SOURCE_NAME = "moontrek_a3_named_regions_sp"
RAW_FILENAME = "moontrek_a3_regions.json"
LAYER_PATH = "/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query"
# f=json: con f=geojson il servizio rifiuta il sistema di riferimento lunare.
QUERY_PARAMS = {"where": "1=1", "outFields": "label", "returnGeometry": "true", "f": "json"}


class SourceError(RuntimeError):
    """La fonte non ha risposto come previsto."""


def layer_url(settings: Settings) -> str:
    return settings.moontrek_base_url.rstrip("/") + LAYER_PATH


def fetch_regions(settings: Settings) -> bytes:
    """Scarica la risposta grezza (JSON ArcGIS) e controlla che contenga i poligoni."""
    response = httpx.get(layer_url(settings), params=QUERY_PARAMS, timeout=settings.http_timeout_s)
    response.raise_for_status()
    parse_response(response.content)  # solo controllo
    return response.content


def parse_response(content: bytes) -> dict[str, Any]:
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise SourceError("Moon Trek non ha restituito JSON") from exc
    # ArcGIS risponde 200 anche agli errori, con un oggetto "error".
    if "error" in data:
        raise SourceError(f"Moon Trek ha restituito un errore: {data['error']}")
    if data.get("geometryType") != "esriGeometryPolygon" or not data.get("features"):
        raise SourceError("La risposta di Moon Trek non contiene poligoni")
    wkt = data.get("spatialReference", {}).get("wkt", "")
    if "Stereographic_South_Pole" not in wkt or "1737400" not in wkt:
        raise SourceError(
            "Sistema di riferimento inatteso: serve la stereografica polare sud su sfera 1737400 m"
        )
    return data
