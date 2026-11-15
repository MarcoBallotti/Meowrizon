# Piano per la logica di valutazione

Questo piano descrive cosa fare **prima e durante** l'implementazione della logica di Meowrizon. La domanda a cui il programma deve rispondere è:

> **Data una data, quali regioni del polo sud sono le migliori per atterrare, e perché?**

Regole del documento:

- ogni dato, soglia o definizione ha una fonte, indicata come **[F1]**, **[F2]**…, con l'elenco completo in fondo;
- quello per cui non esiste una fonte è marcato **Scelta del team**: va deciso da noi, in modo esplicito e modificabile;
- ⚠️ indica qualcosa ancora da verificare con una prova reale.

Tecnologie: quelle del `README.md` [F13]. Backend Python 3.12 con FastAPI, GDAL, Rasterio e NumPy, dipendenze da conda-forge in `backend/environment.yml`. **Nessun database**: i dati stanno in file (GeoJSON, JSON, NumPy) in `data/` (decisione del team, 14/11/2026). Le effemeridi arrivano **solo dall'API di Horizons**: SpiceyPy è stato tolto (decisione del team, 14/11/2026). Frontend React, TypeScript, Vite e CesiumJS.

**Ripartizione (decisione del team, 14/11/2026):** tutta la logica è in **Python**: dati, calcoli, classifica, API e agente AI. **TypeScript** serve solo al frontend: globo, mappe, grafici, animazione. Il framework web resta FastAPI; Flask è stato scartato perché non dà nulla in più e perde lo schema OpenAPI automatico.

Documenti collegati: `docs/siti-e-regioni.md` (modello a regioni) e `docs/guida-dati.md` (API e dati).

---

## 0. Da dove partiamo

Il `README.md` contiene già decisioni e criteri del team [F13], che questo piano riprende:

- **effemeridi** come tabella unica per tutta la Luna: Horizons con `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,20'`;
- **terreno** dai DEM LOLA polari della PDS (`ldem_*`): uno lontano a 240 m e uno vicino a 20–40 m;
- **horizon mask** di 360 valori, con curvatura lunare e osservatore alto 2 m;
- **Sole visibile** quando metà del disco supera l'orizzonte locale; **Terra visibile** quando il suo centro lo supera;
- **riassunti**: % di sole, % di Terra, notte più lunga, elevazione solare, indice di potenza;
- **prototipo Python** fuori dal repository, provato su 9 siti per il 2027–2028 e validato: az/el coincide con Horizons topocentrico, l'orientamento LOLA è giusto, il fondo di Shackleton risulta senza Sole né Terra. Va portato in `backend/app/services/`.

Cosa cambia rispetto al README:

- l'oggetto valutato è la **regione** (modello concordato in `docs/siti-e-regioni.md`), misurata con celle interne, non più il singolo sito;
- il README nota che "mancano le coordinate verificate delle regioni Artemis III": ora le abbiamo da Moon Trek [F3].

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
| `scipy` | Trovare la **zona continua più grande** di celle buone (`scipy.ndimage.label`) |
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

Il primo requisito di atterraggio di Artemis III è "atterrare entro 6° di latitudine dal polo sud" [F1, slide 21]. Anche il layer delle regioni Artemis le descrive "entro sei gradi di latitudine dal polo sud" [F3].

**Proposta:** settore = **sud di 84°S**, invece degli 80°S scritti finora in `docs/siti-e-regioni.md`. Così il settore coincide con un requisito NASA invece che con una nostra scelta. I poligoni Artemis si tengono interi anche se sporgono di poco: Nobile Rim 2 ha il centro a 83,98°S e arriva fino a circa 83,6°S.

### 2.2 Regioni: le due liste NASA

| Regione | Lista 2022 (13) [F3] | Lista 2024 (9) [F4] | Poligono disponibile |
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

Per le 4 regioni nuove del 2024 **non abbiamo trovato poligoni pubblici**: la NASA le ha annunciate con un'immagine [F4] e Moon Trek ha solo il layer del 2022. Non si possono disegnare a mano senza inventare i confini, quindi **non entrano nel catalogo** (decisione del team, 14/11/2026): non si possono né rappresentare sulla mappa né valutare. Si aggiungono quando esce una geometria ufficiale. Mons Mouton resta comunque presente come zona bersaglio di Griffin-1, tra i siti.

**Opzioni (decisione D2):**

- **A. Tutte le 13 del 2022**, mostrando nell'interfaccia se una regione è ancora nella lista 2024. Più regioni da confrontare, tutte con dati completi.
- **B. Solo le 5 presenti in entrambe le liste** (in grassetto). Solo regioni ancora attuali, ma meno confronto.

**Per sviluppare la pipeline si parte da due regioni**, entrambe in tutte e due le liste:

- **de Gerlache Rim 2** (88,1°S): coperta per intero dal DEM a 5 m del polo; la sua parte a sud di 88°S è dentro la mappa di illuminazione LROC 88–90°S [F8], quindi validabile con immagini reali;
- **Malapert Massif** (85,9°S): rilievo esteso, condizioni di luce e di Terra diverse dalla prima.

Connecting Ridge, consigliata in `docs/siti-e-regioni.md`, non è più nella lista 2024 [F4]: per questo la sostituisco con de Gerlache Rim 2.

### 2.3 Passi

**Stato (14/11/2026): fatto**, con il comando `python -m app.cli init-regions`.

1. **Catalogo versionato** in `backend/catalog/`:
    - `regions.toml` decide quali regioni usare: le 13 con contorno, con le liste di appartenenza (2022, 2024) e `active`. Le 4 regioni del 2024 senza contorno non ci sono. Contiene anche il limite del settore e la dimensione delle celle;
    - `sites.toml` contiene i siti di atterraggio, ognuno con fonte obbligatoria. Per ora è vuoto: l'elenco è da definire.
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

**Siti di atterraggio (decisione del team, 14/11/2026):** ogni sito si valuta come **una cella di 100 × 100 m** attorno al punto, con gli stessi vincoli e metriche delle celle delle regioni, e compare in una tabella separata dalla classifica delle regioni.

**Quali siti (decisione del team, 14/11/2026):** all'apertura la mappa mostra le regioni Artemis III e 16 siti, tutti valutabili. L'elenco completo, con le coordinate, è in `docs/siti-e-regioni.md` (8.4) e in `backend/catalog/sites.toml`:

- **12 atterraggi riusciti tra i più famosi**: Apollo 11, 12, 14, 15, 16 e 17, Luna 9, Luna 17 / Lunokhod 1, Chang'e 4 e 6, Chandrayaan-3, Blue Ghost M1. Coordinate dal layer di Moon Trek *Lunar Anthropogenic Impacts and Spacecraft Sites* (dati NSSDCA) [F16] e dalle pagine LROC [F17]. Niente atterraggi falliti o riusciti in parte, quindi niente IM-1, IM-2 e SLIM;
- **4 missioni CLPS future**: Griffin-1, Blue Moon MK1 Pathfinder, IM-3, Blue Ghost M2. Il punto è il centro della formazione bersaglio, dal Gazetteer IAU [F18] o dalla regione Artemis.

**Il limite di 84°S vale solo per le regioni.** I siti possono stare ovunque: quelli fuori dal settore (14 su 16) hanno `in_sector = false` e servirà un **DEM globale** per il loro orizzonte (vedi Fase 3).

Errore corretto durante il lavoro: i centri delle regioni nella prima versione di `docs/siti-e-regioni.md` erano medie di latitudini e longitudini dei vertici, sbagliate vicino al polo. Ora sono il centro geometrico calcolato in metri.

---

## 3. Fase 3: dati e fonti

| Dato | Fonte | Prodotto | Uso |
|---|---|---|---|
| Posizione di Sole e Terra | JPL Horizons [F5] | `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,20'`. Verificato il 14/11/2026: restituisce punto sub-terrestre, punto sub-solare e distanza Terra-Luna, con Luna sferica di 1737,4 km ed effemeridi DE441 | Az/el di Sole e Terra per ogni cella e ogni ora |
| Dimensione apparente della Terra | Horizons [F5] | Raggio terrestre nell'intestazione della risposta (6378,137 km) e distanza `delta` | Raggio angolare della Terra (~0,95°), per il criterio del disco |
| Dimensione apparente del Sole | IAU 2015 B3 [F11] e Horizons [F5] | Raggio solare nominale 695 700 km e distanza del Sole | Raggio angolare del Sole (~0,27°), per la frazione di disco visibile |
| Terreno | PDS, LOLA GDR polari [F6] | Verificati sul server: `ldem_875s_5m/10m/20m`, `ldem_85s_10m/20m/40m`, `ldem_80s_20m/40m/80m`, `ldem_75s_30m/60m/120m/240m` | Horizon mask, pendenza |
| Pendenza | Calcolata da noi dai DEM [F6] | Su una base di **100 m**, come nel requisito NASA [F1, slide 21] | Vincolo di pendenza |
| Ombre permanenti | PGDA / PDS, illuminazione LOLA [F7] | `lpsr_85s_060m_201608` (60 m, 85–90°S); per le regioni a nord di 85°S `lpsr_75s_120m_201608` (120 m, 75–90°S) | Validazione e informazione |
| Illuminazione media | PGDA / PDS [F7] | `avgvisib_85s_060m_201608` (Sole) e `avgvisib_85s_060m_201608_earth` (Terra); per le regioni a nord di 85°S le versioni `75s_120m`. Medie su 18,6 anni a passo orario | Validazione; eventuale prefiltro (D11) |
| Illuminazione osservata | LROC, Moon Trek [F8] | `WAC_POLE_ILL_PCT_SOUTH_100M`: % di illuminazione da immagini reali, 88–90°S, febbraio 2010 – febbraio 2011 | Validazione indipendente dal nostro modello |
| Regioni | Moon Trek [F3] | `A3_Named_regions_SP` | Poligoni |
| Siti | Moon Trek [F16], LROC [F17], Gazetteer IAU [F18] | `Lunar_Landing_Impact_Sites`, pagine LROC, `MOON_nomenclature_center_pts` | Coordinate dei 16 siti |
| Terreno fuori dal settore | Moon Trek, ImageServer (`exportImage`) | `LRO_LOLA_DEM_Global_128ppd_v04`: tutta la Luna, ~237 m all'equatore, float32. Provato il 14/11/2026: un ritaglio di 6,3° × 6,3° attorno ad Apollo 15 (806 × 806 pixel, 3 MB) arriva in ~5 s. Per 45–90°S c'è anche `LRO_LOLA_DEM_SPole45_100mp_v04_EQ` (100 m), che copre Chandrayaan-3 | Horizon mask dei siti con `in_sector = false`, ritagli attorno a ogni sito |

Note:

- Il layer `PSR_SP` di Moon Trek contiene solo le **164 ombre permanenti più grandi di 10 km²** [F9]: per celle da 100 m non basta, perché le ombre piccole nei fondi dei crateri mancano. Per questo si usa la mappa raster `lpsr_*` [F7].
- Per ogni file scaricato si scrive un **manifest** con URL, versione, data, dimensione e SHA-256, come previsto da `data/README.md`.
- ⚠️ **Alternativa più recente per il terreno del polo sud [F19]** (trovata il 14/11/2026 guardando le fonti dati di QuickMap): i DEM LOLA "ADJ" di Barker et al. (PGDA, prodotto 90), con orbite ricalcolate e meno artefatti rispetto ai `ldem_*` della PDS. Ci sono:
    - DEM `LDEM_83S_10MPP_ADJ`, `LDEM_80S_20/40/80MPP_ADJ`, `LDEM_75S_30MPP_ADJ`, `LDEM_60S_60/120/240MPP_ADJ`. Le versioni a 60°S coprono anche Chandrayaan-3;
    - mappe di pendenza `LDSM_*`, ombre permanenti `LPSR_80S_20MPP_ADJ`, errore di quota `*_ERR` e risoluzione effettiva `*_EFFRES`.

  Sono **GeoTIFF ottimizzati per il cloud (COG)** in stereografica polare sud sulla sfera di 1737,4 km, quindi GDAL ne legge solo il pezzo che serve, senza scaricare il file intero. Provato: una finestra di 10 × 10 km a 20 m su Malapert Massif (500 × 500 pixel) arriva in pochi secondi, con quote tra 2,95 e 5,17 km. Da decidere se sostituiscono i `ldem_*` della PDS.

---

## 4. Fase 4: criteri

**Ridefiniti da zero il 15/11/2026.** I criteri scritti in precedenza (vincoli V1–V5, metriche M1–M8, area buona e zona continua, ordinamento senza pesi) sono **superati** e non vanno usati. Restano valide le decisioni su architettura, punti sulla mappa e fonti dei dati.

Tutti i criteri, con il perché di ogni scelta, sono raccolti anche in `docs/criteri-algoritmo.md`.

### 4.1 Principi

- **Niente profili di missione.** Il programma non dice "passa / non passa" per un veicolo preciso: **misura e colora**, e ogni colore ha come riferimento una soglia NASA con la sua fonte. Il giudizio finale resta all'utente.
- **Niente valori fissi su Sole e Terra.** La loro elevazione cambia con il punto e con la data: si calcola ogni ora, per ogni cella, dalle effemeridi Horizons in UTC [F5]. Come ordine di grandezza, al polo sud Sole e Terra stanno a pochi gradi sopra l'orizzonte (2–7° [F1, slide 19]). Il Sole al polo esatto non supera ~1,5°, l'inclinazione dell'asse lunare; la Terra oscilla per la librazione ed è visibile circa due settimane su quattro [F1, slide 19].
- **Dati in locale per i punti predefiniti.** Le 13 regioni e i 16 siti si calcolano in anticipo e si salvano in file, così l'app si apre subito anche senza rete. I server NASA servono ad aggiornare la cache e a valutare le coordinate inserite a mano.

### 4.2 Linea di vista verso Sole e Terra

È il cuore del calcolo. Per ogni cella:

1. dal DEM si ricava la **maschera d'orizzonte**: per ognuna di 360 direzioni, l'**angolo** sotto cui si vede il terreno più alto, tenendo conto della curvatura lunare, per un osservatore a 2 m dal suolo [F13];
2. per ogni ora si confronta l'elevazione di Sole e Terra con l'angolo della maschera **nella loro direzione** (azimut);
3. se il disco sta sotto la maschera, la linea di vista è bloccata. Per il Sole questo vuol dire **ombra**: i pannelli non caricano e la temperatura scende. Per la Terra vuol dire **niente comunicazione diretta**.

Al polo basta un piccolo rilievo a bloccare la vista, e le ombre arrivano a chilometri di distanza: per questo serve l'orizzonte reale e non quello geometrico.

Il Sole (~0,27° di raggio apparente) e la Terra (~0,95°) non sono punti: si calcola la **frazione di disco visibile** (Mazarico et al. [F7]), un numero tra 0 e 1 che si salva sempre.

**Deciso (C3, 15/11/2026): Sole e Terra contano come visibili quando se ne vede almeno metà del disco (frazione ≥ 0,5).**

- **Sole:** la potenza dei pannelli cresce con la parte di disco visibile. Con metà disco arriva circa metà dell'energia; con uno spicchio sottile quasi niente, quindi contarlo come "luce" sarebbe ottimistico. È anche la definizione del prototipo già validato [F13].
- **Terra:** la PGDA la conta visibile se se ne vede una parte qualsiasi, ma avverte che è "leggermente ottimistico" per le comunicazioni radio [F7]. Metà disco equivale circa a "il centro della Terra è sopra l'orizzonte", la definizione del prototipo [F13], ed è più prudente per un segnale fragile.
- La soglia è un parametro: per confrontarsi con le mappe PGDA nella validazione (Fase 6) si ricalcola con frazione > 0. Nell'interfaccia si mostra anche la frazione, per esempio "Sole visibile al 70%".

### 4.3 I criteri

Non c'è una durata di permanenza da scegliere (decisione del 15/11/2026): la challenge chiede il **tempo rimanente** al tramonto del Sole e della Terra, la **durata della luce** e le **finestre di visibilità della Terra** [F12]. Si misurano da T **in avanti, fino all'evento**, senza fissare una fine.

| # | Criterio | Livello | Cosa si misura | Riferimento |
|---|---|---|---|---|
| 1 | Sole visibile | Atterraggio (T) | Sì / no, con la frazione di disco (C3) | Energia solare [F12] |
| 2 | Terra visibile | Atterraggio (T) | Sì / no, con la frazione di disco (C3) | Comunicazione diretta [F1, slide 21], [F12] |
| 3 | Elevazione del Sole | Atterraggio (T) | Gradi sopra l'orizzonte **locale** (margine sulla maschera) | "Elevazione solare in evidenza" [F12] |
| 4 | Elevazione della Terra | Atterraggio (T) | Gradi sopra l'orizzonte locale | Al polo basta un piccolo rilievo a bloccare il segnale |
| 5 | Luce continua | Dopo l'atterraggio | Ore da T al primo tramonto del Sole | "Tempo rimanente al tramonto", "durata della luce" [F12] |
| 6 | Contatto continuo con la Terra | Dopo l'atterraggio | Ore da T al primo tramonto della Terra | "Finestre di visibilità della Terra" [F12] |
| 7 | Prima notte | Dopo l'atterraggio | Quando inizia e quanto dura il primo buio; 🔴 oltre 50 ore | VIPER, 50 ore di buio al massimo [F20] |
| 8 | Pendenza | Terreno | Classe su 100 m: 🟢 🟡 🟠 🔴 (4.4) | [F1], [F2], [F20], [F21], [F22] |
| 9 | Illuminazione annua | Anno (365 giorni) | % di ore con il Sole nell'anno, picchi > 80% (C6), calendario dei giorni con 1 e 2 veri | [F7], [F8] |
| 10 | **Tenuta se l'atterraggio slitta** | T ± 1, 2, 3 giorni | Si ricalcolano i criteri 1–9 con le date vicine, alla stessa ora | Le date slittano spesso: contesto esplicito della challenge [F12]. I giorni (1–3) sono una **Scelta del team** |

Note:

- per il criterio 10 la NASA indica la stessa direzione: nella scelta delle regioni di Artemis III sono state favorite quelle "più robuste tra le diverse epoche di missione" e "meno sensibili alle incertezze sui tempi" [F26];
- solo i criteri 1–7 cambiano davvero con la data: pendenza (8) e illuminazione annua (9) sono le stesse per tutte le date vicine. Il ricalcolo usa le stesse maschere e la stessa tabella di effemeridi, quindi costa poco;
- quando si può dire che un sito "regge" uno slittamento di k giorni è la decisione C7;
- l'interfaccia mostra anche le **prossime finestre** di Sole e Terra dopo T, e una timeline di un mese lunare (~29,5 giorni) con zoom libero. È visualizzazione, non un criterio.

### 4.4 Soglie di riferimento (con fonte)

**Pendenza**, misurata su una base di **100 m** come nel requisito NASA [F1, slide 21] (decisa il 15/11/2026):

| Colore | Pendenza su 100 m | Significato | Fonte |
|---|---|---|---|
| 🟢 Verde | < 8° | Adatta anche al lander umano più esigente | Tolleranza HLS ≥ 8° [F2] |
| 🟡 Giallo | 8–10° | Entro il limite di atterraggio di Artemis III e dei lander CLPS | < 10° [F1, slide 21]; ≤ 10° per Blue Ghost [F21] e nei bandi CLPS [F22] |
| 🟠 Arancione | 10–15° | Non adatta all'atterraggio, ma percorribile da un rover | VIPER percorre pendenze fino a 15° [F20] |
| 🔴 Rosso | > 15° | Non adatta né all'atterraggio né al rover | Oltre il limite nominale di VIPER [F20] |

Altri riferimenti, da mostrare come informazione: il modulo lunare Apollo poteva non riuscire a ripartire oltre ~12° di inclinazione [F23, ⚠️ da leggere nel documento]; gli astronauti a piedi richiedono pendenze < 20° su 2 km [F1, slide 24].

**Buio continuo** (criterio 7): l'avviso rosso scatta quando la prima notte dopo l'atterraggio supera **50 ore**, il buio massimo che il rover VIPER sopporta [F20]. Nell'interfaccia va scritto che il riferimento è VIPER: veicoli diversi hanno limiti diversi. Il programma **non** calcola la temperatura, ma solo la durata del buio.

**Illuminazione annua** (criterio 9, decisione C6 del 15/11/2026): i punti con almeno l'**80%** di ore di Sole nell'anno si evidenziano come picchi adatti a produrre energia stabile.

- La soglia dell'80% è una **Scelta del team**: nessuna fonte primaria la definisce. Lo studio NASA di Mazarico et al. 2011 non la usa [F7]; la cifra "5 km² sopra l'80%" che circola è attribuita a quello studio solo da fonti secondarie.
- È però coerente con i valori misurati nei punti più illuminati del polo sud. Il massimo noto è il **92,27%** delle ore a 2 m dal suolo, su Connecting Ridge, con notti più lunghe di 3–5 giorni [F25]. Mazarico et al. trovano un punto sul bordo di Shackleton illuminato senza interruzioni per 240 giorni l'anno, con la notte più lunga di ~1,5 giorni [F7]. Con l'80% si evidenziano quindi i punti vicini ai migliori conosciuti.
- Si calcola per un osservatore a **2 m**, come le nostre maschere e come il valore di riferimento [F25]. L'interfaccia mostra la % esatta e, accanto, il massimo noto del 92,27% come confronto.
- L'illuminazione annua cambia un po' da un anno all'altro: le condizioni di luce al polo si spostano di circa 2–3 settimane l'anno [F26]. Va calcolata sull'anno della data scelta.

### 4.5 Ombre permanenti

Le ombre permanenti (`lpsr`, PGDA [F7], [F19]) sono fondi di crateri senza Sole, dove si cerca il ghiaccio d'acqua: è un obiettivo scientifico di Artemis III [F3].

**Deciso (C1, 15/11/2026): solo un livello sulla mappa.** Si mostrano colorate, perché l'utente veda dove sono, ma **non** entrano nella valutazione delle regioni: niente distanza, raggiungibilità o effetto sulla classifica.

Se in futuro servisse un'analisi di accessibilità, il riferimento è Wueller et al. 2026 [F24], che la fa sulle regioni Artemis.

### 4.6 Punti papabili e confronto tra regioni

**Deciso il 15/11/2026 (C4 e C5).**

**Punto papabile.** Ogni cella di 100 m di una regione (e ogni sito) è un punto candidato. È **papabile** se, all'istante T:

1. il Sole è visibile (criterio 1);
2. la Terra è visibile (criterio 2);
3. la pendenza su 100 m è **< 10°**, cioè 🟢 o 🟡 (criterio 8) [F1], [F21].

Gli altri criteri non escludono un punto: dicono quanto è buono. I punti papabili restano **interni**: servono a valutare e ordinare le regioni, **non** si mostrano sulla mappa (resta valida la decisione del 14/11: il programma dice quale regione usare).

**Regione considerata o scartata.** Una regione è considerata solo se ha almeno un punto papabile. Altrimenti è scartata, con il motivo: la condizione che ha escluso più celle, per esempio "nessun punto con la Terra visibile all'atterraggio".

**Confronto tra regioni**, senza pesi. Ogni passo decide solo a parità del precedente:

1. **tenuta** (criterio 10): per quanti giorni di slittamento, fino a ± 3, la regione ha ancora punti papabili;
2. **area papabile**: km² di punti papabili all'istante T, cioè il margine se il lander non tocca il punto previsto (IM-2 è atterrato a ~250 m dal bersaglio [F14]);
3. **ore di luce continua** (criterio 5) del punto papabile migliore;
4. **ore di contatto con la Terra** (criterio 6) del punto papabile migliore.

Tutti i valori restano visibili in tabella, e l'utente può riordinare per qualsiasi colonna.

**Area papabile e topografia.** La topografia entra nei punti papabili attraverso la pendenza (criterio 8) e la maschera d'orizzonte (criteri 1 e 2: ombre e Terra coperta). L'area si misura sulla mappa, cioè numero di celle × 0,01 km². Le correzioni sono trascurabili ma si applicano: il fattore di scala della stereografica polare vale 1,0005–1,0055 tra 89° e 84°S, e la superficie inclinata è più grande di 1/cos(pendenza), cioè meno dell'1,5% sotto i 10°.

**Prima stima (15/11/2026), solo pendenza**, dal DEM ADJ della PGDA a 20 m [F19], piano ai minimi quadrati su ogni cella di 100 m:

| Regione | 🟢 < 8° | 🟡 8–10° | 🟠 10–15° | 🔴 > 15° | Area con pendenza < 10° |
|---|---|---|---|---|---|
| de Gerlache Rim 2 | 22,8% | 10,7% | 33,3% | 33,2% | 133,8 km² su 400 |
| Malapert Massif | 10,8% | 5,9% | 20,0% | 63,3% | 73,6 km² su 441 |

È un **limite superiore**: i punti papabili saranno di meno, perché all'istante T servono anche Sole e Terra visibili.

### 4.7 Ancora da definire

| # | Cosa | Note |
|---|---|---|
| C1 | Ruolo delle ombre permanenti | **Deciso (15/11):** solo livello sulla mappa (4.5) |
| C2 | Durata della permanenza | **Eliminata (15/11):** le misure vanno da T fino all'evento (4.3) |
| C3 | Frazione di disco che conta come "visibile" | **Deciso (15/11):** almeno metà del disco, per Sole e Terra (4.2) |
| C4 | Come si passa dalle celle alla regione | **Deciso (15/11):** punti papabili (4.6) |
| C5 | Come si confrontano le regioni | **Deciso (15/11):** tenuta, area papabile, ore di luce, ore di contatto (4.6) |
| C6 | Soglia dell'illuminazione annua | **Deciso (15/11):** ≥ 80%, Scelta del team, confrontata con il massimo noto del 92,27% [F25] (4.4) |
| C7 | Quando si "regge" uno slittamento (criterio 10) | **Deciso (15/11):** vedi sotto |

**Decisione C7 (15/11/2026): quando si regge uno slittamento.**

- Un **punto** regge uno slittamento di j giorni se a T + j (alla stessa ora) è ancora **papabile**: Sole e Terra visibili e pendenza < 10° (4.6). Si usa la stessa regola dei punti papabili, così il criterio resta coerente.
- Una **regione** regge se a T + j ha ancora almeno un punto papabile.
- La tenuta si riporta **separata per ritardi e anticipi**, perché in pratica gli slittamenti sono soprattutto ritardi: "regge fino a +2 giorni di ritardo e −1 di anticipo". Conta solo una serie **senza buchi**: se a +1 non regge, +2 e +3 non contano.
- Nel confronto tra regioni (4.6, passo 1) vale il minimo dei due versi; a parità, il ritardo.
- La prima notte (criterio 7) non entra nella regola: si mostra per ogni data vicina con il suo avviso, ma non decide la tenuta.
- I giorni (fino a ± 3) restano una **Scelta del team**. La NASA conferma che la robustezza alle date conta [F26], ma non indica un numero di giorni.

### 4.8 Limiti da dichiarare

- I DEM non vedono massi e piccoli crateri sotto la loro risoluzione (5–20 m al polo) [F6].
- Nessun modello termico: si misura la durata del buio, non la temperatura.
- Nessuna valutazione di traiettoria o di relay.

---

## 5. Fase 5: algoritmo di valutazione

### 5.1 Calcolo preliminare (una volta, offline)

Per ogni regione:

1. celle da 100 m dentro il poligono;
2. pendenza su 100 m per ogni cella, dal DEM più fine disponibile [F6];
3. appartenenza a un'ombra permanente, da `lpsr_*` [F7];
4. horizon mask di 360 valori per ogni cella, con il metodo del README: DEM lontano a 240 m, DEM vicino a 5–20 m, curvatura, osservatore a 2 m [F13];
5. salvataggio in file NumPy in `data/regions/<id>/` (per esempio `cells.npz` e `horizon.npy`, leggibile a pezzi senza caricarlo tutto). A 360 valori interi per cella sono circa 0,7 KB per cella, ~350 MB per tutte le regioni a 100 m.

Effemeridi: tabella Horizons globale a passo orario per gli anni che vogliamo coprire, salvata in `data/cache/`. Due anni sono ~17.500 righe, circa 1 MB [F13]. La stessa tabella serve ai criteri dopo l'atterraggio, al calendario annuale e alla tenuta ± 1–3 giorni.

### 5.2 Per ogni richiesta (istante di atterraggio T)

1. Righe di effemeridi da T − 3 giorni fino a quando si chiudono gli eventi dei criteri 5–7 (al più un mese lunare dopo T + 3 giorni), e su 365 giorni per il calendario.
2. Per ogni cella e ogni ora: azimut ed elevazione di Sole e Terra nel sistema locale, a partire dai punti sub-solare e sub-terrestre, con la parallasse della Terra calcolata da `delta` [F5] (metodo del README [F13]).
3. Confronto con la maschera d'orizzonte, interpolata sull'azimut: frazione visibile dei dischi di Sole e Terra (4.2).
4. Criteri 1–9 per ogni cella (4.3), poi il criterio 10 ripetendo i criteri 1–7 a T ± 1, 2, 3 giorni.
5. Punti papabili di ogni regione, regioni scartate con il motivo, confronto tra le regioni considerate (4.6).

### 5.3 Risultato per regione

Per ogni regione:

```text
atterraggio (1–4): Sole e Terra visibili, elevazioni sopra l'orizzonte locale
dopo l'atterraggio (5–7): ore di luce, ore di contatto con la Terra, prima notte (avviso > 50 h)
terreno (8): celle per classe di pendenza (verde, giallo, arancione, rosso)
anno (9): % di illuminazione annua, calendario dei giorni buoni
tenuta (10): criteri 1–7 a T−3 … T+3 giorni
stato: considerata | scartata (motivo)
punti papabili: area in km², valori del punto migliore (interni, non mostrati sulla mappa)
posizione nel confronto
```

### 5.4 Fatto quando

- Su de Gerlache Rim 2 e Malapert Massif, per una data, il calcolo produce i criteri 1–10 in pochi secondi.
- I test coprono: conversione delle coordinate, az/el contro Horizons, maschera d'orizzonte su terreno sintetico (già fatta nel prototipo [F13]), classi di pendenza e durata del buio su casi noti.

---

## 6. Fase 6: validazione con dati indipendenti

| Controllo | Riferimento | Cosa deve risultare |
|---|---|---|
| Effemeridi | Horizons topocentrico (`CENTER='coord@301'`) [F5] | Az/el uguali per 3 celle per regione; il prototipo ha già mostrato uno scarto < 0,001° [F13] |
| Ombre permanenti | `lpsr_*` [F7] | Nessuna cella in ombra permanente vede mai il Sole |
| Illuminazione media | `avgvisib_*`, Sole e Terra [F7] | Su ~50 celle, la nostra media oraria su 18,6 anni è vicina alla mappa NASA; si riportano le differenze |
| Illuminazione osservata | `WAC_POLE_ILL_PCT_SOUTH_100M` [F8] | Sulle celle di de Gerlache Rim 2 a sud di 88°S, nel periodo febbraio 2010 – febbraio 2011, la nostra % di luce è coerente con quella delle immagini |
| Affermazione NASA | "Tutte le 13 regioni contengono siti con luce continua per 6,5 giorni" [F3] | Nell'arco di un anno, ogni regione ha almeno una cella con 6,5 giorni di luce continua |
| Orizzonte a vista | QuickMap, "Create Panorama" | Il profilo calcolato somiglia al panorama per 2–3 punti |

Se un controllo fallisce, si corregge prima di andare avanti: tutto il resto dipende da questi.

---

## 7. Fase 7: dati al frontend (da completare con la UI)

**Il contratto esiste già:** il team ha scritto `docs/api-contract.md` e, in dettaglio, `backend/API_CONTRACT.md` (14/11/2026). Il frontend usa già i tipi in `frontend/src/api/types.ts`. Le regole principali sono:
- tutte le API sotto `/api`;
- JSON in camelCase;
- lavori asincroni (`JobState`) per le analisi;
- cinque endpoint di livello C già letti dal client: `GET /api/coverage`, `POST`/`GET /api/terrain-analyses`, `POST`/`GET /api/scenario-evaluations`.

Il backend va costruito su quel contratto. FastAPI pubblica comunque la propria descrizione su `/api/openapi.json`.

Già fatto:
- tutte le rotte del backend sono sotto `/api`;
- Vite (in sviluppo) e nginx (in produzione) inoltrano `/api` al backend;
- il CORS per `localhost:5173` resta per le chiamate dirette.

Da chiarire nel team:
- **framework: risolto (15/11/2026).** `backend/API_CONTRACT.md` ora prevede FastAPI. Il backend di Kevin (branch `backend`) è integrato nella stessa applicazione: rotte `/api/data/...` per acquisizione, preparazione (JSON, Parquet) e job persistenti, con i dati in `backend/data/`;
- **`GET /api/sites`:** nel contratto restituisce un `SiteCatalog` in camelCase, con `coordinateStatus` e siti anche equatoriali (Apollo). Il nostro restituisce GeoJSON dei siti di `sites.toml`, limitati al settore polare. Il frontend oggi non lo legge, ma i due formati vanno unificati;
- **regioni:** `/api/regions` e la classifica delle regioni non sono nel contratto. Vanno aggiunte come estensione concordata.

Bozza degli endpoint per le regioni (estensione del contratto):

| Endpoint | Restituisce |
|---|---|
| `GET /api/health` | Stato del servizio |
| `GET /api/regions` | **Già fatto.** GeoJSON delle regioni in latitudine e longitudine, con nome, liste di appartenenza (2022, 2024), area, DEM; `?active=true` per le sole attive |
| `GET /api/ranking?t=…&duration_h=…` | Confronto tra le regioni (forma da definire con C5) |
| `GET /api/regions/{id}/evaluation?t=…` | Dettaglio: criteri 1–10 (atterraggio, dopo l'atterraggio, terreno, anno, tenuta) |
| `GET /api/regions/{id}/cells?t=…` | Stato delle celle per colorare la regione. Formato da decidere con la UI (D12) |
| `GET /api/sites` | **Già fatto.** Siti di atterraggio in GeoJSON con la loro cella di 100 m; in seguito anche la loro valutazione |

Da decidere insieme alla UI:

- **formato delle celle**: GeoJSON (semplice ma pesante con migliaia di celle), griglia compatta più georeferenziazione, oppure immagine PNG da sovrapporre in Cesium;
- **cache dei risultati** in memoria (ed eventualmente in file JSON), per data arrotondata e parametri;
- **schemi Pydantic** per le risposte: oggi `/regions` e `/sites` restituiscono GeoJSON generico, quindi lo schema OpenAPI non descrive ancora i campi;
- **strumenti dell'agente AI** del README [F13] (`list_sites`, `compare_sites`, …): l'agente sta nel backend Python e chiama direttamente le stesse funzioni delle API. Gli strumenti sono pensati per siti e vanno adattati alle regioni;
- ⚠️ ellissoide lunare in CesiumJS (`Cesium.Ellipsoid.MOON`), da verificare nella versione installata.

---

## 8. Decisioni da prendere

Le decisioni sui criteri del 14/11 (D3–D7, D9–D11) sono **superate** dalla nuova Fase 4. Restano:

| # | Decisione | Stato |
|---|---|---|
| D1 | Confine del settore | **Deciso:** 84°S, solo per le regioni (`lat_limit` in `regions.toml`) [F1] |
| D2 | Regioni attive | Per lo sviluppo de Gerlache Rim 2 e Malapert Massif; a regime tutte le 13 |
| — | Profili di missione | **Deciso (15/11):** nessun profilo, misure con soglie NASA di riferimento (4.1) |
| — | Criteri | **Decisi (15/11):** criteri 1–10 (4.3): atterraggio, dopo l'atterraggio fino all'evento, terreno, anno, tenuta ± 1–3 giorni. Nessuna durata di permanenza |
| — | Scala di pendenza | **Decisa (15/11):** < 8°, 8–10°, 10–15°, > 15° su 100 m (4.4) |
| — | Buio continuo | **Deciso (15/11):** avviso oltre 50 ore, riferimento VIPER (4.4) |
| C1 | Ombre permanenti | **Deciso (15/11):** solo livello sulla mappa (4.5) |
| C3 | Sole e Terra visibili | **Deciso (15/11):** almeno metà del disco (4.2) |
| C4, C5 | Punti papabili e confronto | **Deciso (15/11):** 4.6 |
| C6, C7 | Illuminazione annua e tenuta | **Deciso (15/11):** 4.4 e 4.7 |
| D8 | Griglia delle maschere d'orizzonte | Da decidere dopo aver misurato i tempi |
| — | DEM del polo sud | PDS `ldem_*` o PGDA ADJ [F19]: da confrontare sulle 2 regioni |
| D12 | Formato delle celle per il frontend | Con la UI |

---

## 9. Ordine di lavoro

1. Fase 1: Docker funzionante con `/health`.
2. Criteri della Fase 4: decisi i criteri 1–10 il 15/11, tutti i criteri sono decisi.
3. Fase 2: poligoni delle regioni convertiti e salvati, siti scelti e scritti in `sites.toml`. **Fatto.**
4. Fase 3: download con manifest, prima per le 2 regioni di sviluppo.
5. Portare il prototipo del README in `backend/app/services/` (effemeridi e horizon mask), con i suoi test.
6. Fase 5 sulle 2 regioni, misurando i tempi, poi decisione D8.
7. Fase 6: validazione.
8. Estensione a tutte le 13 regioni e ai siti.
9. Fase 7 insieme alla UI.

---

## Fonti

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview*, presentazione per la NASA 2025 International Space Apps Challenge, 4 ottobre 2025. NTRS 20250009323. Slide 19 (caratteristiche del polo sud), 21 ("Key Artemis III Landing Requirements"), 23–28. https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge*. NTRS 20210026296. Slide 4: tolleranza di pendenza dell'HLS "almeno 8 gradi", da HLS-S-R-0071 (documento HLS-RQMT-006, 2021). https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- **[F3]** NASA Moon Trek, layer *Artemis III Candidate Landing Regions, S Pole* (`A3_Named_regions_SP`) e relativo abstract (regioni annunciate il 19 agosto 2022, criteri e luce continua per 6,5 giorni). Poligoni: https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json. Abstract: https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP. Annuncio: https://www.collectspace.com/news/news-081922a-artemis-iii-moon-landing-regions.html
- **[F4]** Aggiornamento NASA a 9 regioni, 28 ottobre 2024: https://www.upi.com/Science_News/2024/10/28/nasa-artemis-moon-landing-regions/5971730152372/ e https://www.space.com/space-exploration/artemis/nasa-announces-9-possible-moon-landing-sites-for-artemis-3-lunar-mission
- **[F5]** JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html. Chiamata di verifica del 14/11/2026 con `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='13,14,15,20'`.
- **[F6]** LOLA GDR polari, PDS Geosciences Node: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
- **[F7]** E. Mazarico, NASA GSFC PGDA, *Lunar Polar Illumination*: https://pgda.gsfc.nasa.gov/products/69. File: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/. Da citare: Mazarico, E., et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030.
- **[F8]** LROC, *WAC Percentage-Based Illumination 100mpp, S Pole* (`WAC_POLE_ILL_PCT_SOUTH_100M`), su Moon Trek. Riferimento: E. J. Speyerer, M. S. Robinson, *Persistently illuminated regions at the lunar poles: Ideal sites for future exploration*, Icarus 222 (2013) 122–136.
- **[F9]** NASA Moon Trek, layer *Permanently Shadowed Regions (PSRs), S Pole* (`PSR_SP`), abstract: 164 ombre permanenti, tutte > 10 km². https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=PSR_SP
- **[F10]** NASA Moon Trek, layer *LRO LOLA Slope, S Pole, 87.5 deg* (`Slope_LRO_LOLA_DEM_SPole875_5mp_v04`), per il controllo visivo della pendenza.
- **[F11]** IAU 2015 Resolution B3, valori nominali per le costanti solari (raggio solare nominale 695 700 km).
- **[F12]** NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **[F13]** `README.md` del repository Meowrizon: criteri, riduzione dei dati, prototipo e verifiche del team.
- **[F14]** IM-2: LROC, https://www.lroc.asu.edu/images/1401. IM-1: catalogo di Moon Trek.
- **[F16]** NASA Moon Trek, layer *Lunar Anthropogenic Impacts and Spacecraft Sites* (`Lunar_Landing_Impact_Sites`, 7/11/2022), dati NSSDCA: https://trek.nasa.gov/moon/trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer (sottolayer 1: atterraggi morbidi, 2: con equipaggio). Fonte dei dati: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
- **[F17]** LROC, posizione dei lander misurata nelle immagini di LRO: Chandrayaan-3 https://www.lroc.asu.edu/images/1314, Chang'e 6 https://www.lroc.asu.edu/images/1374, Blue Ghost M1 https://www.lroc.asu.edu/images/1407
- **[F18]** USGS / IAU, *Gazetteer of Planetary Nomenclature*, centri delle formazioni lunari: https://planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip
- **[F19]** M. K. Barker, NASA GSFC PGDA, *A New View of the Lunar South Pole from LOLA* (prodotto 90): https://pgda.gsfc.nasa.gov/products/90. File in https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/. Riferimento: https://iopscience.iop.org/article/10.3847/PSJ/acf3e1
- **[F20]** NASA, *VIPER Lunar Operations*: "può generalmente percorrere una pendenza fino a 15 gradi" e "non può sopportare più di 50 ore di buio continuo". https://science.nasa.gov/mission/viper/lunar-operations/ (letto il 15/11/2026)
- **[F21]** *Landing site selected for the Blue Ghost Mission 1*, LPSC 2022, abstract 1390: requisiti CLPS e del lander con pendenze ≤ 10°; pendenze nell'ellisse scelta < ~5°. https://www.hou.usra.edu/meetings/lpsc2022/pdf/1390.pdf
- **[F22]** *Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma*, Planetary Science Journal (2026): per il task order CLPS CP-21, ellisse di 100 m e pendenze < 10°. https://iopscience.iop.org/article/10.3847/PSJ/ae7d2c ⚠️ letto da sintesi, da verificare nel testo
- **[F23]** NASA, *Apollo Lunar Module Landing Gear*: stabilità del modulo lunare su pendenze fino a 12°. https://www.nasa.gov/wp-content/uploads/static/history/alsj/LM_Landing%20Gear1973010151.pdf ⚠️ da verificare nel testo
- **[F24]** Wueller et al. (2026), *Assessing Potential Landing Sites With Favorable Illumination and Accessible, Potentially Volatile-Rich Permanently Shadowed Regions Within Artemis Candidate Landing Regions*, JGR Planets, doi:10.1029/2025JE009434
- **[F25]** P. Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA*, Icarus 243, 78–90, doi:10.1016/j.icarus.2014.08.013. Abstract: https://elib.dlr.de/94240 (92,27% delle ore a 2 m, 95,65% a 10 m, notti più lunghe di 3–5 giorni, su Connecting Ridge)
- **[F26]** T. George, M. A. Rubio, S. J. Lawrence, P. Curell (NASA), *Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions*, 57th LPSC (2026), abstract 1901. https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf
- **[F15]** Immagine Docker `mambaorg/micromamba`: https://hub.docker.com/r/mambaorg/micromamba (tag verificati il 14/11/2026).
