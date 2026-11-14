"""Stato del servizio."""

import os

from fastapi import APIRouter

from app import __version__
from app.core.config import get_settings

router = APIRouter(tags=["stato"])


@router.get("/health")
def health() -> dict[str, object]:
    """Stato del servizio e della cartella dei dati."""
    data_dir = get_settings().data_dir
    return {
        "status": "ok",
        "version": __version__,
        "data_dir": str(data_dir),
        "data_dir_writable": data_dir.is_dir() and os.access(data_dir, os.W_OK),
    }
