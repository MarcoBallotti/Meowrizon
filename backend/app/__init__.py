"""Backend di Meowrizon.

L'applicazione FastAPI unica sta in app.main; qui si espongono create_app e app anche come
app.create_app e app:app (per esempio `uvicorn app:app`), senza crearla all'import del pacchetto.
"""

__version__ = "0.1.0"


def create_app(settings=None):
    from app.main import create_app as _create_app

    return _create_app(settings)


def __getattr__(name):
    if name == "app":
        from app.main import app

        return app
    raise AttributeError(f"module 'app' has no attribute {name!r}")
