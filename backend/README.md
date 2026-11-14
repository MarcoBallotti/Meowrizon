# Backend

Python 3.12 e FastAPI, eseguito in Docker. Qui sta **tutta la logica** del progetto: dati, calcoli, classifica delle regioni, API e agente AI. Il frontend TypeScript si occupa solo della visualizzazione.

Per ora ci sono le regioni Artemis III (`GET /api/regions`) e i siti di atterraggio (`GET /api/sites`); la valutazione non è ancora implementata (vedi `docs/piano-logica.md`). Non c'è un database: i dati stanno in file in `data/`.

- `app/main.py`: crea l'applicazione, configura il CORS e registra i router.
- `app/cli.py`: comandi da terminale (`init-regions`).
- `app/api/`: un modulo per gruppo di endpoint (`health.py`, `regions.py`).
- `app/core/config.py`: configurazione letta dalle variabili d'ambiente.
- `app/core/moon.py`: sfera lunare di riferimento (1 737 400 m) e proiezione stereografica polare sud.
- `app/core/manifest.py`: registro dei download (`data/sources/manifest.json`).
- `app/services/regions/`: catalogo, download da Moon Trek, costruzione dei GeoJSON.
- `app/services/terrain/`: DEM LOLA polari (`lola_products.py`) e, in seguito, horizon mask.
- `app/services/ephemerides/`: posizione di Sole e Terra dall'API di JPL Horizons. Non si usa SpiceyPy.
- `catalog/`: quali regioni e siti usare (`regions.toml`, `sites.toml`).
- `tests/`: test con pytest; `tests/fixtures/` contiene la risposta reale di Moon Trek.

## Regioni e siti

Le regioni sono solo quelle candidate di Artemis III. Il catalogo `catalog/regions.toml` decide quali usare (`active`), il limite del settore e la dimensione delle celle; i contorni non si scrivono a mano.

```sh
docker compose run --rm backend python -m app.cli init-regions            # scarica da Moon Trek
docker compose run --rm backend python -m app.cli init-regions --offline  # riusa l'ultimo download
```

Il comando:

1. scarica i poligoni da Moon Trek e salva la risposta grezza in `data/sources/`, con URL, data e SHA-256 in `manifest.json`;
2. li converte in latitudine e longitudine;
3. li controlla, e si ferma se qualcosa non torna;
4. scrive `data/regions/regions.geojson` e `sites.geojson`.

Va rilanciato dopo ogni modifica al catalogo.

I siti si aggiungono a `catalog/sites.toml`, sempre con una fonte: il comando rifiuta un sito senza fonte. I siti possono stare ovunque sulla Luna, perché il limite del settore vale solo per le regioni. Quelli fuori dal settore hanno `in_sector: false` e non hanno ancora un DEM. Ogni sito sarà valutato come una cella di 100 × 100 m.

## Avvio con Docker

Prerequisito: Docker Desktop avviato. Comandi da eseguire nella radice del repository. `npm start` avvia backend e frontend insieme; `npm run check:backend` esegue ruff e pytest (elenco completo dei comandi nel README principale). Solo il backend:

```sh
docker compose up --build backend
```

- API: http://localhost:8000/api (tutte le rotte sotto `/api`, come prevede il contratto con il frontend)
- Documentazione interattiva: http://localhost:8000/api/docs
- Stato: http://localhost:8000/api/health

Il codice di `backend/` è montato nel container: modificando un file Python il server si riavvia da solo. La cartella `data/` è montata su `/app/data`, quindi dati scaricati e cache restano sul disco e fuori da Git.

Altri comandi:

```sh
docker compose run --rm backend pytest              # test senza rete
docker compose run --rm backend pytest -m network   # verifica che il container raggiunga Horizons
docker compose run --rm backend ruff check .        # controllo del codice
docker compose run --rm backend ruff format .       # formattazione
docker compose down                                 # ferma il servizio
```

Dopo una modifica a `environment.yml` l'immagine va ricostruita con `docker compose build backend`.

## Configurazione

I valori di default sono nel codice. Per cambiarli si copia `.env.example` in `.env` nella radice del repository e si modifica solo ciò che serve: porta del backend, URL delle fonti (Horizons, Moon Trek, PDS), timeout HTTP e indirizzi del frontend autorizzati (`CORS_ORIGINS`, di default il server di Vite su `localhost:5173`).

## Perché FastAPI e non Flask

- Genera da solo lo schema OpenAPI (`/api/openapi.json`), da cui si ricavano i tipi TypeScript del frontend.
- Controlla i parametri dai tipi Python (date, soglie) e risponde con errori chiari se sono sbagliati.
- Ha la documentazione interattiva su `/api/docs`, utile per provare le API senza frontend.

Con Flask le stesse cose richiedono estensioni aggiuntive.

## Immagine

- Base: `mambaorg/micromamba:2.10.0-ubuntu24.04`.
- Dipendenze installate da conda-forge con `environment.yml`, così GDAL, Rasterio e PROJ restano coerenti tra loro.
- Il servizio gira con l'utente non privilegiato `mambauser`.

## Senza Docker

In alternativa si può creare l'ambiente con conda, sempre dalla radice del repository:

```sh
conda env create -f backend/environment.yml
conda activate meowrizon
cd backend
uvicorn app.main:app --reload
```
