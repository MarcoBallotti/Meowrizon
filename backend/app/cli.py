"""Comandi da terminale del backend.

Regioni e siti:
    python -m app.cli init-regions            scarica i contorni da Moon Trek e crea i GeoJSON
    python -m app.cli init-regions --offline  riusa l'ultimo download registrato in data/sources

Acquisizione e preparazione dei dati grezzi (backend/data, vedi backend/README.md):
    python -m app fetch [--config ...] [--only NOME] [--refresh]
    python -m app prepare
    python -m app data-info [--name NOME]
"""

import argparse
import json
import sys
from pathlib import Path

import httpx

from app.core.config import get_settings
from app.core.manifest import load_download, save_download
from app.services.regions import moontrek, store
from app.services.regions.build import RegionBuildError, build_regions, build_sites
from app.services.regions.catalog import CatalogError, load_catalog
from app.services.sources import Collector, DownloadError, validate_entries
from app.settings import Settings, inside_backend

SETTINGS = Settings()


# --- Regioni e siti ---------------------------------------------------------------------------


def init_regions(offline: bool) -> int:
    settings = get_settings()
    catalog = load_catalog(settings.catalog_dir)
    sources = store.sources_dir(settings)

    if offline:
        content, entry = load_download(sources, moontrek.SOURCE_NAME)
        print(f"Uso il download del {entry['retrieved_at']} ({entry['file']})")
    else:
        print(f"Scarico le regioni da {moontrek.layer_url(settings)}")
        content = moontrek.fetch_regions(settings)
        entry = save_download(
            sources,
            moontrek.SOURCE_NAME,
            moontrek.layer_url(settings),
            moontrek.QUERY_PARAMS,
            moontrek.RAW_FILENAME,
            content,
        )

    source = {"name": moontrek.SOURCE_NAME, **entry}
    regions_fc, built, warnings = build_regions(catalog, moontrek.parse_response(content), source)
    sites_fc = build_sites(catalog, built)
    store.write_geojson(store.regions_path(settings), regions_fc)
    store.write_geojson(store.sites_path(settings), sites_fc)

    _print_summary(regions_fc, sites_fc, warnings)
    print(f"Scritti {store.regions_path(settings)} e {store.sites_path(settings)}")
    return 0


def _print_summary(regions_fc: dict, sites_fc: dict, warnings: list[str]) -> None:
    print(f"\n{'regione':<28} {'liste':<10} {'attiva':<7} {'km²':>7}  {'celle':>9}  DEM vicino")
    for f in regions_fc["features"]:
        p = f["properties"]
        lists = ",".join(p["lists"])
        cells = f"{p['cells_x']}×{p['cells_y']}" if p["grid_aligned"] else "non allin."
        print(
            f"{p['id']:<28} {lists:<10} {'sì' if p['active'] else 'no':<7} "
            f"{p['area_km2']:>7.1f}  {cells:>9}  {p['dem_near']}"
        )
    print(f"\nSiti: {len(sites_fc['features'])}")
    for f in sites_fc["features"]:
        p = f["properties"]
        if p["in_sector"]:
            print(f"  {p['id']}: regione {p['region'] or 'nessuna'}, DEM {p['dem_near']}")
        else:
            print(f"  {p['id']}: fuori dal settore, DEM globale da definire")
    for w in warnings:
        print(f"Avviso: {w}")


# --- Acquisizione e preparazione dei dati grezzi ----------------------------------------------


def _fetch(args):
    args.config = inside_backend(args.config)
    args.output = inside_backend(args.output)
    entries = json.loads(args.config.read_text(encoding="utf-8"))["downloads"]
    validate_entries(entries)
    unknown = set(args.only) - {entry["name"] for entry in entries}
    if unknown:
        raise ValueError(f"Unknown download names: {', '.join(sorted(unknown))}")
    failed = []
    from filelock import FileLock

    SETTINGS.collection_lock.parent.mkdir(parents=True, exist_ok=True)
    with (
        FileLock(SETTINGS.collection_lock, timeout=0),
        Collector(args.output, SETTINGS.user_agent) as collector,
    ):
        for entry in entries:
            if args.only and entry["name"] not in args.only:
                continue
            print(f"Fetching {entry['name']}…")
            try:
                path, cached = collector.fetch(entry, refresh=args.refresh)
                print(f"  {'Cached' if cached else 'Saved'}: {path}")
            except (DownloadError, OSError) as exc:
                failed.append(entry["name"])
                print(f"  Failed: {exc}", file=sys.stderr)
    if failed:
        raise ValueError(
            f"Failed downloads: {', '.join(failed)}. Successful files remain in {args.output}."
        )
    print(f"Done. Raw responses and metadata are in {args.output}.")


def _data_command(args) -> int:
    try:
        if args.command == "fetch":
            _fetch(args)
        else:
            from app.services.storage import DataStore

            if args.command == "prepare":
                report = DataStore(inside_backend(args.output), inside_backend(args.raw)).prepare()
                print(json.dumps(report, indent=2))
                if report["failed"]:
                    raise ValueError(
                        "Some snapshots could not be prepared; successful datasets remain usable."
                    )
            else:
                data_store = DataStore(inside_backend(args.prepared), SETTINGS.raw)
                if not data_store.manifest_path.is_file():
                    raise ValueError("No catalog yet. Run the prepare command first.")
                print(json.dumps(data_store.datasets(args.name), indent=2))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0


# --- Ingresso ----------------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app", description="Meowrizon backend tools")
    commands = parser.add_subparsers(dest="command", required=True)

    init = commands.add_parser("init-regions", help="Crea regions.geojson e sites.geojson")
    init.add_argument("--offline", action="store_true", help="Riusa l'ultimo download registrato")

    raw = SETTINGS.raw
    prepared = SETTINGS.prepared
    fetch = commands.add_parser("fetch", help="Save original API responses and provenance")
    fetch.add_argument("--config", type=Path, default=SETTINGS.configuration())
    fetch.add_argument("--output", type=Path, default=raw)
    fetch.add_argument(
        "--only", action="append", default=[], help="Repeat to select several source names"
    )
    fetch.add_argument(
        "--refresh", action="store_true", help="Save a new snapshot, preserving old downloads"
    )
    prepare = commands.add_parser(
        "prepare", help="Prepare local JSON/Parquet files without network access"
    )
    prepare.add_argument("--raw", type=Path, default=raw)
    prepare.add_argument("--output", type=Path, default=prepared)
    info = commands.add_parser(
        "data-info", help="List saved dataset IDs, preparation status and counts"
    )
    info.add_argument("--prepared", type=Path, default=prepared)
    info.add_argument("--name")
    args = parser.parse_args(argv)

    if args.command != "init-regions":
        return _data_command(args)

    try:
        return init_regions(args.offline)
    except (CatalogError, RegionBuildError, moontrek.SourceError, FileNotFoundError) as exc:
        print(f"Errore: {exc}", file=sys.stderr)
    except (ValueError, json.JSONDecodeError) as exc:
        print(f"Errore nei dati: {exc}", file=sys.stderr)
    except httpx.HTTPError as exc:
        print(f"Errore di rete: {exc}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
