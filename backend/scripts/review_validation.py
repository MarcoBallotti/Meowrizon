"""Reproduce validation with immutable tolerances and source fingerprints."""

import hashlib
import importlib.metadata
import json
import platform
from datetime import UTC, datetime
from pathlib import Path

from app.core.config import get_settings
from app.services.engine.orchestrator import EnginePaths, load_request
from app.services.engine.validation import run_validation, write_evidence


def fingerprints():
    files = sorted(
        p
        for folder in ("app", "config", "scripts", "tests")
        for p in Path(folder).rglob("*")
        if p.is_file() and p.suffix in (".py", ".json")
    )
    return {str(p): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}


paths = EnginePaths.default()
tol_path = Path("config/analysis.tolerances.json")
tol_hash = hashlib.sha256(tol_path.read_bytes()).hexdigest()
assert tol_hash == "e1292735b88228a833b5ca4401618ae59c54e8633ab4b6ebbb719615aabe3e2a"
run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%S-%fZ")
manifest = {
    "run_id": run_id,
    "files": fingerprints(),
    "python": platform.python_version(),
    "platform": platform.platform(),
    "packages": {
        name: importlib.metadata.version(name)
        for name in ("numpy", "scipy", "rasterio", "pyproj", "filelock", "pytest", "pydantic")
    },
    "tolerances_sha256": tol_hash,
    "command": "docker compose run --rm --no-deps backend python -m scripts.review_validation",
}
folder = paths.root / "validation/review-20261115"
folder.mkdir(parents=True, exist_ok=True)
(folder / f"manifest-{run_id}.json").write_text(json.dumps(manifest, indent=2))
print(f"Start {run_id}; code and tolerance hashes saved", flush=True)
evidence = run_validation(
    load_request("config/analysis.demo.json"),
    json.loads(tol_path.read_text()),
    paths=paths,
    core=get_settings(),
    checks={"interpolation", "slope", "convergence", "alignment", "eclipse", "lroc"},
)
evidence["reproduction"] = manifest
evidence["code_unchanged_during_run"] = fingerprints() == manifest["files"]
evidence["configuration"] = json.loads(Path("config/analysis.demo.json").read_text())
assert hashlib.sha256(tol_path.read_bytes()).hexdigest() == tol_hash
path = write_evidence(evidence, paths, f"evidence-review-{run_id}.json")
print(path, evidence["summary"], flush=True)
if not evidence["code_unchanged_during_run"]:
    raise SystemExit("Code changed during validation: do not call this a final run")
