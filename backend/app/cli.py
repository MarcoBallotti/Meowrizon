"""Offline source acquisition and file preparation, independent of the HTTP server."""

import argparse
import json
import sys
from pathlib import Path

from .services.sources import Collector, DownloadError, validate_entries
from .settings import Settings, inside_backend


SETTINGS = Settings()


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
    with FileLock(SETTINGS.collection_lock, timeout=0), Collector(args.output, SETTINGS.user_agent) as collector:
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
        raise ValueError(f"Failed downloads: {', '.join(failed)}. Successful files remain in {args.output}.")
    print(f"Done. Raw responses and metadata are in {args.output}.")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Meowrizon file-based data tools")
    commands = parser.add_subparsers(dest="command", required=True)
    raw = SETTINGS.raw
    prepared = SETTINGS.prepared
    fetch = commands.add_parser("fetch", help="Save original API responses and provenance")
    fetch.add_argument("--config", type=Path, default=SETTINGS.configuration())
    fetch.add_argument("--output", type=Path, default=raw)
    fetch.add_argument("--only", action="append", default=[], help="Repeat to select several source names")
    fetch.add_argument("--refresh", action="store_true", help="Save a new snapshot, preserving old downloads")
    prepare = commands.add_parser("prepare", help="Prepare local JSON/Parquet files without network access")
    prepare.add_argument("--raw", type=Path, default=raw)
    prepare.add_argument("--output", type=Path, default=prepared)
    info = commands.add_parser("data-info", help="List saved dataset IDs, preparation status and counts")
    info.add_argument("--prepared", type=Path, default=prepared)
    info.add_argument("--name")
    args = parser.parse_args(argv)
    try:
        if args.command == "fetch":
            _fetch(args)
        else:
            from .services.storage import DataStore

            if args.command == "prepare":
                report = DataStore(inside_backend(args.output), inside_backend(args.raw)).prepare()
                print(json.dumps(report, indent=2))
                if report["failed"]:
                    raise ValueError("Some snapshots could not be prepared; successful datasets remain usable.")
            else:
                store = DataStore(inside_backend(args.prepared), raw)
                if not store.manifest_path.is_file():
                    raise ValueError("No catalog yet. Run the prepare command first.")
                print(json.dumps(store.datasets(args.name), indent=2))
    except (OSError, ValueError, KeyError, TypeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1
    return 0
