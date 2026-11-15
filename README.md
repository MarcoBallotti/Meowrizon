# Moonrizon

Strumento per valutare rapidamente siti e date di allunaggio, sviluppato per il NASA Space Apps
Challenge 2026, challenge
[Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/).
Mostra la posizione di Sole e Terra rispetto all'orizzonte reale del sito, per stimare la
disponibilità di energia solare e le finestre di comunicazione diretta con la Terra,
soprattutto al Polo Sud lunare.

Stato attuale: il frontend React + TypeScript + Vite + CesiumJS è funzionante con tre viste
sincronizzate (globo, orizzonte e timeline) e con il confronto A/B. **Il motore numerico non è
ancora collegato:** per impostazione predefinita il frontend usa un provider di **dati
dimostrativi**, segnalato nell'interfaccia. Il client HTTP verso il motore segue il contratto in
[docs/api-contract.md](docs/api-contract.md). Dettagli in [frontend/README.md](frontend/README.md).

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
      terrain/                Horizon mask dai DEM LOLA (GDAL, Rasterio, NumPy)
      ephemerides/            Posizione di Sole e Terra (Horizons / SpiceyPy)
  environment.yml             Dipendenze Python e native
data/
  rasters/                    DEM LOLA e ritagli locali
  kernels/                    Kernel SPICE (opzionali)
  cache/                      Effemeridi, horizon mask e prodotti per sito
  scenarios/                  Scenari salvati
  sqlite/                     Database locali
docs/                         Guida ai dati e contratto API
```

Le dipendenze Python sono dichiarate ma non installate. Vedere
[backend/README.md](backend/README.md) per creare l'ambiente.

## Fonti dei dati

| Fonte | Cosa fornisce | Uso nel progetto |
|---|---|---|
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) (API) | Effemeridi di Sole e Terra viste dalla Luna | Tabella globale di punti sub-solari e sub-terrestri |
| [LOLA GDR polari, PDS Geosciences](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/) | DEM del Polo Sud da 5 a 240 m/pixel | Profilo dell'orizzonte per ogni sito |
| [Moon Trek](https://trek.nasa.gov/moon/) | Tile WMTS, visualizzazione 3D | Mappe di sfondo nel frontend |
| [QuickMap (LROC)](https://quickmap.lroc.asu.edu/) | Immagini, topografia, illuminazione media, PSR | Esplorazione e confronto dei risultati |
| [CSA, Moon Exploration](https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/) | Contesto sulle missioni | Parte educativa |

Le prime due fonti sono dati da elaborare; le altre servono all'interfaccia o al confronto.
I dataset non sono inclusi nel repository (`data/**` è escluso da Git).

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
La stessa tabella si può calcolare offline con SpiceyPy e i kernel in `data/kernels/`.

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

Il Sole conta come visibile quando metà del disco supera l'orizzonte locale. La Terra conta
come visibile quando il suo centro lo supera.

## Agente AI

L'agente non legge serie temporali né DEM: chiama strumenti (function calling) che lavorano
sui prodotti compatti e restituiscono pochi numeri.

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
- mancano le coordinate verificate delle regioni Artemis III e dei target CLPS;
- le coordinate personalizzate richiedono il calcolo al volo della horizon mask, non ancora
  implementato.
