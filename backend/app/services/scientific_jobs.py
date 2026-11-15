"""File-backed scientific request receipts, distinct from acquisition jobs.

The calculation engines are unavailable. Accepted inputs terminate explicitly in
failed state; queued/running/completed are never asserted without actual work.
There is no automatic retry or completed-result cache policy in this adapter.
"""

import json
import re
import uuid
from datetime import UTC, datetime

from .storage import _write_json

ERRORS = {
    "terrain": {
        "code": "terrain_engine_unavailable",
        "message": "Terrain calculation is unavailable: the PGDA DEM and horizon engine "
        "have not been prepared and validated. No synthetic terrain was substituted.",
    },
    "scenario": {
        "code": "scenario_engine_unavailable",
        "message": "Scenario calculation is unavailable: a completed terrain result and "
        "a validated Horizons/scientific adapter are required. "
        "No synthetic scenario was substituted.",
    },
}


class ScientificJobs:
    def __init__(self, settings):
        self.directory = settings.jobs / "scientific"

    def submit(self, kind, parameters):
        identifier = uuid.uuid4().hex
        job = {"id": identifier, "status": "failed", "error": dict(ERRORS[kind])}
        self.directory.mkdir(parents=True, exist_ok=True)
        _write_json(
            self.directory / f"{identifier}.json",
            {
                "kind": kind,
                "parameters": parameters,
                "createdAt": datetime.now(UTC).isoformat(),
                "job": job,
            },
        )
        return job

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
