# Piano per la logica di valutazione

Questo piano descrive cosa fare **prima e durante** l'implementazione della logica di Moonrizon. La domanda a cui il programma deve rispondere è:

> **Data una data, come si confrontano le condizioni geometriche, topografiche e temporali delle regioni del polo sud?**

Regole del documento:

- ogni dato, soglia o definizione ha una fonte, indicata come **[F1]**, **[F2]**…, con l'elenco completo in fondo;
- quello per cui non esiste una fonte è marcato **Scelta del team**: va deciso da noi, in modo esplicito e modificabile;
- ⚠️ indica qualcosa ancora da verificare con una prova reale.

Tecnologie: quelle del `README.md` [F13]. Backend Python 3.12 con FastAPI, GDAL, Rasterio e NumPy, dipendenze da conda-forge in `backend/environment.yml`. **Nessun database**: i dati stanno in file (GeoJSON, JSON, NumPy) in `data/` (decisione del team, 14/11/2026). Le effemeridi arrivano **solo dall'API di Horizons**: SpiceyPy è stato tolto (decisione del team, 14/11/2026). Frontend React, TypeScript, Vite e CesiumJS.

**Ripartizione (decisione del team, 14/11/2026):** tutta la logica è in **Python**: dati, calcoli, confronto delle metriche, API e agente AI. **TypeScript** serve solo al frontend: globo, mappe, grafici, animazione. Il framework web resta FastAPI; Flask è stato scartato perché non dà nulla in più e perde lo schema OpenAPI automatico.

Documenti collegati: `docs/criteri-algoritmo.md` (specifica scientifica di riferimento), `docs/siti-e-regioni.md` (modello a regioni) e `docs/guida-dati.md` (API e dati).

---

## 0. Da dove partiamo

Il `README.md` descrive l'architettura e il prototipo precedente [F13]. La revisione del 15/11/2026 stabilisce:

- **effemeridi** come tabella unica per tutta la Luna: Horizons con `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,19,20'`, conservando header e unità; la ricostruzione locale va verificata contro Horizons topocentrico;
- **terreno** dai DEM LOLA polari della PDS (`ldem_*`): uno lontano a 240 m e uno vicino a 20–40 m;
- **horizon mask** con 360 valori iniziali, curvatura lunare e osservatore alto 2 m; risoluzione definitiva da convergenza;
- **Sole e Terra visibili** quando almeno metà del rispettivo disco risulta visibile; per il Sole si includono terreno ed eclissi terrestri;
- **riassunti**: frazioni, finestre temporali, elevazioni, pendenza e aree, con qualità e copertura. Non si deducono potenza elettrica, temperatura o collegamento radio;
- **prototipo Python esterno**: il README riporta prove su 9 siti per il 2027–2028 e confronti con Horizons e LOLA. Senza codice, configurazioni e risultati riproducibili disponibili nel repository, queste sono verifiche dichiarate, non evidenza già acquisita per il futuro engine.

Cosa cambia rispetto al prototipo precedente:

- l'oggetto valutato è la **regione** (modello concordato in `docs/siti-e-regioni.md`), misurata con celle interne, non più il singolo sito;
- i poligoni storici delle regioni Artemis del 2022 provengono da Moon Trek [F3]; disponibilità della geometria e validità dei risultati scientifici sono verifiche distinte.

---

## 1. Fase 1: ambiente Docker per il backend

**Obiettivo:** chiunque nel team avvia il backend con un comando, con le stesse versioni di GDAL e Rasterio.

### 1.1 Cosa creare

| File | Contenuto |
|---|---|
| `backend/Dockerfile` | Immagine basata su `mambaorg/micromamba` [F15] con tag fisso. Al 14/11/2026 l'ultimo stabile è `2.10.0-ubuntu24.04`. Installa `backend/environment.yml`, così restano conda-forge e la coerenza tra GDAL e Rasterio voluta dal `backend/README.md` |
| `docker-compose.yml` (radice) | Servizio `backend`: porta 8000, `uvicorn --reload` in sviluppo, cartella `./data` montata su `/app/data`, codice montato per il ricaricamento automatico |
| `.dockerignore` | Esclude `node_modules/`, `frontend/`, `data/`, `.git/`: i dati arrivano dal volume, non dentro l'immagine |
| `.env.example` | URL delle fonti (Horizons, Moon Trek, PDS), percorso dei dati, livello di log |
| `backend/app/main.py` | Applicazione FastAPI minima con `GET /health` |

### 1.2 Dipendenze da aggiungere a `environment.yml`

Solo quelle che servono a un passo preciso di questo piano:

| Pacchetto | Serve a |
|---|---|
| `scipy` | Trovare la **componente connessa più grande**, con connettività a 4 vicini, negli insiemi B e Aθ (`scipy.ndimage.label`) |
| `pyproj` | Convertire la stereografica polare lunare in latitudine e longitudine (poligoni Artemis, DEM) |
| `shapely` | Sapere quali celle stanno dentro il poligono di una regione |
| `httpx` | Scaricare da Horizons, Moon Trek e PDS, con tentativi ripetuti e timeout |
| `pytest`, `ruff` | Test e controllo dello stile |

`spiceypy` è stato tolto: le effemeridi arrivano solo dall'API di Horizons. Di conseguenza non servono nemmeno i kernel SPICE né la cartella `data/kernels/`.

### 1.3 Fatto quando

- `docker compose up` avvia FastAPI e `GET /api/health` risponde;
- dentro il container `python -c "import osgeo, rasterio, scipy, pyproj, shapely"` funziona;
- `docker compose run --rm backend pytest` esegue i test;
- `docker compose run --rm backend pytest -m network` raggiunge Horizons dal container.

**Stato (14/11/2026): fatto.** Tutti i controlli passano, dettagli in `backend/README.md`.

**Aggiunto dopo l'arrivo del frontend del team:**
- anche il frontend è in Docker (`frontend/Dockerfile`): servizio `frontend` con Vite su :5173, che inoltra `/api` al backend, e servizio `web` (profilo `prod`) con il frontend compilato servito da nginx su :8080;
- i comandi di avvio stanno nel `package.json` della radice (`npm run setup`, `npm start`, `npm run check`…), elencati nel `README.md`.

⚠️ Su Windows con Docker Desktop, leggere GB di DEM da una cartella montata può essere lento. Va misurato; se serve, si usa un volume Docker dedicato per `data/rasters`.

---

## 2. Fase 2: settore e regioni da considerare

### 2.1 Settore

La presentazione NASA del 2025 indica l'atterraggio entro 6° di latitudine dal polo sud fra i requisiti Artemis III descritti allora [F1, slide 21]. Anche il layer storico delle regioni usa questa estensione [F3]. È il contesto della scelta geografica del progetto, non una verifica dell'architettura di missione corrente.

**Decisione:** settore = **sud di 84°S**, coerente con il contesto NASA citato. I poligoni Artemis si tengono interi anche se sporgono di poco: Nobile Rim 2 ha il centro a 83,95°S e arriva fino a circa 83,6°S.

### 2.2 Regioni: le liste storiche NASA 2022 e 2024

| Regione | Lista 2022 (13) [F3] | Lista 2024 (9), stesso nome [F4] | Poligono nel catalogo locale |
|---|---|---|---|
| Faustini Rim A | sì | no | sì [F3] |
| Peak Near Shackleton | sì | no | sì |
| Connecting Ridge | sì | no | sì |
| Connecting Ridge Extension | sì | no | sì |
| de Gerlache Rim 1 | sì | no | sì |
| **de Gerlache Rim 2** | sì | **sì** | sì |
| de Gerlache-Kocher Massif | sì | no | sì |
| **Haworth** | sì | **sì** | sì |
| **Malapert Massif** | sì | **sì** | sì |
| Leibnitz Beta Plateau | sì | no | sì |
| **Nobile Rim 1** | sì | **sì** | sì |
| **Nobile Rim 2** | sì | **sì** | sì |
| Amundsen Rim | sì | no | sì |
| Peak near Cabeus B | no | sì | **no** |
| Mons Mouton Plateau | no | sì | **no** |
| Mons Mouton | no | sì | **no** |
| Slater Plain | no | sì | **no** |

Per i quattro nomi del 2024 senza corrispondenza esplicita nella tabella, **il catalogo locale non integra ancora una geometria verificata**: usa il layer Moon Trek del 2022. Questo non dimostra l'assenza di prodotti pubblici successivi; i prodotti USGS vanno verificati per geometrie, nomi e provenienza [F4]. Non ricavare confini a mano dall'immagine NASA e non presumere che una ridenominazione conservi lo stesso poligono. Il catalogo resta invariato in questo intervento. Mons Mouton è comunque presente come bersaglio di Griffin-1 fra i siti, con coordinate indicative.

**Decisione D2:** mantenere le 13 geometrie del catalogo 2022 con appartenenza storica dichiarata. La corrispondenza fra nomi 2022 e 2024 è un metadato da verificare; la presenza di un contorno non garantisce copertura completa di tutte le metriche.

**Per sviluppare la pipeline si parte da due regioni**, entrambe in tutte e due le liste:

- **de Gerlache Rim 2** (88,2°S): coperta per intero dal DEM a 5 m del polo; la sua parte a sud di 88°S è dentro la mappa di illuminazione LROC 88–90°S [F8], quindi validabile con immagini reali;
- **Malapert Massif** (86,0°S): rilievo esteso, condizioni di luce e di Terra diverse dalla prima.

Connecting Ridge non è elencata con quel nome nella lista 2024 [F4]; de Gerlache Rim 2 e Malapert Massif sono le regioni iniziali di sviluppo.

### 2.3 Passi

**Stato (14/11/2026): fatto**, con il comando `python -m app.cli init-regions`.

1. **Catalogo versionato** in `backend/catalog/`:
    - `regions.toml` decide quali regioni usare: le 13 con contorno, con le liste di appartenenza (2022, 2024) e `active`. I 4 nomi del 2024 senza geometria integrata nel catalogo locale non ci sono. Contiene anche il limite del settore e la dimensione delle celle;
    - `sites.toml` contiene i 16 siti di atterraggio del catalogo, ognuno con fonte obbligatoria e stato delle coordinate.
2. **Download** dei poligoni da Moon Trek (`A3_Named_regions_SP`, `f=json`) [F3]. La risposta grezza è salvata in `data/sources/` con il registro `manifest.json` (URL, data, dimensione, SHA-256). `--offline` riusa l'ultimo download dopo averne controllato lo SHA-256.
3. **Conversione** dalla stereografica polare sud (sfera di 1 737 400 m) a latitudine e longitudine con pyproj, verificata contro la formula scritta a mano. Lati infittiti ogni 250 m per disegnarli in gradi; longitudine Est tra −180 e 180.
4. **Controlli che fermano il comando:**
    - etichetta assente su Moon Trek;
    - poligono non valido;
    - regione tutta fuori dal settore;
    - regione che attraversa ±180°;
    - nessun DEM che la copre;
    - sito senza fonte, con coordinate fuori intervallo o con data non valida.

    Un'etichetta presente su Moon Trek ma non nel catalogo produce solo un avviso.
5. **Risultato** in `data/regions/regions.geojson` e `sites.geojson`. Per ogni regione: area sulla sfera, centro, angoli in metri, griglia di celle (le regioni sono quadrati con gli angoli su multipli di 100 m, quindi la griglia combacia con i bordi) e DEM LOLA che la copre. Per ogni sito: posizione in metri, cella di 100 × 100 m, regione Artemis in cui cade, DEM.
6. **API:** `GET /api/regions` (con `?active=true`) e `GET /api/sites`.

**Siti di atterraggio (decisione del team, 14/11/2026):** ogni sito si campiona come **una cella di 100 × 100 m** attorno al punto, con le stesse definizioni delle metriche delle regioni. La qualità delle coordinate e la risoluzione disponibile stabiliscono quali misure siano valutabili; il confronto dei siti resta distinto da quello delle aree regionali.

**Quali siti (decisione del team, 14/11/2026):** il catalogo contiene le regioni Artemis e 16 siti. L'elenco completo, con le coordinate, è in `docs/siti-e-regioni.md` (8.4) e in `backend/catalog/sites.toml`. L'inclusione non garantisce che tutte le metriche a 100 m siano calcolabili:

- **12 atterraggi riusciti tra i più famosi**: Apollo 11, 12, 14, 15, 16 e 17, Luna 9, Luna 17 / Lunokhod 1, Chang'e 4 e 6, Chandrayaan-3, Blue Ghost M1. Coordinate dal layer di Moon Trek *Lunar Anthropogenic Impacts and Spacecraft Sites* (dati NSSDCA) [F16] e dalle pagine LROC [F17]. Niente atterraggi falliti o riusciti in parte, quindi niente IM-1, IM-2 e SLIM;
- **4 bersagli CLPS pianificati nel catalogo**: Griffin-1, Blue Moon MK1 Pathfinder, IM-3, Blue Ghost M2. Il punto è il centro della formazione bersaglio, dal Gazetteer IAU [F18] o dalla regione Artemis; non è un punto di atterraggio certificato e gli stati di missione richiedono aggiornamento separato.

**Il limite di 84°S vale solo per le regioni.** I siti possono stare ovunque: quelli fuori dal settore (14 su 16) hanno `in_sector = false` e servirà un **DEM globale** per il loro orizzonte (vedi Fase 3).

Errore corretto durante il lavoro: i centri delle regioni nella prima versione di `docs/siti-e-regioni.md` erano medie di latitudini e longitudini dei vertici, sbagliate vicino al polo. Ora sono il centro geometrico calcolato in metri.

---

## 3. Fase 3: dati e fonti

| Dato | Fonte | Prodotto | Uso |
|---|---|---|---|
| Posizione di Sole e Terra | JPL Horizons [F5], [F32] | `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,19,20'`: punti sub-terrestre/sub-solare e distanze Sole-Luna/Terra-Luna. Conservare header, effemeride effettiva, frame, epoche, unità e conversioni | Az/el di Sole e Terra, con validazione topocentrica |
| Dimensione apparente della Terra | Horizons [F5] | Raggio terrestre nell'intestazione della risposta (6378,137 km) e distanza `delta` | Raggio angolare della Terra (~0,95°), per il criterio del disco |
| Dimensione apparente del Sole | IAU 2015 B3 [F11] e Horizons [F5] | Raggio solare nominale 695 700 km e distanza del Sole | Raggio angolare del Sole (~0,27°), per la frazione di disco visibile |
| Terreno | PDS, LOLA GDR polari [F6] | Verificati sul server: `ldem_875s_5m/10m/20m`, `ldem_85s_10m/20m/40m`, `ldem_80s_20m/40m/80m`, `ldem_75s_30m/60m/120m/240m` | Horizon mask, pendenza |
| Pendenza | Calcolata da noi dai DEM [F6], [F19] | Piano locale su supporto circolare di **100 m di diametro**, distinto dal passo della griglia; confronto con il prodotto PGDA alla stessa scala | Valore, fascia descrittiva e qualità; nessun filtro automatico |
| Ombre permanenti | PGDA / PDS, illuminazione LOLA [F7] | `lpsr_85s_060m_201608` (60 m, 85–90°S); per le regioni a nord di 85°S `lpsr_75s_120m_201608` (120 m, 75–90°S) | Validazione e informazione |
| Illuminazione media | PGDA / PDS [F7] | `avgvisib_85s_060m_201608` (Sole) e `avgvisib_85s_060m_201608_earth` (Terra); per le regioni a nord di 85°S le versioni `75s_120m`. Medie su 18,6 anni a passo orario, con definizione `f > 0` | Confronto nelle stesse condizioni; nessun prefiltro |
| Illuminazione osservata | LROC, Moon Trek [F8], [F30] | WAC PCT e TWI da immagini reali, 88–90°S; rispettare periodo, campionamento e pesi temporali del prodotto | Confronto osservativo, anche ai tempi delle singole immagini |
| Regioni | Moon Trek [F3] | `A3_Named_regions_SP` | Poligoni |
| Siti | Moon Trek [F16], LROC [F17], Gazetteer IAU [F18] | `Lunar_Landing_Impact_Sites`, pagine LROC, `MOON_nomenclature_center_pts` | Coordinate dei 16 siti |
| Terreno fuori dal settore | Moon Trek, ImageServer (`exportImage`) | `LRO_LOLA_DEM_Global_128ppd_v04`: tutta la Luna, ~237 m all'equatore, float32. Provato il 14/11/2026: un ritaglio di 6,3° × 6,3° attorno ad Apollo 15 (806 × 806 pixel, 3 MB) arriva in ~5 s. Per 45–90°S c'è anche `LRO_LOLA_DEM_SPole45_100mp_v04_EQ` (100 m), che copre Chandrayaan-3 | Horizon mask dei siti con `in_sector = false`, ritagli attorno a ogni sito |

Note:

- Il layer `PSR_SP` di Moon Trek contiene solo le **164 ombre permanenti più grandi di 10 km²** [F9]: per celle da 100 m non basta, perché le ombre piccole nei fondi dei crateri mancano. Per questo si usa la mappa raster `lpsr_*` [F7].
- Per ogni file scaricato si scrive un **manifest** con URL, versione, data, dimensione e SHA-256, come previsto da `data/README.md`. Registrare anche unità, frame, datum, NoData, copertura, incertezza e risoluzione effettiva quando disponibili.
- Il DEM globale a circa 237 m non consente una pendenza indipendente su supporto di 100 m: il ricampionamento non crea dettaglio. Senza un DEM locale adeguato, tale metrica è non valutabile, mentre altre possono essere calcolate con qualità esplicita.
- ⚠️ **Alternativa più recente per il terreno del polo sud [F19]** (trovata il 14/11/2026 guardando le fonti dati di QuickMap): i DEM LOLA "ADJ" di Barker et al. (PGDA, prodotto 90), con orbite ricalcolate e meno artefatti rispetto ai `ldem_*` della PDS. Ci sono:
    - DEM `LDEM_83S_10MPP_ADJ`, `LDEM_80S_20/40/80MPP_ADJ`, `LDEM_75S_30MPP_ADJ`, `LDEM_60S_60/120/240MPP_ADJ`. Le versioni a 60°S coprono anche Chandrayaan-3;
    - mappe di pendenza `LDSM_*`, ombre permanenti `LPSR_80S_20MPP_ADJ`, errore di quota `*_ERR` e risoluzione effettiva `*_EFFRES`.

  Sono **GeoTIFF ottimizzati per il cloud (COG)** in stereografica polare sud sulla sfera di 1737,4 km, quindi GDAL ne legge solo il pezzo che serve, senza scaricare il file intero. Provato: una finestra di 10 × 10 km a 20 m su Malapert Massif (500 × 500 pixel) arriva in pochi secondi, con quote tra 2,95 e 5,17 km. Da decidere se sostituiscono i `ldem_*` della PDS.

---

## 4. Fase 4: criteri approvati

**Revisione approvata il 15/11/2026.** La specifica di riferimento è `docs/criteri-algoritmo.md`. Sono superati il filtro automatico di pendenza a 10°, l'associazione fra colori e idoneità dei veicoli, l'avviso generale delle 50 ore e l'ordinamento lessicografico delle regioni. Qui si pianifica la futura implementazione; questo aggiornamento non implementa l'engine né modifica il frontend.

### 4.1 Principi

- **Indipendente dal mezzo:** il programma misura condizioni geometriche e topografiche. Le fasce descrittive sono scelte del team, non certificazioni di sicurezza.
- **Fonti definite:** JPL Horizons per le effemeridi [F5]; NASA Moon Trek per geometrie, layer e prodotti via API; archivi NASA PDS/PGDA per i DEM LOLA [F6], [F19]. QuickMap serve a consultazione e confronto manuale.
- **Nessuna durata di permanenza obbligatoria:** le misure partono da T e proseguono fino all'evento o al limite dei dati disponibili. La copertura è dichiarata.
- **Misure e dati mancanti distinti:** zero, evento non ancora osservato e dato non valutabile sono esiti diversi. Nessuna sostituzione con dati sintetici.
- **Cache riproducibile:** dati e risultati locali conservano provenienza e intervalli coperti; offline si usano solo gli intervalli disponibili.

### 4.2 Geometria, dischi ed eventi

Per ogni centro di cella o sito:

1. calcolare la maschera d'orizzonte dal DEM con curvatura lunare e osservatore a **2 m**, altezza di riferimento dichiarata;
2. ricavare da Horizons azimut, elevazione rispetto all'orizzontale locale e distanze di Sole e Terra, gestendo parallasse terrestre, frame ed epoca delle quantità apparenti [F32];
3. restituire separatamente **elevazione** `e` e **margine sul terreno** `e - H(azimut)`: il margine del centro non descrive da solo l'occultazione del disco;
4. integrare il disco rispetto al terreno lungo la sua estensione angolare. Per il Sole includere anche l'occultazione da parte della Terra: la frazione effettiva è l'area del disco non coperta da nessuno dei due occultatori. Non moltiplicare semplicemente due frazioni, perché le occultazioni possono sovrapporsi;
5. conservare frazione solare da solo terreno, frazione solare effettiva `f_S` e frazione terrestre `f_E`, con cause dell'oscuramento (terreno, eclissi, entrambe). Sono grandezze geometriche, non potenza elettrica né bilancio radio.

**C3 confermata:** Sole e Terra sono riassunti come visibili se rispettivamente `f_S >= 0,5` e `f_E >= 0,5`. È una **Scelta del team**. Il confronto con `AVGVISIB` richiede invece `f > 0` e le condizioni dello specifico prodotto [F7].

Distinguere **buio completo** (`f_S = 0`), **intervallo sotto soglia** (`f_S < 0,5`, anche con luce parziale), **finestra di luce sopra soglia** (`f_S >= 0,5`) e **finestra di visibilità geometrica terrestre** (`f_E >= 0,5`). Le eclissi interrompono le finestre solari anche quando il Sole supera i rilievi [F29]. Il buio è assenza di luce solare diretta nel modello: luce diffusa, riflessa o rifratta non viene convertita in disponibilità energetica.

**Configurazione numerica iniziale:** 360 direzioni e passo di un'ora, da verificare con convergenza. Confrontare almeno 1°/0,5°/0,25° e passi temporali più fitti su casi critici. Raffinare gli attraversamenti e controllare anche gli intervalli fra campioni con lo stesso stato, che possono nascondere un evento breve. Le tolleranze sono obiettivi numerici del team, da documentare prima delle prove.

La ricerca si estende progressivamente entro la copertura disponibile, senza limite scientifico di 29,5 giorni. Se a T la condizione non è soddisfatta, la durata residua della finestra corrente è zero e si cerca separatamente la prossima. Per intervalli già aperti a T, distinguere durata residua e totale; un inizio o una fine non osservati producono un intervallo troncato al relativo bordo. Anche un'interruzione nei dati produce censura, non continuità presunta. Registrare ultimo istante valutato, stato e limiti temporali anziché inventare eventi o dichiararli impossibili per sempre.

### 4.3 I dieci criteri

| # | Criterio | Misura |
|---|---|---|
| 1 | Sole visibile a T | `f_S` e confronto con 0,5; distinguere terreno ed eclissi |
| 2 | Terra visibile a T | `f_E` e confronto con 0,5; non garantisce comunicazione radio |
| 3 | Elevazione del Sole | Elevazione rispetto all'orizzontale e margine sul terreno, separati |
| 4 | Elevazione della Terra | Elevazione rispetto all'orizzontale e margine sul terreno, separati |
| 5 | Luce continua | Durata residua sopra soglia da T e prossime finestre, con eventuale censura |
| 6 | Visibilità geometrica continua della Terra | Durata residua sopra soglia da T e prossime finestre, con eventuale censura |
| 7 | Buio e luce ridotta | Primo intervallo di buio completo e primo intervallo sotto soglia, distinti; inizio, fine e durata osservata |
| 8 | Pendenza | Valore numerico, base di misura 100 m, fascia descrittiva e qualità |
| 9 | Illuminazione annua | Percentuale del tempo con `f_S >= 0,5` nell'anno UTC scelto; copertura e indicatore >=80% |
| 10 | Robustezza alle date | Misure a T e T ± 1, 2, 3 giorni; alternative regionali e persistenza delle stesse celle |

La pendenza non dipende da T. Il criterio 9 si riusa solo fra date nello stesso anno UTC: vicino a Capodanno può cambiare l'anno di riferimento. Una finestra grafica di un mese lunare non limita la ricerca. L'integrazione frontend è successiva all'algoritmo.

### 4.4 Pendenza, buio e illuminazione annua

**Pendenza: fasce approvate, Scelta del team.**

| Fascia | Intervallo esatto |
|---|---|
| 1 | `0 <= p < 5°` |
| 2 | `5° <= p < 10°` |
| 3 | `10° <= p < 15°` |
| 4 | `p >= 15°` |

Le fasce sono fisse fra regioni e date, non derivano dai percentili locali e non significano idoneità per lander o rover. **Nessun filtro automatico a 10°.** Conservare valore numerico, qualità e incertezza, evidenziando i casi che attraversano un confine di fascia.

La griglia di aggregazione ha celle di 100 × 100 m. Il **supporto del fit** è distinto: finestra circolare di diametro 100 m, centrata nel punto, con coordinate locali metriche. Il confronto con `LDRM_80S_50MPP_ADJ_SLP_100M.TIF` [F19] deve uniformare anche campionamento e metodo. Griglia, base della pendenza e precisione di atterraggio sono grandezze diverse; i requisiti storici dei veicoli [F1], [F2], [F20]–[F23] non definiscono le nostre classi.

**Buio continuo:** nessun avviso generale o punteggio a 50 ore. VIPER rimane una nota: lo studio distingue 50 ore di sopravvivenza in ibernazione e circa 9 ore di normali operazioni all'ombra [F28]. Non sono limiti universali né si applicano automaticamente all'intervallo con una parte del Sole ancora visibile.

**Modello termico escluso.** Esistono dati NASA LRO Diviner sulle temperature superficiali [F27]. La risposta dell'hardware richiede geometria, materiali, isolamento, proprietà radiative, dissipazione, riscaldatori, batterie e stato iniziale del mezzo. L'engine generale misura luce e buio senza calcolare temperatura, autonomia o sopravvivenza.

**Illuminazione annua, C6:** `P50` è il rapporto fra durata con `f_S >= 0,5` e durata dell'intero anno UTC della data scelta, dal 1° gennaio al successivo (365 o 366 giorni). Con passi variabili si sommano durate degli intervalli, non campioni con pesi uguali. **P50 >= 80%** è un'evidenziazione del team, senza promessa di stabilità energetica.

Il valore annuale richiede copertura valida dell'intero anno. Con copertura parziale restituire percentuale nel periodo osservato, denominatore e copertura, senza attribuire l'evidenziazione annuale. Il **92,27%** di Gläser [F25] riguarda uno specifico sito a 2 m, uno studio di 19 anni e una diversa definizione della presenza di luce: riferimento bibliografico, non massimo universale né confronto diretto con P50.

### 4.5 Ombre permanenti

**C1 confermata:** le mappe di ombra permanente [F7], [F19] sono informazioni scientifiche e riferimenti di confronto, non filtri aggiuntivi o pesi. Non dedurre permanenza dall'assenza di Sole in una finestra breve. Il confronto con una PSR richiede altezza, periodo, DEM e definizione coerenti: un osservatore a 2 m può avere condizioni diverse dalla superficie. L'accessibilità alle PSR rimane fuori dal perimetro; riferimento futuro [F24].

### 4.6 Dalle celle al confronto regionale (C4 e C5)

Il precedente **punto papabile** è sostituito da **cella con visibilità concomitante**, senza giudizi sull'atterraggio. `B(T)` è l'insieme delle celle con geometria valida per cui a T valgono insieme `f_S >= 0,5` e `f_E >= 0,5`. La pendenza non entra in questa condizione.

Per ogni regione calcolare:

- area stimata di B(T);
- aree cumulative `A_5(T)`, `A_10(T)`, `A_15(T)`: somma delle aree delle celle in B(T) con pendenza valida rispettivamente `<5°`, `<10°`, `<15°`;
- area della maggiore componente connessa per B(T) e per ciascuna soglia, con **connettività a 4 vicini**: il solo contatto d'angolo non unisce due zone;
- distribuzione delle quattro fasce e copertura valida di ciascuna metrica.

Le aree cumulative si sovrappongono e **non si sommano**. Un'eventuale soglia scelta per un'analisi deve essere dichiarata nel risultato e non diventa esclusione predefinita.

Riportare km² e percentuale dell'area totale della regione, con denominatore esplicito. Usare area sulla superficie lunare di riferimento, correggendo proiezione e celle di bordo; non aumentare l'area disponibile con `1/cos(pendenza)`. La visibilità del centro campionato rappresenta una stima areale, non prova condizioni uniformi nell'intera cella. Verificare la qualità spaziale con campionamenti più fini dove necessario.

L'assenza di una pendenza valida non impedisce B(T) se la geometria è nota, ma rende sconosciuto il contributo alle A_θ. Un DEM sufficiente per l'orizzonte lontano può essere insufficiente per il fit su 100 m. Interpolare dati grossolani non crea dettaglio: restituire **non valutabile alla scala richiesta**. Pubblicare area valutata, area ignota e contributi noti; l'ignoto non vale zero né terreno favorevole.

Tutte le regioni restano nel confronto. Con copertura completa e B(T) vuoto, riportare **nessuna cella soddisfa simultaneamente le due condizioni a T**, non “regione inadatta all'atterraggio”. Con copertura incompleta distinguere risultato parziale e non valutabile. Esporre conteggi Sole, Terra e intersezione, senza attribuire falsamente ogni assenza a un solo criterio.

**Confronto per metrica, nessun vincitore assoluto.** Eliminati pesi, punteggio globale e cascata tenuta > area > luce > Terra. Ogni ordinamento indica la metrica; pareggi, qualità e dati mancanti restano espliciti. Si possono evidenziare separatamente area poco inclinata, finestre lunghe o persistenza alle date.

Un sito rappresentativo conserva ID, coordinate e regola di selezione: tutte le prestazioni congiunte appartengono alla **stessa cella**. Massimi regionali in celle diverse devono avere i rispettivi identificativi. Le vecchie stime ottenute con classi <8°/8–10° e fit quadrati sono ritirate dai risultati operativi: occorre ricalcolarle secondo la nuova specifica.

### 4.7 Robustezza alle date (C7)

Valutare T e T ± 1, 2, 3 giorni alla stessa ora UTC. L'intervallo ±3 giorni è una **Scelta del team**, non una prescrizione NASA.

- **Alternative regionali:** riportare B(T+j), A_5, A_10, A_15 e componenti connesse a ogni data. Le alternative possono trovarsi in luoghi diversi.
- **Persistenza della stessa zona:** intersecare le celle di B nelle date considerate; fare lo stesso per ogni soglia descrittiva. Riportare area e maggiore componente dell'intersezione.
- **Anticipi e ritardi separati:** indicare gli insiemi di date, per esempio `{T, T+1g, T+2g}`. Un esito sfavorevole a +1 non cancella +2 e +3: i buchi restano visibili.
- **Nessuna continuità implicita:** campioni giornalieri favorevoli non garantiscono le ore intermedie. Una finestra continua richiede serie temporale e ricerca degli eventi, con errore numerico dichiarato.
- **Qualità:** dati mancanti a una data rendono non determinata la persistenza completa; distinguere contributi dimostrati e area ignota.

Buio e intervalli sotto soglia si riportano a ogni data, ma nessun limite VIPER decide la robustezza. Una durata troncata non viene trattata come durata finale nell'ordinamento.

### 4.8 Limiti da dichiarare

- I dati orbitali non certificano sicurezza né risolvono tutti i massi e crateri minori.
- La base di 100 m e l'altezza di 2 m sono riferimenti geometrici; un mezzo richiede analisi specifica.
- Sole visibile non equivale a potenza elettrica; Terra visibile non equivale a collegamento radio disponibile.
- Esclusi modelli termici, traiettorie, relay e dispersione del touchdown.
- Coordinate approssimate e centri di formazioni descrivono punti illustrativi, non necessariamente i siti missione reali.
- Risoluzione nominale ed effettiva sono diverse; errori dichiarati a una scala non si trasferiscono automaticamente a un'altra.
- Dati provenienti da NASA o da archivi statunitensi non implicano approvazione o validazione NASA dei risultati dell'engine.

---

## 5. Fase 5: algoritmo di valutazione da implementare

### 5.1 Calcolo preliminare (offline)

1. Costruire celle da 100 m e area sulla superficie di riferimento, inclusi bordi dei poligoni.
2. Selezionare DEM, terreno vicino e lontano in base alla qualità; conservare NoData, risoluzione effettiva, errori e provenienza.
3. Calcolare fit circolare su 100 m, pendenza, fascia e qualità; segnalare i casi non valutabili.
4. Calcolare maschere d'orizzonte a 2 m. I 360 campioni sono iniziali; numero finale, raggio del terreno e precisione derivano dalle prove di convergenza.
5. Conservare prodotti e metadati in `data/regions/<id>/`; formato e quantizzazione non devono superare le tolleranze d'errore dichiarate.
6. Acquisire la tabella globale Horizons con distanze solare e terrestre e header originali. Per la Luna vista dal geocentro usare quantità 14, 15, 19 e 20, verificando epoche, correzioni e unità rispetto alle query topocentriche [F5], [F32].

Le quantità globali sono apparenti, con tempi di luce riferiti all'osservatore geocentrico. Il passaggio alla geometria locale è un percorso da validare, non un semplice cambio di frame automaticamente equivalente. Se non rispetta le tolleranze, usare query topocentriche Horizons o vettori Horizons con frame e correzioni verificati; la fonte delle effemeridi rimane JPL Horizons.

### 5.2 Per ogni richiesta T

1. Verificare i dati a T, alle date vicine e nell'anno UTC pertinente; distinguere copertura completa, parziale e assente per metrica.
2. Calcolare geometria, elevazioni orizzontali, margini e frazioni; includere le eclissi nella frazione solare effettiva.
3. Cercare eventi e finestre adattivamente fino al termine dei dati validi; raffinare attraversamenti, conservare intervalli troncati e cause.
4. Calcolare criteri 1–9 e date vicine, riusando solo i prodotti realmente indipendenti da data o anno.
5. Aggregare B(T), A_5/A_10/A_15, componenti, copertura e persistenza delle stesse celle.
6. Restituire misure e metadati; applicare solo un eventuale ordinamento esplicitamente richiesto su una metrica.

### 5.3 Risultato per regione

```text
istante: T UTC
geometria: frazioni Sole/Terra, elevazioni orizzontali, margini, cause
finestre: luce sopra soglia, visibilità geometrica Terra, buio completo, sotto soglia
          inizio/fine osservati, durata residua, censura e copertura temporale
terreno: pendenza su supporto circolare 100 m, fasce [0,5), [5,10), [10,15), >=15
anno: P50, anno UTC, durata valutata/totale; evidenziazione >=80% solo se completo
aree: B(T), A_5(T), A_10(T), A_15(T), km²/%regione, area ignota per metrica
continuità spaziale: maggiore componente a 4 vicini per ogni insieme
robustezza: alternative per data e intersezioni delle stesse celle; anticipi/ritardi
sito rappresentativo eventuale: ID, coordinate, selezione e metriche congiunte
confronto: metrica esplicita; nessun punteggio o vincitore universale
qualità: valutabile/parziale/non valutabile, fonti, errori e approssimazioni
```

### 5.4 Fatto quando

- Le due regioni di sviluppo producono tutte le misure, copertura e censura, in tempi misurati. L'obiettivo di risposta interattiva non giustifica omissioni scientifiche silenziose.
- I controlli numerici coprono geometria, terreno, confini 5°/10°/15°, dischi, eclissi, eventi brevi, intervalli troncati, dati mancanti, componenti e intersezioni fra date.
- Le verifiche del prototipo esterno sono riprodotte con artefatti disponibili; non sostituiscono la validazione del nuovo engine.

---

## 6. Fase 6: verifica, validazione e incertezza

Prima dei confronti, fissare dominio d'uso, metriche d'errore e tolleranze del team. Conservare casi, parametri, versioni e risultati. La concordanza fra modelli basati sullo stesso DEM è coerenza numerica; le immagini aggiungono un confronto osservativo [F31].

| Controllo | Riferimento | Evidenza richiesta |
|---|---|---|
| Provenienza e coordinate | Header Horizons, label PDS/PGDA, geometrie Moon Trek | Hash, versioni, frame, unità, quote, epoche, orientamento, NoData e copertura |
| Geometria astronomica | Horizons topocentrico `CENTER='coord@301'` [F5] | Errori medi, massimi e distribuzione su siti, stagioni e attraversamenti; nessuna accuratezza ereditata dal solo README |
| Pendenza | Piani sintetici e `LDRM_80S_50MPP_ADJ_SLP_100M.TIF` [F19] | Stesso supporto circolare e scala; errori e concordanza delle fasce |
| Orizzonte e dischi | Sfera liscia, ostacoli sintetici e occultatori sovrapposti | Profili e frazioni attesi, ombre ed eclissi separate e combinate |
| Convergenza | Risoluzioni angolari/temporali e DEM più fitti | Variazioni di eventi, percentuali, aree e ordinamenti; ricerca di eventi brevi fra estremi orari uguali |
| PSR e AVGVISIB | PGDA/PDS [F7] | Stessa altezza, DEM, periodo e definizione `f > 0`; P50 annuale a 2 m non è equivalente alla media pluriennale superficiale |
| Casi pubblicati | Gläser/Barker [F19], [F25] | Stesse coordinate, periodo, altezza e definizione; motivare differenze |
| Illuminazione osservata | Immagini LROC e WAC PCT/TWI [F8], [F30] | Confronti ai tempi di acquisizione; rispettare copertura, pesi e interpolazioni del prodotto; misurare accordi e disaccordi |
| Incertezza | Errori, risoluzione effettiva e cloni DEM disponibili | Sensibilità di pendenza, frazioni, aree e persistenza; separare errore fisico e numerico |
| Confronto qualitativo | QuickMap Panorama / Visibility Analysis | Controllo manuale supplementare, non validazione quantitativa sufficiente |

La promessa storica di finestre di 6,5 giorni nelle regioni Artemis non è un test universale per ogni anno, altezza o definizione: vanno ricostruite le condizioni originali. Lo stesso vale per i 240 giorni di Mazarico e il 92,27% di Gläser.

Produrre un rapporto “caso, fonte, metrica, scarto osservato, tolleranza fissata prima, esito”, includendo i casi non validati. Le configurazioni numeriche definitive e i criteri di qualità si determinano con le prove; non sono requisiti NASA inventati. Questo intervento aggiorna soltanto la documentazione, senza implementare o eseguire tali verifiche.

---

## 7. Fase 7: integrazione successiva all'algoritmo

**Rinviata per decisione dell'utente:** questo aggiornamento documentale non richiede lavoro sul frontend. Le note seguenti conservano l'architettura già predisposta; nomi e schemi dei risultati scientifici saranno allineati dopo la realizzazione e verifica dell'algoritmo.

**Il contratto esiste già:** il team ha scritto `docs/api-contract.md` e, in dettaglio, `backend/API_CONTRACT.md` (14/11/2026). Il frontend usa già i tipi in `frontend/src/api/types.ts`. Le regole principali sono:
- tutte le API sotto `/api`;
- JSON in camelCase;
- lavori asincroni (`JobState`) per le analisi;
- cinque endpoint di livello C già letti dal client: `GET /api/coverage`, `POST`/`GET /api/terrain-analyses`, `POST`/`GET /api/scenario-evaluations`.

Il contratto va allineato alle definizioni scientifiche approvate prima di collegare l'engine: eventuali campi legacy di punteggio o idoneità non prevalgono sui criteri della Fase 4. FastAPI pubblica la propria descrizione su `/api/openapi.json`.

Già fatto:
- tutte le rotte del backend sono sotto `/api`;
- Vite (in sviluppo) e nginx (in produzione) inoltrano `/api` al backend;
- il CORS per `localhost:5173` resta per le chiamate dirette.

Da chiarire nel team:
- **framework: risolto (15/11/2026).** `backend/API_CONTRACT.md` ora prevede FastAPI. Il backend di Kevin (branch `backend`) è integrato nella stessa applicazione: rotte `/api/data/...` per acquisizione, preparazione (JSON, Parquet) e job persistenti, con i dati in `backend/data/`;
- **`GET /api/sites`:** nel contratto restituisce un `SiteCatalog` in camelCase, con `coordinateStatus` e siti anche equatoriali (Apollo). Il catalogo locale restituisce GeoJSON dei siti di `sites.toml`, anche fuori dal settore polare. I formati andranno unificati;
- **regioni:** il confronto delle metriche e delle aree regionali richiede un'estensione concordata del contratto, senza classifica universale.

Bozza degli endpoint per le regioni (estensione del contratto):

| Endpoint | Restituisce |
|---|---|
| `GET /api/health` | Stato del servizio |
| `GET /api/regions` | **Già fatto.** GeoJSON delle regioni in latitudine e longitudine, con nome, liste di appartenenza (2022, 2024), area, DEM; `?active=true` per le sole attive |
| Confronto regionale, endpoint da definire | Metriche ordinabili esplicite, aree B/Aθ, componenti e qualità; nessuna durata obbligatoria o punteggio globale |
| `GET /api/regions/{id}/evaluation?t=…` | Bozza: criteri 1–10, eventi e copertura, aree concomitanti e robustezza |
| `GET /api/regions/{id}/cells?t=…` | Stato delle celle per colorare la regione. Formato da decidere con la UI (D12) |
| `GET /api/sites` | **Già fatto.** Siti di atterraggio in GeoJSON con la loro cella di 100 m; in seguito anche la loro valutazione |

Da decidere insieme alla UI:

- **formato delle celle**: GeoJSON (semplice ma pesante con migliaia di celle), griglia compatta più georeferenziazione, oppure immagine PNG da sovrapporre in Cesium;
- **cache dei risultati** in memoria e file, indicizzata da epoca, parametri e versioni dei dati; eventuali arrotondamenti devono rispettare le tolleranze degli eventi;
- **schemi Pydantic** per le risposte: oggi `/regions` e `/sites` restituiscono GeoJSON generico, quindi lo schema OpenAPI non descrive ancora i campi;
- **strumenti dell'agente AI** del README [F13] (`list_sites`, `compare_sites`, …): l'agente sta nel backend Python e chiama direttamente le stesse funzioni delle API. Gli strumenti sono pensati per siti e vanno adattati alle regioni;
- ⚠️ ellissoide lunare in CesiumJS (`Cesium.Ellipsoid.MOON`), da verificare nella versione installata.

---

## 8. Decisioni approvate e dettagli da verificare

Le decisioni sui criteri del 14/11 (D3–D7, D9–D11) e le precedenti soglie operative sono **superate** dalla Fase 4:

| # | Decisione | Stato |
|---|---|---|
| D1 | Confine del settore | **Deciso:** 84°S, solo per le regioni (`lat_limit` in `regions.toml`) [F1] |
| D2 | Regioni attive | Per lo sviluppo de Gerlache Rim 2 e Malapert Massif; a regime tutte le 13 |
| — | Profili di missione | **Deciso:** nessun profilo; condizioni misurate e scelte del team distinte dai requisiti storici delle singole missioni |
| — | Criteri | **Decisi:** dieci metriche (4.3), con copertura e qualità; nessuna durata di permanenza richiesta |
| — | Scala di pendenza | **Decisa:** [0,5), [5,10), [10,15), ≥15°; nessun filtro a 10°; supporto circolare diametro 100 m distinto dalla griglia |
| — | Buio e luce ridotta | **Deciso:** `f_S = 0` distinto da `f_S < 0,5`; eclissi incluse; 50 ore solo nota VIPER, senza avviso generale |
| — | Modello termico | **Escluso:** la geometria da sola non determina temperatura, inerzia e proprietà termiche (4.4) |
| C1 | Ombre permanenti | **Deciso:** informazione e validazione, nessun filtro automatico (4.5) |
| C3 | Sole e Terra visibili | **Deciso:** almeno metà del disco; Sole effettivo dopo terreno ed eclissi (4.2) |
| C4, C5 | Concomitanza e confronto | **Deciso:** B, aree cumulative A5/A10/A15, componenti a 4 vicini; metriche ordinabili senza punteggio globale (4.6) |
| C6 | Illuminazione annua | **Deciso:** P50 dell'anno UTC, evidenziazione del team all'80%; benchmark 92,27% distinto |
| C7 | Robustezza | **Deciso:** T ± 1, 2, 3 giorni; alternative e intersezione delle stesse celle, anticipi/ritardi separati, buchi espliciti (4.7) |
| D8 | Risoluzioni numeriche | 360 direzioni e un'ora iniziali; tolleranze, convergenza, eventi brevi e tempi di elaborazione da misurare |
| — | DEM del polo sud | PDS `ldem_*` o PGDA ADJ [F19]: da confrontare sulle 2 regioni |
| — | Qualità e cache | Definire tolleranze prima delle prove, risoluzione minima, intervalli disponibili e gestione della censura |
| D12 | Formato delle celle per il frontend | Rinviato a dopo l'algoritmo |

---

## 9. Ordine di lavoro

**Intervento corrente: solo documentazione.** Le attività successive sono il piano per la futura implementazione.

1. Fase 1: ambiente Docker e `/api/health` già predisposti.
2. Criteri della Fase 4: revisione approvata il 15/11, senza implementazione dell'engine in questo intervento.
3. Fase 2: poligoni delle regioni convertiti e salvati, siti scelti e scritti in `sites.toml`. **Fatto.**
4. Fase 3: download con manifest, prima per le 2 regioni di sviluppo.
5. Acquisire il prototipo esterno e i relativi artefatti; verificare quali parti siano riutilizzabili e riprodurre i confronti dichiarati.
6. Definire tolleranze e casi della Fase 6, poi implementare la Fase 5 sulle 2 regioni con la relativa verifica numerica.
7. Completare convergenza, validazione osservativa e rapporto delle incertezze; determinare la configurazione D8.
8. Estensione a tutte le 13 regioni e ai siti con copertura e qualità sufficienti, mantenendo espliciti i risultati non valutabili.
9. Fase 7 e frontend dopo l'algoritmo.

---

## Fonti

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview*, presentazione per la NASA 2025 International Space Apps Challenge, 4 ottobre 2025. NTRS 20250009323. Slide 19 (caratteristiche del polo sud), 21 ("Key Artemis III Landing Requirements"), 23–28. https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge*. NTRS 20210026296. Slide 4: tolleranza di pendenza dell'HLS "almeno 8 gradi", da HLS-S-R-0071 (documento HLS-RQMT-006, 2021). https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- **[F3]** NASA Moon Trek, layer *Artemis III Candidate Landing Regions, S Pole* (`A3_Named_regions_SP`) e relativo abstract (regioni annunciate il 19 agosto 2022, criteri e luce continua per 6,5 giorni). Poligoni: https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json. Abstract: https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP. Annuncio: https://www.collectspace.com/news/news-081922a-artemis-iii-moon-landing-regions.html
- **[F4]** NASA, *NASA Provides Update on Artemis III Moon Landing Regions*, 28 ottobre 2024. Lista storica a nove regioni. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/. Prodotti cartografici USGS da verificare prima dell'integrazione: https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids
- **[F5]** JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html. Configurazione globale prevista: `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,19,20'`; validazione topocentrica secondo [F32].
- **[F6]** LOLA GDR polari, PDS Geosciences Node: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
- **[F7]** E. Mazarico, NASA GSFC PGDA, *Lunar Polar Illumination*: https://pgda.gsfc.nasa.gov/products/69. File: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/. Da citare: Mazarico, E., et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030.
- **[F8]** LROC, *WAC Percentage-Based Illumination 100mpp, S Pole* (`WAC_POLE_ILL_PCT_SOUTH_100M`), su Moon Trek. Riferimento: E. J. Speyerer, M. S. Robinson, *Persistently illuminated regions at the lunar poles: Ideal sites for future exploration*, Icarus 222 (2013) 122–136.
- **[F9]** NASA Moon Trek, layer *Permanently Shadowed Regions (PSRs), S Pole* (`PSR_SP`), abstract: 164 ombre permanenti, tutte > 10 km². https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=PSR_SP
- **[F10]** NASA Moon Trek, layer *LRO LOLA Slope, S Pole, 87.5 deg* (`Slope_LRO_LOLA_DEM_SPole875_5mp_v04`), per il controllo visivo della pendenza.
- **[F11]** IAU 2015 Resolution B3, valori nominali per le costanti solari (raggio solare nominale 695 700 km).
- **[F12]** NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **[F13]** `README.md` del repository Moonrizon: criteri, riduzione dei dati, prototipo e verifiche del team.
- **[F14]** Intuitive Machines, aggiornamento IM-2: fonte dell'operatore per il riferimento ai 250 m, non misura LROC né fonte NASA. https://investors.intuitivemachines.com/node/9481/pdf
- **[F16]** NASA Moon Trek, layer *Lunar Anthropogenic Impacts and Spacecraft Sites* (`Lunar_Landing_Impact_Sites`, 7/11/2022), dati NSSDCA: https://trek.nasa.gov/moon/trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer (sottolayer 1: atterraggi morbidi, 2: con equipaggio). Fonte dei dati: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
- **[F17]** LROC, posizione dei lander misurata nelle immagini di LRO: Chandrayaan-3 https://www.lroc.asu.edu/images/1314, Chang'e 6 https://www.lroc.asu.edu/images/1374, Blue Ghost M1 https://www.lroc.asu.edu/images/1407
- **[F18]** USGS / IAU, *Gazetteer of Planetary Nomenclature*, centri delle formazioni lunari: https://planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip
- **[F19]** M. K. Barker, NASA GSFC PGDA, *A New View of the Lunar South Pole from LOLA* (prodotto 90): DEM, qualità e slope con supporto circolare di diametro 100 m. https://pgda.gsfc.nasa.gov/products/90. File in https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/. Riferimento: https://iopscience.iop.org/article/10.3847/PSJ/acf3e1. DEM a 5 m, errori e cloni per specifici siti: https://pgda.gsfc.nasa.gov/products/78
- **[F20]** NASA, *VIPER Lunar Operations*: riferimento nominale di 15°, con capacità diverse in determinate condizioni; non limite universale di percorribilità. Per distinguere le condizioni delle 50 ore si usa [F28]. https://science.nasa.gov/mission/viper/lunar-operations/
- **[F21]** *Landing site selected for the Blue Ghost Mission 1*, LPSC 2022, abstract 1390: requisiti CLPS e del lander con pendenze ≤ 10°; pendenze nell'ellisse scelta < ~5°. https://www.hou.usra.edu/meetings/lpsc2022/pdf/1390.pdf
- **[F22]** Williams et al., *Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma*, Planetary Science Journal (2026): analisi della pendenza su base 4 m e vincoli CLPS specifici del progetto. https://doi.org/10.3847/PSJ/ae7d2c
- **[F23]** NASA, *Apollo Lunar Module Landing Gear*: riferimento storico sul sistema di atterraggio; non usato per stabilire soglie generali o un limite di decollo. https://www.nasa.gov/wp-content/uploads/static/history/alsj/LM_Landing%20Gear1973010151.pdf
- **[F24]** Wueller et al. (2026), *Assessing Potential Landing Sites With Favorable Illumination and Accessible, Potentially Volatile-Rich Permanently Shadowed Regions Within Artemis Candidate Landing Regions*, JGR Planets, doi:10.1029/2025JE009434
- **[F25]** P. Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA*, Icarus 243, 79–90, doi:10.1016/j.icarus.2014.08.013. Il 92,27% riguarda uno specifico punto di Connecting Ridge a 2 m in uno studio di 19 anni, con definizione diversa da P50 annuale. https://elib.dlr.de/94240
- **[F26]** T. George, M. A. Rubio, S. J. Lawrence, P. Curell (NASA), *Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions*, 57th LPSC (2026), abstract 1901. https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf
- **[F27]** NASA Planetary Data System, Geosciences Node, *LRO Diviner*: osservazioni e prodotti delle temperature della superficie lunare. https://pds-geosciences.wustl.edu/missions/lro/diviner.htm
- **[F28]** M. Shirley et al. (NASA Ames, SETI, Stanford), *VIPER Traverse Planning*, LPSC 2022, abstract 2874: 50 ore in ibernazione e 9 ore di normali operazioni all'ombra. https://www.hou.usra.edu/meetings/lpsc2022/pdf/2874.pdf
- **[F29]** H. J. Fincannon, NASA Glenn, *Lunar Environment and Lunar Power Needs*: ombre topografiche ed eclissi terrestri nel contesto dell'alimentazione. https://ntrs.nasa.gov/api/citations/20205002224/downloads/Lunar%20Environment%20and%20Lunar%20Power%20Needs_2.pdf
- **[F30]** LROC, *WAC Time-Weighted South Pole Illumination Map*: osservazioni 2010–2011, copertura e pesatura temporale documentate. https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH
- **[F31]** NASA-STD-7009B, *Standard for Models and Simulations*: riferimento metodologico per verifica, validazione e incertezza; non dichiarazione di conformità del progetto. https://standards.nasa.gov/standard/NASA/NASA-STD-7009
- **[F32]** JPL, *Horizons System Manual*: frame, quantità 14/15/19/20, tempi e geometria apparente. https://ssd.jpl.nasa.gov/horizons/manual.html
- **[F15]** Immagine Docker `mambaorg/micromamba`: https://hub.docker.com/r/mambaorg/micromamba (tag verificati il 14/11/2026).
