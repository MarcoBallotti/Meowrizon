"""Comandi da terminale del backend.

python -m app.cli init-regions            scarica i contorni da Moon Trek e crea i GeoJSON
python -m app.cli init-regions --offline  riusa l'ultimo download registrato in data/sources
"""

import argparse
import json
import sys

import httpx

from app.core.config import get_settings
from app.core.manifest import load_download, save_download
from app.services.regions import moontrek, store
from app.services.regions.build import RegionBuildError, build_regions, build_sites
from app.services.regions.catalog import CatalogError, load_catalog


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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    commands = parser.add_subparsers(dest="command", required=True)
    init = commands.add_parser("init-regions", help="Crea regions.geojson e sites.geojson")
    init.add_argument("--offline", action="store_true", help="Riusa l'ultimo download registrato")
    args = parser.parse_args(argv)

    try:
        if args.command == "init-regions":
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
