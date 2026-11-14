# Meowrizon

Repository iniziale con frontend React, TypeScript e Vite. CesiumJS è installato come dipendenza, senza integrazione nell'interfaccia. Backend e dati hanno una struttura predisposta per lo sviluppo successivo.

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

Il frontend usa lo scaffold ufficiale Vite React + TypeScript, senza funzionalità applicative aggiunte.

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
docs/                         Documentazione futura
```

Le dipendenze Python sono dichiarate ma non installate. Vedere [backend/README.md](backend/README.md) per la creazione dell'ambiente. Nessun dataset scientifico è incluso.
