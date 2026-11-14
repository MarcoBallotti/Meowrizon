"""Applicazione FastAPI di Meowrizon.

Tutta la logica (dati, calcoli, classifica, agente AI) sta nel backend Python.
Il frontend React/TypeScript chiama queste API e si occupa solo della visualizzazione.

Tutte le rotte stanno sotto /api, come prevede il contratto con il frontend
(docs/api-contract.md, backend/API_CONTRACT.md): il server di Vite in sviluppo e nginx in
produzione inoltrano /api al backend senza modificare il percorso.

Rotte:
- /api/health, /api/regions, /api/sites: servizio, regioni Artemis III e siti (app.api);
- /api/data/...: acquisizione, preparazione e filtro dei dati grezzi in backend/data
  (app.routes, con i job persistenti di app.services.jobs).
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import __version__
from app.api.health import router as health_router
from app.api.regions import router as regions_router
from app.core.config import get_settings
from app.routes import router as data_router
from app.services.jobs import DataJobs
from app.services.normalization import PreparationError
from app.settings import Settings as DataSettings

API_PREFIX = "/api"


def create_app(data_settings: DataSettings | None = None) -> FastAPI:
    """data_settings: cartelle dei dati grezzi di /api/data (di default backend/data)."""
    settings = get_settings()
    data_settings = data_settings or DataSettings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # Un solo worker per cartella di dati: i job interrotti sono segnati come falliti.
        jobs = DataJobs(data_settings)
        jobs.start()
        app.state.data_jobs = jobs
        try:
            yield
        finally:
            jobs.close()

    app = FastAPI(
        title="Meowrizon API",
        version=__version__,
        docs_url=f"{API_PREFIX}/docs",
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = data_settings

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
    app.include_router(data_router)  # ha già il prefisso /api/data

    @app.exception_handler(PreparationError)
    async def preparation_error(request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.get("/health", tags=["service"], include_in_schema=False)
    def root_health() -> dict[str, str]:
        """Solo processo attivo, anche fuori da /api (usato dai comandi del README del backend)."""
        return {"status": "ok"}

    return app


app = create_app()
