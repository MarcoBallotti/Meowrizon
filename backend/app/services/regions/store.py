"""Percorsi e lettura/scrittura dei file delle regioni in data/."""

import json
from pathlib import Path
from typing import Any

from app.core.config import Settings


def sources_dir(settings: Settings) -> Path:
    return settings.data_dir / "sources"


def regions_dir(settings: Settings) -> Path:
    return settings.data_dir / "regions"


def regions_path(settings: Settings) -> Path:
    return regions_dir(settings) / "regions.geojson"


def sites_path(settings: Settings) -> Path:
    return regions_dir(settings) / "sites.geojson"


def write_geojson(path: Path, collection: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    # Compatto: i poligoni hanno centinaia di vertici e l'indentazione triplicherebbe il file.
    text = json.dumps(collection, ensure_ascii=False, separators=(",", ":"))
    tmp.write_text(text + "\n", encoding="utf-8")
    tmp.replace(path)


def read_geojson(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
