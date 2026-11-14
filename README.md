# Meowrizon

Web application per confrontare siti e date lunari: scegli un punto sul globo e un periodo, e osserva Sole e Terra rispetto all'orizzonte topografico, con le finestre di illuminazione e di visibilità terrestre.

Stato attuale: il frontend è funzionante con tre viste sincronizzate (globo, orizzonte e timeline) e con il confronto A/B. **Il motore numerico Python non è ancora implementato.** Per questo il frontend usa per impostazione predefinita un provider di **dati dimostrativi**, segnalato nell'interfaccia. Il client HTTP verso il motore segue il contratto in [docs/api-contract.md](docs/api-contract.md). Dettagli in [frontend/README.md](frontend/README.md).

## Avvio del frontend

Prerequisiti: Node.js compatibile con `.nvmrc` e npm.

```sh
nvm use
npm install
npm run dev
```

Aprire l'indirizzo stampato da Vite, normalmente http://localhost:5173.

```sh
npm run build
npm run lint
npm run preview
```

Per collegare il motore, quando sarà disponibile: `VITE_DATA_SOURCE=api npm run dev`. Vedere `frontend/.env.example`.

## Struttura

```text
frontend/                     React + TypeScript + Vite + CesiumJS
backend/
  app/
    api/                      Endpoint e schemi FastAPI
    core/                     Configurazione
    db/                       SQLite
    services/
      terrain/                GDAL, Rasterio, NumPy
      ephemerides/            SpiceyPy
  environment.yml             Dipendenze Python e native
data/
  rasters/                    Dati del terreno
  kernels/                    Kernel SPICE
  cache/                      Cache su disco
  scenarios/                  Scenari salvati
  sqlite/                     Database locali
docs/                         Contratto API e documentazione
```

Le dipendenze Python sono dichiarate ma non installate. Vedere [backend/README.md](backend/README.md) per la creazione dell'ambiente. Nessun dataset scientifico è incluso.
