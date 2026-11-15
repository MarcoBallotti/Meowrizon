# Meowrizon

Strumento per valutare rapidamente siti e date di allunaggio, sviluppato per il NASA Space Apps
Challenge 2026, challenge
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
Mostra la posizione di Sole e Terra rispetto all'orizzonte reale del sito, per stimare la
disponibilità di energia solare e le finestre di comunicazione diretta con la Terra,
soprattutto al Polo Sud lunare.

Stato attuale:

- **frontend** React + TypeScript + Vite + CesiumJS funzionante con tre viste sincronizzate
  (globo, orizzonte e timeline) e con il confronto A/B. **Il motore numerico non è ancora
  collegato:** per impostazione predefinita il frontend usa un provider di **dati dimostrativi**,
  segnalato nell'interfaccia. Il client HTTP verso il motore segue il contratto in
  [docs/api-contract.md](docs/api-contract.md) e [backend/API_CONTRACT.md](backend/API_CONTRACT.md).
  Dettagli in [frontend/README.md](frontend/README.md);
- **backend** FastAPI: regioni Artemis III scaricate da Moon Trek e servite da `GET /api/regions`;
  gli endpoint del contratto e la valutazione non sono ancora implementati (piano in
  [docs/piano-logica.md](docs/piano-logica.md)). Nessun database: i dati stanno in file in `data/`.
  Il contratto prevede Flask, il backend attuale usa FastAPI: scelta da confermare nel team.

## Avvio con Docker (consigliato)

Prerequisiti: Docker Desktop avviato e npm (per lanciare i comandi qui sotto; ogni comando è un
alias di `docker compose`, che si può usare anche direttamente). Dalla radice del repository:

```sh
npm run setup    # la prima volta: costruisce le immagini e scarica le regioni da Moon Trek
npm start        # avvia backend e frontend
```

| Servizio | Indirizzo | Cosa fa |
|---|---|---|
| `frontend` | http://localhost:5173 | Server di sviluppo Vite, si ricarica a ogni modifica in `frontend/` |
| `backend` | http://localhost:8000/api, documentazione su http://localhost:8000/api/docs | API FastAPI, si riavvia a ogni modifica in `backend/` |
| `web` (solo `npm run prod`) | http://localhost:8080 | Frontend compilato servito da nginx, come in produzione |

Il frontend inoltra le chiamate `/api` al backend dentro la rete Docker. Per usare il motore al
posto dei dati dimostrativi: `VITE_DATA_SOURCE=api` in `.env` (vedere `.env.example`).

Comandi disponibili (`npm run <nome>`):

| Comando | Cosa fa | Equivale a |
|---|---|---|
| `setup` | Costruisce le immagini e inizializza i dati | `docker compose build` + `data:init` |
| `start` | Avvia backend e frontend in primo piano | `docker compose up --build` |
| `start:bg` | Come `start`, in background | `docker compose up --build --detach` |
| `stop` | Ferma e rimuove i container | `docker compose down` |
| `logs` | Segue i log di tutti i servizi | `docker compose logs --follow` |
| `status` | Stato dei container | `docker compose ps` |
| `prod` | Versione di produzione su :8080 | `docker compose --profile prod up --build web` |
| `prod:stop` | Ferma anche la versione di produzione | `docker compose --profile prod down` |
| `data:init` | Scarica le regioni Artemis III e crea `data/regions/` | `docker compose run --rm backend python -m app.cli init-regions` |
| `data:init:offline` | Come sopra, riusando l'ultimo download | … `init-regions --offline` |
| `check` | Tutti i controlli: backend e frontend | `check:backend` + `check:frontend` |
| `check:backend` | ruff e pytest nel container | `docker compose run --rm backend …` |
| `check:frontend` | oxlint e controllo dei tipi nel container | `docker compose run --rm frontend …` |
| `test:network` | Verifica che il backend raggiunga Horizons | `docker compose run --rm backend pytest -m network` |
| `dev`, `build`, `lint`, `preview` | Frontend senza Docker (vedi sotto) | `npm run … --workspace @meowrizon/frontend` |

Dopo aver cambiato le dipendenze (`package.json` o `backend/environment.yml`):
`docker compose up --build -V`, che ricostruisce le immagini e rinnova i volumi delle dipendenze.

Altri dettagli in [backend/README.md](backend/README.md) e [frontend/README.md](frontend/README.md).

## Avvio del frontend senza Docker

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

## Ripartizione del lavoro

Tutta la logica è in **Python**; **TypeScript** serve solo all'interfaccia.

| Parte | Linguaggio | Cosa fa |
|---|---|---|
| Backend (`backend/`) | Python, FastAPI | Download dei dati (Horizons, Moon Trek, PDS), horizon mask, valutazione e classifica delle regioni, API, agente AI |
| Frontend (`frontend/`) | TypeScript, React, CesiumJS | Globo 3D, mappe, grafici, linea del tempo e animazione di Sole e Terra a partire dai dati del backend |

Il contratto tra i due è descritto in [docs/api-contract.md](docs/api-contract.md) e, in
dettaglio, in [backend/API_CONTRACT.md](backend/API_CONTRACT.md): tutte le API stanno sotto
`/api`, con JSON in camelCase. FastAPI pubblica anche lo schema OpenAPI su `/api/openapi.json`.
Il frontend chiama `/api` sul proprio indirizzo e Vite (o nginx in produzione) inoltra al backend;
per chiamate dirette dal browser il backend accetta anche il server di Vite (`localhost:5173`),
altri indirizzi si aggiungono con `CORS_ORIGINS` in `.env`.

## Struttura

```text
frontend/                     React + TypeScript + Vite + CesiumJS
  Dockerfile                  Immagine di sviluppo (Vite) e di produzione (nginx)
  nginx.conf                  Configurazione nginx: file statici e inoltro di /api al backend
backend/
  app/
    main.py                   Applicazione FastAPI (CORS, router)
    cli.py                    Comandi da terminale (init-regions)
    api/                      Endpoint (health, regions)
    core/                     Configurazione, riferimento lunare e proiezione, registro dei download
    services/
      regions/                Catalogo, download da Moon Trek, costruzione dei GeoJSON
      terrain/                DEM LOLA e horizon mask (GDAL, Rasterio, NumPy)
      ephemerides/            Posizione di Sole e Terra (API Horizons)
  catalog/                    Regioni e siti da usare (regions.toml, sites.toml), in Git
  tests/                      Test pytest, con la risposta reale di Moon Trek in fixtures/
  Dockerfile                  Immagine del backend (micromamba + conda-forge)
  environment.yml             Dipendenze Python e native
docker-compose.yml            Servizi backend e frontend; web (nginx) con il profilo prod
.env.example                  Variabili configurabili (copiare in .env)
data/
  sources/                    Download grezzi dalle fonti e registro manifest.json
  regions/                    regions.geojson, sites.geojson e, in seguito, dati per regione
  rasters/                    DEM LOLA e ritagli locali
  cache/                      Effemeridi e risultati intermedi rigenerabili
  scenarios/                  Scenari salvati (file JSON)
docs/                         Guida ai dati, piano, regioni e contratto API
```

Le dipendenze Python si installano nell'immagine Docker del backend. Vedere
[backend/README.md](backend/README.md), che spiega anche come creare l'ambiente senza Docker.

## Fonti

Ogni dato, soglia o coordinata usata dal programma ha una fonte. L'elenco completo, con i
riferimenti [F1]…[F24] usati nei documenti, è in [docs/piano-logica.md](docs/piano-logica.md#fonti).
I dataset non sono inclusi nel repository (`data/**` è escluso da Git).

### Dati da elaborare

| Fonte | Cosa fornisce | Uso nel progetto |
|---|---|---|
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) ([API](https://ssd-api.jpl.nasa.gov/doc/horizons.html)) | Effemeridi di Sole e Terra viste dalla Luna (DE441, sfera di 1737,4 km) | Tabella globale di punti sub-solari e sub-terrestri, in UTC |
| [LOLA GDR polari, PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/) | DEM del Polo Sud da 5 a 240 m/pixel | Maschera d'orizzonte e pendenza |
| [PGDA, LOLA ADJ (Barker)](https://pgda.gsfc.nasa.gov/products/90) | DEM, pendenze e ombre permanenti più recenti del Polo Sud (10–240 m), in COG leggibili a pezzi | Alternativa ai DEM della PDS, da confrontare |
| [PGDA, Lunar Polar Illumination (Mazarico et al. 2011)](https://pgda.gsfc.nasa.gov/products/69) | Ombre permanenti (`lpsr_*`) e illuminazione media di Sole e Terra (`avgvisib_*`) | Ombre permanenti e validazione |
| [Moon Trek, ImageServer](https://trek.nasa.gov/moon/) | DEM LOLA globale (`LRO_LOLA_DEM_Global_128ppd_v04`, ~237 m) e ritagli via API | Terreno dei siti fuori dal polo e delle coordinate inserite a mano |
| LROC, `WAC_POLE_ILL_PCT_SOUTH_100M` (su Moon Trek; Speyerer e Robinson 2013) | Percentuale di illuminazione da immagini reali, 88–90°S | Validazione indipendente |

### Regioni e siti

| Fonte | Cosa fornisce |
|---|---|
| [Moon Trek, `A3_Named_regions_SP`](https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json) | Contorni delle 13 regioni candidate di Artemis III (lista 2022) |
| [Aggiornamento NASA a 9 regioni (2024)](https://www.space.com/space-exploration/artemis/nasa-announces-9-possible-moon-landing-sites-for-artemis-3-lunar-mission) | Regioni ancora in lista nel 2024 |
| [Moon Trek, `Lunar_Landing_Impact_Sites`](https://trek.nasa.gov/moon/trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer) (dati [NSSDCA](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html)) | Coordinate di Apollo 11–17, Luna 9, Luna 17, Chang'e 4 |
| LROC: [Chandrayaan-3](https://www.lroc.asu.edu/images/1314), [Chang'e 6](https://www.lroc.asu.edu/images/1374), [Blue Ghost M1](https://www.lroc.asu.edu/images/1407) | Posizione dei lander misurata nelle immagini di LRO |
| [USGS / IAU, Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) | Centri delle formazioni bersaglio delle missioni CLPS future |

### Criteri e soglie

| Fonte | Cosa fornisce |
|---|---|
| [NASA, *Artemis Human Landing System Overview*, Space Apps 2025](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf) | Requisiti di Artemis III: entro 6° dal polo, pendenza < 10° su 100 m, precisione di 100 m, pendenza < 20° su 2 km per gli astronauti, Sole e Terra a 2–7° sull'orizzonte |
| [NASA, Scoville, *Artemis III EVA Mission Capability*](https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf) | Tolleranza di pendenza del lander umano: 8° |
| [LPSC 2022, sito di Blue Ghost M1](https://www.hou.usra.edu/meetings/lpsc2022/pdf/1390.pdf) | Requisiti di pendenza CLPS e del lander: ≤ 10° |
| [NASA, *VIPER Lunar Operations*](https://science.nasa.gov/mission/viper/lunar-operations/) | Rover: pendenze fino a 15°, al massimo 50 ore di buio continuo |
| [Wueller et al. 2026, JGR Planets](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434) | Siti illuminati con ombre permanenti raggiungibili nelle regioni Artemis |
| [Gläser et al. 2014, Icarus](https://elib.dlr.de/94240) | Punti più illuminati del polo sud: 92,27% delle ore a 2 m, su Connecting Ridge |
| [Mazarico et al. 2011, Icarus](https://ntrs.nasa.gov/citations/20120010094) | Illuminazione dei poli dai dati LOLA: punto sul bordo di Shackleton illuminato 240 giorni di fila |
| [NASA, Artemis III Site Selection Update, LPSC 2026](https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf) | Regioni favorite se robuste rispetto alle date; la luce al polo si sposta di 2–3 settimane l'anno |
| [NASA Space Apps 2026, *Lunar Landing Site Navigator*](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) | Obiettivi della challenge |

### Interfaccia e confronto

| Fonte | Uso nel progetto |
|---|---|
| [Moon Trek](https://trek.nasa.gov/moon/) ([WMTS](https://trek.nasa.gov/tiles/apidoc/trekAPI.html?body=moon)) | Mappe di sfondo nel frontend |
| [QuickMap (LROC)](https://quickmap.lroc.im-ldi.com/) | Verifica manuale (Create Panorama, Visibility Analysis), non come fonte di dati |
| [CSA, Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Parte educativa |

## Riduzione dei dati

L'obiettivo è dare all'agente AI e al frontend pochi KB per sito invece di GB di dati grezzi.

### Effemeridi: una tabella per tutta la Luna

Non serve una query a Horizons per ogni sito. Basta chiedere la Luna vista dal geocentro:

```text
COMMAND='301'  CENTER='500@399'  QUANTITIES='14,15,20'
```

- `14`: punto sub-terrestre sulla Luna. Contiene già la libration.
- `15`: punto sub-solare sulla Luna.
- `20`: distanza Terra-Luna, per la parallasse della Terra (fino a ~0,26°).

Azimut ed elevazione per un sito qualsiasi si ricavano poi con un cambio di frame locale.
Lo scarto rispetto alla query topocentrica di Horizons è inferiore a 0,001°. Due anni a
passo orario sono circa 17.500 righe, ~1 MB, scaricati in una richiesta da pochi secondi.
Si usa solo l'API di Horizons: SpiceyPy e i kernel SPICE non fanno parte del progetto.

### Terreno: dal DEM alla horizon mask

Dimensioni dei DEM LOLA del Polo Sud (`ldem_*`, interi a 16 bit):

| Prodotto | Copertura | Risoluzione | Dimensione |
|---|---|---|---|
| `ldem_875s_5m` | 87,5°S → polo | 5 m | 1,84 GB |
| `ldem_85s_20m` | 85°S → polo | 20 m | 460 MB |
| `ldem_80s_20m` | 80°S → polo | 20 m | 1,85 GB |
| `ldem_80s_40m` | 80°S → polo | 40 m | 462 MB |
| `ldem_75s_240m` | 75°S → polo | 240 m | 29 MB |

Strategia a due risoluzioni:

- **lontano**, fino a ~300 km: `ldem_75s_240m`, scaricato una volta sola.
- **vicino**, entro ~10 km: ritaglio di `ldem_85s_20m` o `ldem_80s_40m`. Con una richiesta
  HTTP Range si scaricano solo le righe attorno al sito (10–30 MB) e si salvano solo le
  colonne utili (0,2–1,5 MB).

Per ogni sito si tracciano 360 raggi, con correzione per la curvatura lunare e un osservatore
alto 2 m. Per ogni azimut si tiene l'elevazione massima del terreno. Il risultato è una
horizon mask di 360 valori, circa 1 KB. Dopo la pre-elaborazione il DEM non serve più.

I file `ldec_*` (conteggi), `ldrm_*`, `ldac_*` e le immagini non servono al calcolo.

### Prodotti per sito

| Livello | Contenuto | Dimensione |
|---|---|---|
| Effemeridi globali | punti sub-solari e sub-terrestri, distanza | ~1 MB per 2 anni |
| Horizon mask | 360 elevazioni | ~1 KB/sito |
| Eventi | intervalli di Sole visibile e Terra visibile | qualche KB/sito/anno |
| Riassunto mensile | % di sole, % di Terra, notte più lunga, elevazione solare, indice di potenza | < 1 KB/sito/mese |

Il Sole e la Terra contano come visibili quando se ne vede almeno metà del disco (decisione C3
del 15/11/2026, in [docs/stato-decisioni.md](docs/stato-decisioni.md)). La frazione di disco
visibile si salva sempre, così la soglia si può cambiare.

## Agente AI

L'agente sta nel backend Python, accanto ai dati: i suoi strumenti chiamano direttamente le
stesse funzioni usate dalle API. Non legge serie temporali né DEM: chiama strumenti (function
calling) che lavorano sui prodotti compatti e restituiscono pochi numeri. I nomi qui sotto
pensano ancora ai siti e vanno adattati alle regioni.

- `list_sites()`
- `site_summary(site_id, month?)`
- `compare_sites(site_ids, month)`
- `conditions_at(site_id, utc)`: az/el di Sole e Terra, orizzonte locale, ore al prossimo
  tramonto o Earthset
- `find_windows(site_id, start, end, min_hours, need)`: finestre continue con Sole, Terra o
  entrambi visibili

## Stato della pipeline

Esiste un prototipo Python della pipeline, fuori da questo repository e ancora da portare in
`backend/app/services/`. L'ho provato su 9 siti per il periodo 2027–2028 e i prodotti
risultanti pesano circa 70 KB.

Verifiche fatte:

- l'az/el calcolato dalla tabella globale coincide con Horizons topocentrico;
- su terreno sintetico la horizon mask dà il valore atteso;
- l'orientamento della mappa LOLA è confermato dal fondo di Shackleton (−2,8 km) e dal
  Malapert (+5,1 km);
- il fondo di Shackleton risulta senza Sole né Terra per tutto il periodo, come atteso per una
  zona in ombra permanente.

Limiti noti:

- i siti a nord di 75°S non hanno terreno e usano l'orizzonte della sfera;
- le regioni Artemis III arrivano da Moon Trek (`init-regions`), e i 16 siti sono in
  `backend/catalog/sites.toml`, ognuno con la sua fonte;
- le coordinate personalizzate richiedono il calcolo al volo della horizon mask, non ancora
  implementato.
