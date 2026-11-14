"""Standalone FastAPI data service, started from the backend directory."""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .routes import router
from .services.jobs import DataJobs
from .services.normalization import PreparationError
from .settings import Settings


def create_app(settings=None):
    settings = settings or Settings()

    @asynccontextmanager
    async def lifespan(app):
        jobs = DataJobs(settings)
        jobs.start()
        app.state.data_jobs = jobs
        try:
            yield
        finally:
            jobs.close()

    app = FastAPI(
        title="Meowrizon",
        description="Collect, prepare and filter lunar source data using backend-local files.",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.include_router(router)

    @app.exception_handler(PreparationError)
    async def preparation_error(request, exc):
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.get("/health", tags=["service"])
    def health() -> dict[str, str]:
        """Process liveness only; does not claim terrain or analysis is available."""
        return {"status": "ok"}

    return app


app = create_app()
