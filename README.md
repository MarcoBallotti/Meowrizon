# Meowrizon

Strumento per valutare rapidamente siti e date di allunaggio, sviluppato per il NASA Space Apps
Challenge 2026, challenge
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
L'engine in progetto confronta luce disponibile, visibilità geometrica della Terra e
pendenza del terreno rispetto a una data di allunaggio, soprattutto al Polo Sud lunare.
Non richiede un tipo di veicolo e non certifica energia sufficiente, collegamenti radio
o sicurezza di atterraggio.

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
  FastAPI è la scelta confermata. La specifica scientifica approvata è
  [docs/criteri-algoritmo.md](docs/criteri-algoritmo.md); i contratti del client saranno
  allineati dopo la realizzazione dell'algoritmo.

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

Il frontend inoltra le chiamate `/api` al backend dentro la rete Docker.
`VITE_DATA_SOURCE=api` in `.env` seleziona il client HTTP, ma non implementa gli endpoint
scientifici mancanti né sostituisce la classifica dimostrativa (vedere `.env.example`).

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
| Backend (`backend/`) | Python, FastAPI | Download dei dati (Horizons, Moon Trek, PDS), horizon mask, misure e confronto delle regioni, API, agente AI |
| Frontend (`frontend/`) | TypeScript, React, CesiumJS | Globo 3D, mappe, grafici, linea del tempo e animazione di Sole e Terra a partire dai dati del backend |

Il contratto corrente è [docs/api-contract.md](docs/api-contract.md), con
[mappa delle interazioni e riferimenti al codice](docs/api-integration-map.md),
[dizionario dei dati](docs/api-data-dictionary.md) e [piano TanStack Query](docs/api-query-plan.md).
[backend/API_CONTRACT.md](backend/API_CONTRACT.md) è il punto di ingresso per il backend.
Le API stanno sotto `/api`: il client scientifico usa camelCase, i cataloghi GeoJSON
server mantengono i campi snake_case. FastAPI pubblica lo schema delle rotte già
implementate su `/api/openapi.json`; i DTO scientifici finali hanno ancora decisioni aperte.
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

Ogni dato, metodo e coordinata ha una fonte; soglie descrittive e convenzioni del team
sono dichiarate come tali. L'elenco completo dei riferimenti è in
[docs/piano-logica.md](docs/piano-logica.md#fonti).
I dataset non sono inclusi nel repository (`data/**` è escluso da Git).

**Ruoli confermati (15/11/2026):** l'engine usa **JPL Horizons** per le effemeridi di Sole
e Terra e **NASA Moon Trek** per regioni, layer cartografici e prodotti accessibili via API.
I DEM numerici LOLA possono arrivare anche direttamente dagli archivi NASA PDS/PGDA.
**QuickMap** serve alla consultazione e al confronto manuale, non all'acquisizione dei
risultati dell'engine. Il nome del servizio NASA è Moon Trek.

**Stato effettivo:** i connettori Horizons e Moon Trek sono presenti e il globo usa layer
Moon Trek, ma il frontend parte in modalità `demo`. La classifica regionale legge ancora
`frontend/public/mock/regions.json`; impostare `VITE_DATA_SOURCE=api` da solo non completa
l'integrazione. Le metriche dimostrative non sono risultati del motore scientifico.
L'adapter WebGeoCalc presente nel modulo di acquisizione serve a un profilo separato di
traiettoria storica, non sostituisce Horizons come fonte scelta per Sole e Terra.

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
| [Aggiornamento NASA a 9 regioni (2024)](https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/) | Evoluzione del catalogo storico; non definisce un filtro universale |
| [Moon Trek, `Lunar_Landing_Impact_Sites`](https://trek.nasa.gov/moon/trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer) (dati [NSSDCA](https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html)) | Coordinate di Apollo 11–17, Luna 9, Luna 17, Chang'e 4 |
| LROC: [Chandrayaan-3](https://www.lroc.asu.edu/images/1314), [Chang'e 6](https://www.lroc.asu.edu/images/1374), [Blue Ghost M1](https://www.lroc.asu.edu/images/1407) | Posizione dei lander misurata nelle immagini di LRO |
| [USGS / IAU, Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) | Centri delle formazioni bersaglio delle missioni CLPS future |

### Criteri e soglie

**Decisioni approvate il 15/11/2026.** La misura continua della pendenza su una base
circolare di diametro 100 m è accompagnata da fasce descrittive **[0°, 5°), [5°, 10°),
[10°, 15°), ≥15°**. La griglia di aggregazione ha celle di 100 m, ma è distinta dal
supporto del piano adattato. I confini delle fasce sono scelte del team, non limiti
universali dei veicoli. **Nessun filtro automatico a 10° esclude celle o regioni.**

Per ogni data si misura l'area di concomitanza fra Sole e Terra geometricamente visibili
(almeno il 50% dei rispettivi dischi), insieme alle aree cumulative con pendenza <5°,
<10° e <15°. Si riportano km², percentuali della regione, copertura dei dati e maggiore
componente connessa con adiacenza sui quattro lati. I valori campionati non dimostrano
uniformità di tutta la cella né sicurezza di un'impronta di atterraggio.

Le regioni si confrontano per singole metriche, con ordinamento esplicito, senza punteggio
globale né classifica lessicografica. Le prestazioni associate a un punto rappresentativo
appartengono tutte allo stesso punto identificato. La robustezza a T ±1, 2, 3 giorni
separa disponibilità di alternative regionali e intersezione delle stesse celle favorevoli;
i campioni giornalieri non provano continuità fra le date e i buchi restano visibili.

Si distinguono buio completo (frazione solare zero), luce sotto soglia (frazione <0,5),
elevazione rispetto all'orizzontale e margine sopra il terreno. Il Sole visibile tiene
conto anche dell'occultazione da parte della Terra. Le 50 ore VIPER restano una nota
operativa specifica dell'ibernazione, senza avviso universale. Non si calcolano temperatura,
energia elettrica o autonomia. La frazione annuale di tempo con almeno metà Sole visibile
si riferisce all'anno civile UTC (365 o 366 giorni); l'80% è un'evidenziazione del team.

Le fonti seguenti danno contesto storico e metodologico: non sostituiscono le decisioni
generali appena approvate. La specifica completa è in
[docs/criteri-algoritmo.md](docs/criteri-algoritmo.md).

| Fonte | Cosa fornisce |
|---|---|
| [NASA, *Artemis Human Landing System Overview*, Space Apps 2025](https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf) | Requisiti della configurazione studiata nel 2025: pendenza <10° su 100 m e precisione di atterraggio di 100 m sono grandezze distinte, non soglie universali |
| [NASA, Scoville, *Artemis III EVA Mission Capability*](https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf) | Riferimento HLS di tolleranza almeno 8°, non limite massimo universale |
| [LPSC 2022, sito di Blue Ghost M1](https://www.hou.usra.edu/meetings/lpsc2022/pdf/1390.pdf) | Vincoli specifici della selezione Blue Ghost; non equivalenti automaticamente alla pendenza media su 100 m |
| [NASA, *VIPER Lunar Operations*](https://science.nasa.gov/mission/viper/lunar-operations/) e [VIPER Traverse Planning](https://www.hou.usra.edu/meetings/lpsc2022/pdf/2874.pdf) | Riferimenti specifici: pendenza nominale 15° con casi fino a 25–30°; 50 ore di sopravvivenza in ibernazione, circa 9 ore di attività all'ombra |
| [Wueller et al. 2026, JGR Planets](https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434) | Siti illuminati con ombre permanenti raggiungibili nelle regioni Artemis |
| [Gläser et al. 2014, Icarus](https://elib.dlr.de/94240) | Benchmark a Connecting Ridge: 92,27% di tempo con qualche luce a 2 m su un periodo di 19 anni; non un massimo universale né la nostra percentuale annuale con almeno metà disco visibile |
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

Il percorso progettato cerca di condividere una tabella Horizons fra i siti. La query
da verificare usa la Luna vista dal geocentro:

```text
COMMAND='301'  CENTER='500@399'  QUANTITIES='14,15,19,20'
```

- `14`: punto sub-terrestre sulla Luna. Contiene già la libration.
- `15`: punto sub-solare sulla Luna.
- `19`: distanza apparente Sole-Luna, per il raggio solare apparente variabile.
- `20`: distanza apparente Terra-Luna, per la parallasse della Terra (fino a ~0,26°).

Queste quantità sono legate all'osservazione dal geocentro: i subpoint includono tempi
luce e le distanze sono apparenti, non geometriche istantanee. La ricostruzione di
azimut ed elevazione locali a T deve riconciliare epoche, frame, parallasse e correzioni;
un semplice cambio di frame non ne dimostra la correttezza. Se questo percorso non
soddisfa il confronto con Horizons topocentrico, si useranno effemeridi topocentriche
Horizons oppure vettori Horizons con trasformazioni validate, mantenendo la stessa fonte.
Il prototipo esterno riporta uno scarto inferiore a 0,001° rispetto a Horizons topocentrico;
questo risultato deve essere riprodotto con coordinate, epoche, correzioni e artefatti
versionati prima di dichiarare validato il nuovo engine. Due anni a passo orario sono
circa 17.500 righe; dimensione e tempi della cache dipendono dal formato scelto.
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

La configurazione iniziale usa 360 direzioni, curvatura lunare e osservatore a 2 m.
Per ogni azimut si conserva l'elevazione massima del terreno. Numero di direzioni,
passo radiale e ampiezza dell'area analizzata si verificano con prove di convergenza;
360 direzioni non sono una garanzia di accuratezza. I DEM restano disponibili per
rigenerazione, raffinamento e validazione. Una maschera di 360 float32 occupa 1.440 byte
prima di metadati e informazioni di validità.

Conteggi LOLA, risoluzione effettiva ed errori disponibili servono a qualificare le misure;
i prodotti di pendenza su base 100 m e le immagini LROC aiutano a verificarle.
L'interpolazione non crea informazione a una scala più fine di quella supportata dai dati.

### Prodotti per sito

| Livello | Contenuto | Dimensione |
|---|---|---|
| Effemeridi globali | punti sub-solari e sub-terrestri, distanze | Dipende da periodo e formato |
| Horizon mask | elevazioni e validità, risoluzione verificata | 1.440 byte per 360 float32, più metadati |
| Eventi | luce, buio completo, sotto soglia e visibilità terrestre; causa e stato dei limiti | Dipende dal numero di eventi |
| Riassunto | frazioni temporali, durate, elevazioni e margini sul terreno, pendenza e copertura | Da misurare sull'implementazione |

Il Sole e la Terra contano come visibili quando se ne vede almeno metà del disco (decisione C3
del 15/11/2026, in [docs/stato-decisioni.md](docs/stato-decisioni.md)). La frazione di disco
visibile si salva sempre, così la soglia si può cambiare.

Il passo orario è iniziale: gli eventi si raffinano e si controllano anche interruzioni
brevi fra campioni. La ricerca prosegue oltre un mese lunare finché trova l'evento o
raggiunge il limite dei dati disponibili; gli intervalli troncati e i dati mancanti sono
espliciti. Una percentuale annuale completa richiede copertura dell'intero anno UTC.

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

## Stato della pipeline e validazione da completare

È documentato un prototipo Python esterno al repository, provato su 9 siti per il
2027–2028. I risultati riportati (circa 70 KB, confronto con Horizons topocentrico,
orizzonti sintetici e controlli su Shackleton/Malapert) non sono una validazione
riproducibile dell'engine da sviluppare finché codice, input e rapporti non sono disponibili.
Una PSR riguarda la luce solare e non dimostra da sola l'assenza di visibilità terrestre.

La verifica prevista comprende geometria contro Horizons topocentrico, pendenza contro
prodotti PGDA con lo stesso supporto spaziale, benchmark di illuminazione con identiche
definizioni e condizioni, immagini LROC, convergenza numerica e propagazione
dell'incertezza. Per ogni caso si registrano metrica, errore, tolleranza motivata in anticipo
ed esito. I dati mancanti restano sconosciuti: non si sostituisce un orizzonte reale
assente con una sfera liscia presentandola come analisi del terreno.

Le regioni del catalogo NASA 2022 arrivano da Moon Trek (`init-regions`); i 16 siti sono
in `backend/catalog/sites.toml`. Precisione delle coordinate e copertura DEM vanno
qualificate prima di valutarli alla scala di 100 m. I servizi scientifici, il calcolo
per coordinate personalizzate e l'integrazione successiva con il frontend restano da
implementare. Questa revisione aggiorna solo la specifica.
