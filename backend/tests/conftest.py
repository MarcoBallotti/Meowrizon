import json
from pathlib import Path

import pytest

from app.core.config import get_settings
from app.services.regions.catalog import load_catalog

FIXTURES = Path(__file__).parent / "fixtures"
CATALOG_DIR = Path(__file__).resolve().parents[1] / "catalog"


@pytest.fixture
def moontrek_bytes() -> bytes:
    """Risposta reale del layer Moon Trek A3_Named_regions_SP, salvata il 14/11/2026."""
    return (FIXTURES / "moontrek_a3_regions.json").read_bytes()


@pytest.fixture
def moontrek_data(moontrek_bytes) -> dict:
    return json.loads(moontrek_bytes)


@pytest.fixture
def catalog():
    return load_catalog(CATALOG_DIR)


@pytest.fixture
def data_env(tmp_path, monkeypatch):
    """Cartella dati temporanea per API e comandi."""
    monkeypatch.setenv("MEOWRIZON_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("MEOWRIZON_CATALOG_DIR", str(CATALOG_DIR))
    get_settings.cache_clear()
    yield tmp_path
    get_settings.cache_clear()
