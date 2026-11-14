"""Applicazione FastAPI di Meowrizon.

Tutta la logica (dati, calcoli, classifica, agente AI) sta nel backend Python.
Il frontend React/TypeScript chiama queste API e si occupa solo della visualizzazione.

Tutte le rotte stanno sotto /api, come prevede il contratto con il frontend
(docs/api-contract.md, backend/API_CONTRACT.md): il server di Vite in sviluppo e nginx in
produzione inoltrano /api al backend senza modificare il percorso.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.health import router as health_router
from app.api.regions import router as regions_router
from app.core.config import get_settings

API_PREFIX = "/api"


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Meowrizon API",
        version=__version__,
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
    )

    # Serve solo alle chiamate dirette dal browser (per esempio dal server di Vite fuori
    # da Docker); passando dal proxy /api il browser vede un'unica origine.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_methods=["GET", "POST"],  # il contratto prevede POST per le analisi
        allow_headers=["*"],
    )

    app.include_router(health_router, prefix=API_PREFIX)
    app.include_router(regions_router, prefix=API_PREFIX)
    return app


app = create_app()
