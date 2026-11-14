"""Lettura e controllo del catalogo (backend/catalog/regions.toml e sites.toml)."""

import re
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ALLOWED_LISTS = {"2022", "2024"}
ALLOWED_SITE_KINDS = {"atterrato", "previsto", "personalizzato"}
_ID_PATTERN = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class CatalogError(ValueError):
    """Il catalogo contiene un errore: il comando si ferma invece di continuare in silenzio."""


@dataclass(frozen=True)
class Sector:
    name: str
    lat_limit: float


@dataclass(frozen=True)
class RegionEntry:
    id: str
    name: str
    moontrek_label: str | None
    lists: tuple[str, ...]
    active: bool


@dataclass(frozen=True)
class SiteEntry:
    id: str
    name: str
    lat: float
    lon: float
    kind: str
    source: str
    note: str | None


@dataclass(frozen=True)
class Catalog:
    sector: Sector
    cell_size_m: float
    regions: tuple[RegionEntry, ...]
    sites: tuple[SiteEntry, ...]


def load_catalog(catalog_dir: Path) -> Catalog:
    regions_doc = _read_toml(catalog_dir / "regions.toml")
    sites_path = catalog_dir / "sites.toml"
    sites_doc = _read_toml(sites_path) if sites_path.exists() else {}

    sector = _parse_sector(regions_doc.get("sector"))
    cell_size_m = _parse_cell_size(regions_doc.get("grid"))
    regions = tuple(_parse_region(i, raw) for i, raw in enumerate(regions_doc.get("region", [])))
    sites = tuple(_parse_site(i, raw, sector) for i, raw in enumerate(sites_doc.get("site", [])))

    if not regions:
        raise CatalogError("regions.toml non contiene nessuna regione")
    _require_unique([r.id for r in regions] + [s.id for s in sites], "id")
    _require_unique([r.moontrek_label for r in regions if r.moontrek_label], "moontrek_label")
    return Catalog(sector=sector, cell_size_m=cell_size_m, regions=regions, sites=sites)


def _read_toml(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as f:
            return tomllib.load(f)
    except FileNotFoundError as exc:
        raise CatalogError(f"File del catalogo mancante: {path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise CatalogError(f"{path.name}: TOML non valido ({exc})") from exc


def _parse_sector(raw: Any) -> Sector:
    if not isinstance(raw, dict) or "lat_limit" not in raw:
        raise CatalogError("regions.toml: manca [sector] con lat_limit")
    lat_limit = float(raw["lat_limit"])
    if not -90.0 < lat_limit < 0.0:
        raise CatalogError("regions.toml: sector.lat_limit deve essere una latitudine sud (-90…0)")
    return Sector(name=str(raw.get("name", "Settore")), lat_limit=lat_limit)


def _parse_cell_size(raw: Any) -> float:
    if not isinstance(raw, dict) or "cell_size_m" not in raw:
        raise CatalogError("regions.toml: manca [grid] con cell_size_m")
    size = float(raw["cell_size_m"])
    if size <= 0:
        raise CatalogError("regions.toml: grid.cell_size_m deve essere positivo")
    return size


def _parse_region(index: int, raw: dict[str, Any]) -> RegionEntry:
    where = f"regions.toml, regione n. {index + 1}"
    region_id = _required_str(raw, "id", where)
    _check_id(region_id, where)
    where = f"regions.toml, regione '{region_id}'"
    lists = tuple(raw.get("lists", []))
    if not lists or not set(lists) <= ALLOWED_LISTS:
        raise CatalogError(f"{where}: lists deve contenere solo {sorted(ALLOWED_LISTS)}")
    label = raw.get("moontrek_label")
    active = bool(raw.get("active", False))
    if active and not label:
        raise CatalogError(f"{where}: non può essere attiva senza moontrek_label (nessun contorno)")
    return RegionEntry(
        id=region_id,
        name=_required_str(raw, "name", where),
        moontrek_label=str(label) if label else None,
        lists=lists,
        active=active,
    )


def _parse_site(index: int, raw: dict[str, Any], sector: Sector) -> SiteEntry:
    where = f"sites.toml, sito n. {index + 1}"
    site_id = _required_str(raw, "id", where)
    _check_id(site_id, where)
    where = f"sites.toml, sito '{site_id}'"
    source = str(raw.get("source", "")).strip()
    if not source:
        raise CatalogError(f"{where}: manca la fonte (source), obbligatoria per ogni sito")
    kind = _required_str(raw, "kind", where)
    if kind not in ALLOWED_SITE_KINDS:
        raise CatalogError(f"{where}: kind deve essere uno di {sorted(ALLOWED_SITE_KINDS)}")
    lat, lon = float(raw["lat"]), float(raw["lon"])
    if not -90.0 <= lat <= 90.0 or not -180.0 <= lon <= 360.0:
        raise CatalogError(f"{where}: coordinate fuori intervallo (lat {lat}, lon {lon})")
    if lat > sector.lat_limit:
        raise CatalogError(
            f"{where}: latitudine {lat}° fuori dal settore (a sud di {sector.lat_limit}°)"
        )
    note = raw.get("note")
    return SiteEntry(
        id=site_id,
        name=_required_str(raw, "name", where),
        lat=lat,
        lon=lon,
        kind=kind,
        source=source,
        note=str(note) if note else None,
    )


def _required_str(raw: dict[str, Any], key: str, where: str) -> str:
    value = raw.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CatalogError(f"{where}: manca il campo '{key}'")
    return value.strip()


def _check_id(value: str, where: str) -> None:
    if not _ID_PATTERN.match(value):
        raise CatalogError(f"{where}: id '{value}' non valido (minuscole, cifre e trattini)")


def _require_unique(values: list[str], field: str) -> None:
    seen: set[str] = set()
    for value in values:
        if value in seen:
            raise CatalogError(f"Catalogo: {field} '{value}' ripetuto")
        seen.add(value)
