"""Configurazione del backend, letta dalle variabili d'ambiente."""

import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

# backend/app/core/config.py -> backend/ e radice del repository
_BACKEND_DIR = Path(__file__).resolve().parents[2]
_REPO_ROOT = _BACKEND_DIR.parent

DEFAULT_HORIZONS_API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DEFAULT_MOONTREK_BASE_URL = "https://trek.nasa.gov/moon"
DEFAULT_PDS_LOLA_BASE_URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx"
# Server di sviluppo di Vite (porta di default 5173).
DEFAULT_CORS_ORIGINS = "http://localhost:5173,http://127.0.0.1:5173"


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    catalog_dir: Path
    horizons_api_url: str
    moontrek_base_url: str
    pds_lola_base_url: str
    http_timeout_s: float
    cors_origins: tuple[str, ...]


def _split_list(value: str) -> tuple[str, ...]:
    return tuple(item.strip() for item in value.split(",") if item.strip())


def load_settings() -> Settings:
    """Legge la configurazione dall'ambiente, con i default per lo sviluppo locale."""
    return Settings(
        data_dir=Path(os.environ.get("MEOWRIZON_DATA_DIR", _REPO_ROOT / "data")),
        catalog_dir=Path(os.environ.get("MEOWRIZON_CATALOG_DIR", _BACKEND_DIR / "catalog")),
        horizons_api_url=os.environ.get("HORIZONS_API_URL", DEFAULT_HORIZONS_API_URL),
        moontrek_base_url=os.environ.get("MOONTREK_BASE_URL", DEFAULT_MOONTREK_BASE_URL),
        pds_lola_base_url=os.environ.get("PDS_LOLA_BASE_URL", DEFAULT_PDS_LOLA_BASE_URL),
        http_timeout_s=float(os.environ.get("HTTP_TIMEOUT_S", "60")),
        cors_origins=_split_list(os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)),
    )


@lru_cache
def get_settings() -> Settings:
    return load_settings()
