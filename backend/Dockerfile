# Backend Meowrizon: FastAPI con GDAL, Rasterio e PROJ da conda-forge.
# Si costruisce dalla radice del repository: docker compose build backend
FROM mambaorg/micromamba:2.10.0-ubuntu24.04

# Dipendenze da conda-forge, come indicato in backend/README.md, per tenere coerenti
# le librerie native di GDAL, Rasterio e PROJ.
COPY --chown=$MAMBA_USER:$MAMBA_USER backend/environment.yml /tmp/environment.yml
RUN micromamba install --yes --name base --file /tmp/environment.yml \
    && micromamba clean --all --yes

# Attiva l'ambiente base anche nei RUN successivi.
ARG MAMBA_DOCKERFILE_ACTIVATE=1

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MEOWRIZON_DATA_DIR=/app/data

USER root
RUN mkdir -p /app/data && chown -R $MAMBA_USER:$MAMBA_USER /app
USER $MAMBA_USER

WORKDIR /app/backend
COPY --chown=$MAMBA_USER:$MAMBA_USER backend/ /app/backend/

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["/opt/conda/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
