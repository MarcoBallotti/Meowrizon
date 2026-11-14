# Dati locali

Non c'è un database: tutto sta in file in queste cartelle.

- `sources/`: download grezzi dalle fonti e registro `manifest.json` con URL, data, dimensione e SHA-256 di ogni file.
- `regions/`: `regions.geojson` e `sites.geojson` creati da `python -m app.cli init-regions`; in seguito una cartella per regione attiva con celle e horizon mask (file NumPy).
- `rasters/`: raster e modelli del terreno.
- `cache/`: risultati intermedi rigenerabili, comprese le risposte di Horizons.
- `scenarios/`: scenari salvati, come file JSON.

Il contenuto di queste cartelle è escluso da Git. Nel container del backend la cartella è montata su `/app/data`.
