"""Run the unchanged tests on Docker's native filesystem; keep bind-mount failures."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

root = Path.cwd()
output = root / "data/analysis/validation/review-20261115"
with tempfile.TemporaryDirectory(prefix="meowrizon-validation-") as name:
    target = Path(name) / "backend"
    shutil.copytree(
        root,
        target,
        ignore=shutil.ignore_patterns(
            "data", "__pycache__", ".pytest_cache", ".ruff_cache", ".venv", "*.pdf"
        ),
    )
    result = subprocess.run(
        ["pytest", "--junitxml=" + str(output / "tests-native.xml")],
        cwd=target,
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    (output / "tests-native.txt").write_text(result.stdout + result.stderr)
    (output / "tests-native-status.json").write_text(
        json.dumps(
            {
                "exit_code": result.returncode,
                "note": ("same source and tests copied to native container filesystem; "
                         "no tests skipped beyond project network default"),
            }
        )
    )
    print(result.stdout, result.stderr)
    raise SystemExit(result.returncode)
