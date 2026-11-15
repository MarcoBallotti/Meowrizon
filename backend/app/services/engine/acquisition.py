"""Acquisizione delle fonti per l'engine: riuso di `Collector`, modalità offline e provenienza.

Online le richieste passano da `Collector.fetch`: risposta originale, metadati, SHA-256 e
cache per richiesta. Offline si accetta soltanto un download completo già presente e con hash
verificato; se manca, si ferma tutto con l'elenco di ciò che serve. Nessun dato sintetico.
"""

import hashlib
import json
from pathlib import Path

from filelock import FileLock, Timeout

from app.core.config import Settings as CoreSettings
from app.core.manifest import load_download, save_download
from app.services.regions import moontrek, store
from app.services.regions.build import build_regions
from app.services.regions.catalog import load_catalog
from app.services.sources import FORMATS, Collector, DownloadError


class OfflineDataMissing(RuntimeError):
    """In modalità offline manca un dato reale necessario."""


class AcquisitionError(RuntimeError):
    """Una fonte non ha risposto in modo utilizzabile."""


def fingerprint(entry: dict) -> str:
    """Stessa impronta usata da `Collector.fetch` per la cartella della richiesta."""
    return hashlib.sha256(json.dumps(entry, sort_keys=True).encode()).hexdigest()


def find_cached(raw_dir: Path, entry: dict) -> tuple[Path, dict] | None:
    """Ultimo download completo e integro della richiesta, senza usare la rete."""
    root = Path(raw_dir) / entry["name"] / fingerprint(entry)[:16]
    extension = FORMATS[entry["format"]]
    for metadata_file in sorted(root.glob("*/metadata.json"), reverse=True):
        try:
            metadata = json.loads(metadata_file.read_text(encoding="utf-8"))
            path = metadata_file.parent / f"response{extension}"
            if (
                metadata.get("status") == "complete"
                and path.is_file()
                and hashlib.sha256(path.read_bytes()).hexdigest() == metadata.get("sha256")
            ):
                return path, metadata
        except (OSError, ValueError):
            continue
    return None


class SourceFetcher:
    """Restituisce i file delle fonti e ricorda da dove vengono."""

    def __init__(self, raw_dir, user_agent: str, lock_path, offline: bool = False):
        self.raw_dir = Path(raw_dir)
        self.user_agent = user_agent
        self.lock_path = Path(lock_path)
        self.offline = offline
        self.records: dict[str, dict] = {}
        self.downloads = 0
        self.cache_hits = 0
        self._collector: Collector | None = None
        self._lock: FileLock | None = None

    def __enter__(self):
        return self

    def __exit__(self, *_):
        if self._collector is not None:
            self._collector.session.close()
        if self._lock is not None:
            self._lock.release()

    def _online(self) -> Collector:
        if self._collector is None:
            self.lock_path.parent.mkdir(parents=True, exist_ok=True)
            self._lock = FileLock(self.lock_path, timeout=0)
            try:
                self._lock.acquire()
            except Timeout as exc:
                self._lock = None
                raise AcquisitionError(
                    "Un'altra acquisizione è in corso: le richieste alle fonti sono seriali"
                ) from exc
            self._collector = Collector(self.raw_dir, self.user_agent)
        return self._collector

    def get(self, entry: dict, role: str, details: dict | None = None) -> tuple[Path, str]:
        """Percorso del file e suo SHA-256. Registra la fonte nel manifest."""
        found = find_cached(self.raw_dir, entry)
        if found is None:
            if self.offline:
                raise OfflineDataMissing(
                    f"Modalità offline: manca '{entry['name']}' "
                    f"({entry.get('params', {}).get('bbox') or entry['url']})"
                )
            try:
                self._online().fetch(entry)
            except (DownloadError, OSError) as exc:
                raise AcquisitionError(f"{entry['name']}: {exc}") from exc
            self.downloads += 1
            found = find_cached(self.raw_dir, entry)
            if found is None:
                raise AcquisitionError(f"{entry['name']}: download non ritrovato in cache")
        else:
            self.cache_hits += 1
        path, metadata = found
        key = f"{entry['name']}:{fingerprint(entry)[:16]}"
        self.records[key] = {
            "name": entry["name"],
            "provider": entry["provider"],
            "role": role,
            "url": entry["url"],
            "params": entry.get("params"),
            "sha256": metadata["sha256"],
            "bytes": int(metadata["bytes"]),
            "fetched_at_utc": metadata.get("fetched_at_utc"),
            "stored_as": str(path.relative_to(self.raw_dir)),
            "details": details,
        }
        return path, metadata["sha256"]

    def add_record(self, key: str, record: dict) -> None:
        self.records[key] = record

    def sorted_records(self) -> list[dict]:
        return [self.records[key] for key in sorted(self.records)]


def load_regions(core: CoreSettings, fetcher: SourceFetcher) -> dict:
    """Poligoni delle regioni attive del catalogo, in metri stereografici.

    Riusa il download registrato da `init-regions`; online lo acquisisce se manca.
    """
    sources = store.sources_dir(core)
    try:
        content, entry = load_download(sources, moontrek.SOURCE_NAME)
    except FileNotFoundError as exc:
        if fetcher.offline:
            raise OfflineDataMissing(
                "Modalità offline: mancano i poligoni delle regioni. "
                "Eseguire prima `python -m app init-regions`."
            ) from exc
        try:
            content = moontrek.fetch_regions(core)
        except Exception as error:  # rete o risposta non valida della fonte
            raise AcquisitionError(f"Poligoni Moon Trek: {error}") from error
        entry = save_download(
            sources,
            moontrek.SOURCE_NAME,
            moontrek.layer_url(core),
            moontrek.QUERY_PARAMS,
            moontrek.RAW_FILENAME,
            content,
        )
    catalog = load_catalog(core.catalog_dir)
    _, built, _ = build_regions(
        catalog, moontrek.parse_response(content), {"name": moontrek.SOURCE_NAME, **entry}
    )
    fetcher.add_record(
        f"{moontrek.SOURCE_NAME}:{entry['sha256'][:16]}",
        {
            "name": moontrek.SOURCE_NAME,
            "provider": "moon_trek",
            "role": "region_polygons",
            "url": entry["url"],
            "params": entry.get("params"),
            "sha256": entry["sha256"],
            "bytes": int(entry["bytes"]),
            "fetched_at_utc": entry.get("retrieved_at"),
            "stored_as": f"sources/{entry['file']}",
            "details": {
                "catalog": "NASA 2022 Artemis III candidate regions (A3_Named_regions_SP)",
                "projection": "Moon2000_spole, sfera 1737400 m",
            },
        },
    )
    return {region.entry.id: region for region in built if region.entry.active}
