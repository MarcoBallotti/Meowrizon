# Backend

Struttura predisposta per Python e FastAPI. L'API e il motore scientifico non sono ancora implementati.

- `app/api/`: endpoint e schemi HTTP.
- `app/core/`: configurazione condivisa.
- `app/services/terrain/`: elaborazione raster con GDAL, Rasterio e NumPy.
- `app/services/ephemerides/`: calcoli SPICE tramite SpiceyPy.
- `app/db/`: persistenza SQLite.

Le dipendenze sono dichiarate in `environment.yml`. Per installarle quando si inizierà a lavorare sul backend:

```sh
conda env create -f backend/environment.yml
conda activate meowrizon
```

Eseguire questi comandi dalla radice del repository. GDAL e Rasterio vengono installati insieme tramite conda-forge per mantenere coerenti le dipendenze native.
