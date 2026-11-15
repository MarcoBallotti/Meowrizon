"""Persistent terrain jobs, one worker, immutable completed results and polling."""

import hashlib
import json
import logging
import re
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

from .storage import _write_json
from .ephemerides.scenario import VERSION as SCENARIO_VERSION
from .ephemerides.scenario import calculate as calculate_scenario
from .terrain.engine import VERSION, TerrainError, calculate

LOG = logging.getLogger(__name__)


class ScientificJobs:
    def __init__(self, settings):
        self.root = settings.root
        self.directory = settings.jobs / "scientific"
        self.executor = None
        self.lock = threading.Lock()
        self.pending = {}

    def start(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        for path in self.directory.glob("*.json"):
            record = json.loads(path.read_text())
            if record["job"]["status"] in {"queued", "running"}:
                record["job"] = {
                    "id": record["job"]["id"],
                    "status": "failed",
                    "error": {
                        "code": "service_interrupted",
                        "message": "Service stopped during calculation. Retry the request.",
                    },
                }
                _write_json(path, record)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="terrain")

    def close(self):
        if self.executor:
            self.executor.shutdown(wait=True)

    def submit(self, kind, parameters):
        key = hashlib.sha256(
            json.dumps([VERSION, SCENARIO_VERSION, kind, parameters], sort_keys=True).encode()
        ).hexdigest()
        with self.lock:
            if key in self.pending:
                return self.get(kind, self.pending[key])
            for path in self.directory.glob("*.json"):
                saved = json.loads(path.read_text())
                if saved.get("key") == key and saved["job"]["status"] == "completed":
                    return saved["job"]
            if len(self.pending) >= 8:
                raise ValueError("Terrain queue is full; wait for a current job to finish.")
            identifier = uuid.uuid4().hex
            record = {
                "kind": kind,
                "parameters": parameters,
                "key": key,
                "createdAt": datetime.now(UTC).isoformat(),
                "job": {
                    "id": identifier,
                    "status": "queued",
                    "progress": 0,
                    "message": "Terrain request queued",
                },
            }
            self._save(record)
            if self.executor is None:
                raise RuntimeError("Scientific worker not started")
            self.pending[key] = identifier
            self.executor.submit(self._run, record)
            return dict(record["job"])

    def _save(self, record):
        _write_json(self.directory / f"{record['job']['id']}.json", record)

    def _run(self, record):
        identifier = record["job"]["id"]

        def progress(value, message):
            record["job"] = {
                "id": identifier,
                "status": "running",
                "progress": value,
                "message": message,
            }
            self._save(record)

        try:
            if record["kind"] == "terrain":
                result = calculate(self.root, record["parameters"], progress)
            else:
                terrain = self.terrain_result(record["parameters"]["terrainAnalysisId"])
                result = calculate_scenario(self.root, record["parameters"], terrain, progress)
            record["job"] = {
                "id": identifier,
                "status": "completed",
                "progress": 1,
                "result": result,
            }
        except Exception as exc:
            if isinstance(exc, TerrainError):
                LOG.warning("Scientific job %s: %s", identifier, exc)
            else:
                LOG.exception("Scientific calculation failed")
            record["job"] = {
                "id": identifier,
                "status": "failed",
                "error": {
                    "code": "terrain_data_unavailable"
                    if record["kind"] == "terrain"
                    else "scenario_data_unavailable",
                    "message": str(exc)
                    if isinstance(exc, TerrainError)
                    else "A source could not be loaded. Check backend logs and retry.",
                },
            }
        finally:
            with self.lock:
                try:
                    self._save(record)
                finally:
                    self.pending.pop(record["key"], None)

    def get(self, kind, identifier):
        if not re.fullmatch(r"[a-f0-9]{32}", identifier):
            raise KeyError(identifier)
        try:
            record = json.loads((self.directory / f"{identifier}.json").read_text())
        except FileNotFoundError as exc:
            raise KeyError(identifier) from exc
        if record["kind"] != kind:
            raise KeyError(identifier)
        return record["job"]

    def terrain_result(self, identifier):
        for path in self.directory.glob("*.json"):
            record = json.loads(path.read_text())
            job = record["job"]
            if record["kind"] == "terrain" and job["status"] == "completed":
                if job["result"]["id"] == identifier:
                    return job["result"]
        raise TerrainError("Terrain analysis not found. Calculate terrain before its scenario.")
