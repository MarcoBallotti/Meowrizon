"""Applicazione FastAPI di Meowrizon.

Tutta la logica (dati, calcoli, classifica, agente AI) sta nel backend Python.
Il frontend React/TypeScript chiama queste API e si occupa solo della visualizzazione.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.health import router as health_router
from app.api.regions import router as regions_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Meowrizon API", version=__version__)

    # Il frontend in sviluppo gira su un'altra porta (Vite, 5173): il browser
    # blocca le sue richieste se il backend non le autorizza esplicitamente.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET"],  # per ora le API sono solo in lettura
        allow_headers=["*"],
    )

    app.include_router(health_router)
    app.include_router(regions_router)
    return app


app = create_app()
