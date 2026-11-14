"""Keep all test-created files inside the standalone backend."""

import tempfile
from pathlib import Path


def temporary_directory():
    root = Path(__file__).resolve().parents[1] / "data/test-tmp"
    root.mkdir(parents=True, exist_ok=True)
    return tempfile.TemporaryDirectory(dir=root)
