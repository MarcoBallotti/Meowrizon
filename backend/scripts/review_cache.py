"""Verify real-data repeatability with complete offline cache and blocked network."""

import hashlib
import json
from pathlib import Path
from unittest.mock import patch

from app.services.engine.orchestrator import load_request, result_json, run_analysis

request = load_request("config/analysis.demo.json")
rows = []
with patch("requests.sessions.Session.request", side_effect=AssertionError("Network forbidden")):
    for _ in range(2):
        result, report = run_analysis(request, offline=True)
        payload = result_json(result)
        digest = hashlib.sha256(
            payload.encode() if isinstance(payload, str) else payload
        ).hexdigest()
        rows.append({"sha256": digest, "report": report.__dict__})
assert rows[0]["sha256"] == rows[1]["sha256"]
folder = Path("data/analysis/validation/review-20261115")
(folder / "real-offline-repeatability.json").write_text(json.dumps(rows, indent=2))
print(json.dumps(rows, indent=2))
