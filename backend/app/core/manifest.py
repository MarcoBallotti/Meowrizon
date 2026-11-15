"""Registro dei file scaricati dalle fonti (data/sources/manifest.json).

Per ogni download si annotano URL, parametri, data, dimensione e SHA-256, così ogni dato del
progetto è riconducibile alla sua fonte e si può verificare che il file non sia cambiato.
"""

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


def save_download(
    sources_dir: Path, name: str, url: str, params: dict[str, str], filename: str, content: bytes
) -> dict[str, Any]:
    """Salva il contenuto scaricato e aggiorna il registro. Restituisce la voce del registro."""
    sources_dir.mkdir(parents=True, exist_ok=True)
    _write_atomic(sources_dir / filename, content)
    entry = {
        "url": url,
        "params": params,
        "file": filename,
        "retrieved_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    manifest = read_manifest(sources_dir)
    manifest[name] = entry
    _write_atomic(
        sources_dir / "manifest.json",
        (json.dumps(manifest, indent=2, ensure_ascii=False) + "\n").encode("utf-8"),
    )
    return entry


def read_manifest(sources_dir: Path) -> dict[str, Any]:
    path = sources_dir / "manifest.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def load_download(sources_dir: Path, name: str) -> tuple[bytes, dict[str, Any]]:
    """Rilegge un download già fatto e controlla che il file corrisponda al registro."""
    entry = read_manifest(sources_dir).get(name)
    if entry is None:
        raise FileNotFoundError(f"'{name}' non è nel registro {sources_dir / 'manifest.json'}")
    content = (sources_dir / entry["file"]).read_bytes()
    if hashlib.sha256(content).hexdigest() != entry["sha256"]:
        raise ValueError(f"Il file {entry['file']} non corrisponde allo SHA-256 del registro")
    return content, entry


def _write_atomic(path: Path, content: bytes) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_bytes(content)
    tmp.replace(path)
