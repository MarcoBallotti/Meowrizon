"""Cache dei risultati derivati, separata per terreno e per serie temporali.

La chiave è lo SHA-256 del JSON canonico di tutti gli input scientifici: cambiare DEM, punto,
metodo o versione produce un'altra chiave. Si salva solo un risultato completo.
"""

import hashlib
import json
from pathlib import Path


def canonical(value) -> bytes:
    return json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False
    ).encode("utf-8")


def key_of(value) -> str:
    return hashlib.sha256(canonical(value)).hexdigest()


class JsonCache:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.hits = 0
        self.misses = 0

    def _path(self, key: str) -> Path:
        return self.directory / f"{key}.json"

    def get(self, key: str) -> dict | None:
        path = self._path(key)
        try:
            stored = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            self.misses += 1
            return None
        if stored.get("key") != key or stored.get("complete") is not True:
            self.misses += 1
            return None
        self.hits += 1
        return stored["payload"]

    def put(self, key: str, inputs: dict, payload: dict) -> None:
        self.directory.mkdir(parents=True, exist_ok=True)
        document = {"key": key, "complete": True, "inputs": inputs, "payload": payload}
        temporary = self._path(key).with_suffix(".json.tmp")
        temporary.write_text(
            json.dumps(document, ensure_ascii=False, allow_nan=False), encoding="utf-8"
        )
        temporary.replace(self._path(key))
