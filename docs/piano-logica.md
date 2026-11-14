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

Per le 4 regioni nuove del 2024 **non abbiamo trovato poligoni pubblici**: la NASA le ha annunciate con un'immagine [F4] e Moon Trek ha solo il layer del 2022. Non si possono disegnare a mano senza inventare i confini, quindi restano fuori finché non si trova una geometria ufficiale.

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
    - `regions.toml` decide quali regioni usare: le 13 con contorno più le 4 del 2024 senza contorno, con le liste di appartenenza e `active`. Contiene anche il limite del settore e la dimensione delle celle;
    - `sites.toml` contiene i siti di atterraggio, ognuno con fonte obbligatoria. Per ora è vuoto: l'elenco è da definire.
2. **Download** dei poligoni da Moon Trek (`A3_Named_regions_SP`, `f=json`) [F3]. La risposta grezza è salvata in `data/sources/` con il registro `manifest.json` (URL, data, dimensione, SHA-256). `--offline` riusa l'ultimo download dopo averne controllato lo SHA-256.
3. **Conversione** dalla stereografica polare sud (sfera di 1 737 400 m) a latitudine e longitudine con pyproj, verificata contro la formula scritta a mano. Lati infittiti ogni 250 m per disegnarli in gradi; longitudine Est tra −180 e 180.
4. **Controlli che fermano il comando:**
    - etichetta assente su Moon Trek;
    - poligono non valido;
    - regione tutta fuori dal settore;
    - regione che attraversa ±180°;
    - nessun DEM che la copre;
    - sito senza fonte o fuori dal settore.

    Un'etichetta presente su Moon Trek ma non nel catalogo produce solo un avviso.
5. **Risultato** in `data/regions/regions.geojson` e `sites.geojson`. Per ogni regione: area sulla sfera, centro, angoli in metri, griglia di celle (le regioni sono quadrati con gli angoli su multipli di 100 m, quindi la griglia combacia con i bordi) e DEM LOLA che la copre. Per ogni sito: posizione in metri, cella di 100 × 100 m, regione Artemis in cui cade, DEM.
6. **API:** `GET /api/regions` (con `?active=true`) e `GET /api/sites`.

**Siti di atterraggio (decisione del team, 14/11/2026):** ogni sito si valuta come **una cella di 100 × 100 m** attorno al punto, con gli stessi vincoli e metriche delle celle delle regioni, e compare in una tabella separata dalla classifica delle regioni. IM-2 (punto previsto, LROC [F14]) è un candidato; IM-1 (80,13°S) è fuori dal settore a 84°S e il catalogo lo rifiuterebbe.

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

Note:

- Il layer `PSR_SP` di Moon Trek contiene solo le **164 ombre permanenti più grandi di 10 km²** [F9]: per celle da 100 m non basta, perché le ombre piccole nei fondi dei crateri mancano. Per questo si usa la mappa raster `lpsr_*` [F7].
- Per ogni file scaricato si scrive un **manifest** con URL, versione, data, dimensione e SHA-256, come previsto da `data/README.md`.

---

## 4. Fase 4: criteri

### 4.1 Cosa vuol dire "visibile"

Le fonti usano definizioni diverse: va scelta una sola e scritta (decisioni D4 e D5).

| | README [F13] | Mazarico et al. 2011 / PGDA [F7] |
|---|---|---|
| **Sole** | Visibile se **metà del disco** è sopra l'orizzonte | Si calcola la **frazione di disco visibile** (il Sole non è un punto) |
| **Terra** | Visibile se il **centro** è sopra l'orizzonte | Visibile se **qualsiasi parte del disco** non è nascosta. La pagina avverte che è "leggermente ottimistico" per i collegamenti radio |

**Proposta:** calcolare sempre la frazione di disco visibile, per Sole e Terra. Le due definizioni diventano soglie sulla stessa grandezza: "metà disco" è frazione ≥ 0,5, "centro" coincide quasi con frazione ≥ 0,5, "qualsiasi parte" è frazione > 0. Il codice resta uno e la scelta resta configurabile.

Contesto: al polo sud Sole e Terra salgono solo **2–7° sopra l'orizzonte**, e la Terra segue un ciclo di **due settimane visibile e due no** [F1, slide 19]. Per questo l'orizzonte reale e la dimensione dei dischi contano.

### 4.2 Vincoli: passa o non passa

Una **cella** (vedi 4.4) è "buona" se rispetta tutti i vincoli:

| # | Vincolo | Valore | Fonte |
|---|---|---|---|
| V1 | Dentro il settore | Entro 6° dal polo sud | [F1, slide 21] |
| V2 | Pendenza su 100 m | **< 10°** (opzione più prudente: < 8°, D3) | < 10°: [F1, slide 21 e 23]. 8°: tolleranza del lander umano "almeno 8 gradi", dal requisito HLS-S-R-0071 [F2, slide 4] |
| V3 | Sole visibile all'atterraggio | Secondo la definizione scelta in 4.1 | Illuminazione della superficie [F1, slide 21 e 26]; potenza solare, obiettivo della challenge [F12] |
| V4 | Terra visibile all'atterraggio | Secondo la definizione scelta in 4.1 | Comunicazione diretta con la Terra, "nessun relay disponibile" [F1, slide 21 e 25] |
| V5 | Sole visibile per tutta la permanenza | Durata di default **6,5 giorni** | "Superficie illuminata per tutta la durata della permanenza" [F1, slide 26]. 6,5 giorni è la durata prevista di Artemis III; tutte le 13 regioni hanno siti con luce continua per 6,5 giorni [F3] |

V5 è il vincolo più severo. Se per una data nessuna regione lo rispetta, il programma lo dice: è una risposta utile ("questa data non va bene"). Se lo vogliamo come metrica invece che come vincolo, è la decisione D6.

**Criteri NASA che restano fuori, e perché:**

- pendenza per le attività degli astronauti, < 20° su 2 km [F1, slide 24]: riguarda solo missioni con equipaggio;
- illuminazione durante l'avvicinamento [F1, slide 27]: dipende dalla traiettoria di ogni opportunità di lancio, dato che non abbiamo;
- vicinanza a un'ombra permanente, obiettivo scientifico di Artemis III [F3]: si può mostrare come informazione (distanza dalla `lpsr` più vicina), ma non entra nel punteggio.

### 4.3 Metriche: cosa si misura

Per ogni cella, nella finestra da T a T + durata, a passo di **1 ora**, lo stesso passo usato da Mazarico et al. per le mappe di illuminazione [F7]:

| # | Metrica | Chi la chiede |
|---|---|---|
| M1 | % di tempo con il Sole visibile | Challenge: "durata della luce" [F12]; README: "% di sole" [F13] |
| M2 | % di tempo con la Terra visibile | Challenge: "finestre di visibilità della Terra" [F12]; README: "% di Terra" [F13] |
| M3 | % di tempo con Sole e Terra insieme | Combinazione dei due obiettivi della challenge: potenza e comunicazione [F12] |
| M4 | Ore al prossimo tramonto del Sole e della Terra | Challenge: "tempo rimanente a tramonto del Sole / della Terra" [F12] |
| M5 | Notte più lunga nella finestra | README [F13] |
| M6 | Elevazione del Sole sopra l'orizzonte locale all'atterraggio | Challenge: "elevazione solare in evidenza" [F12] |
| M7 | Elevazione della Terra sopra l'orizzonte locale all'atterraggio | Margine sul vincolo V4 |
| M8 | Indice di potenza | Citato nel README [F13] ma **non definito**: ⚠️ va definito dal team (D10) |

### 4.4 Dalla cella alla regione

- **Dimensione della cella: 100 m.** Coincide con la base su cui la NASA misura la pendenza di atterraggio [F1, slide 21] e con la precisione di atterraggio richiesta, "entro 100 m dal bersaglio", con un'area di riferimento di 100 × 100 m [F1, slide 21 e 28].
- **Area buona:** somma delle celle buone, in km².
- **Zona continua più grande:** la più grande macchia di celle buone attaccate tra loro. Il minimo sensato è almeno una cella da 100 × 100 m, cioè l'area di precisione di atterraggio [F1, slide 28]. Se si contano anche le celle in diagonale è una **scelta del team**.
- **Qualità della zona:** mediana e valore migliore di M1–M7 tra le celle della zona più grande.
- **Tolleranza ai ritardi:** si ripete il calcolo a T ± 1, 2, 3 giorni. Le date che slittano spesso sono il contesto esplicito della challenge [F12]; i giorni esatti (1, 2, 3) sono una **scelta del team**.

Celle da 100 m sono tante: circa **500 mila** per le 13 regioni, contando i quadrati che le contengono. Il confronto con le effemeridi è leggero. **La parte pesante è il calcolo delle horizon mask**, che va misurato (⚠️). Se è troppo lento, la mask si calcola su una griglia più larga (200–500 m) e la pendenza resta a 100 m (decisione D8).

### 4.5 Limiti da dichiarare

- I DEM non vedono massi e piccoli crateri sotto la loro risoluzione (5–20 m) [F6].
- Nessuna valutazione termica, di traiettoria o di relay.
- "Migliore" vuol dire migliore per luce, comunicazione e pendenza secondo le fonti citate, non sicura al 100%.

---

## 5. Fase 5: algoritmo di valutazione

### 5.1 Calcolo preliminare (una volta, offline)

Per ogni regione:

1. celle da 100 m dentro il poligono;
2. pendenza su 100 m per ogni cella, dal DEM più fine disponibile [F6];
3. appartenenza a un'ombra permanente, da `lpsr_*` [F7];
4. horizon mask di 360 valori per ogni cella, con il metodo del README: DEM lontano a 240 m, DEM vicino a 5–20 m, curvatura, osservatore a 2 m [F13];
5. salvataggio in file NumPy in `data/regions/<id>/` (per esempio `cells.npz` e `horizon.npy`, leggibile a pezzi senza caricarlo tutto). A 360 valori interi per cella sono circa 0,7 KB per cella, ~350 MB per tutte le regioni a 100 m.

Effemeridi: tabella Horizons globale a passo orario per gli anni che vogliamo coprire, salvata in `data/cache/`. Due anni sono ~17.500 righe, circa 1 MB [F13].

### 5.2 Per ogni richiesta (data T, durata D, soglie)

1. Righe di effemeridi tra T e T + D.
2. Per ogni cella e ogni ora: azimut ed elevazione di Sole e Terra nel sistema locale, a partire dai punti sub-solare e sub-terrestre, con la parallasse della Terra calcolata da `delta` [F5] (metodo del README [F13]).
3. Confronto con la horizon mask, interpolata sull'azimut: frazione dei dischi di Sole e Terra visibile.
4. Vincoli V1–V5 e metriche M1–M7 per ogni cella.
5. Per ogni regione: celle buone, zona continua più grande (`scipy.ndimage.label`), area, qualità, tolleranza ai ritardi.
6. **Regioni scartate:** quelle senza una zona continua di almeno 100 × 100 m. Il motivo mostrato è il vincolo che ha eliminato più celle, per esempio "Terra non visibile nell'87% della regione all'atterraggio".
7. **Ordinamento delle altre: Scelta del team (D9).** Nessuna fonte dice come pesare luce, comunicazione e spazio. Proposta, **senza pesi numerici**:
    1. area della zona continua più grande, perché misura il margine per errori di atterraggio e di pendenza;
    2. a parità, M2 (% di Terra) mediana nella zona: con V5 il Sole è già garantito, quindi resta da distinguere la comunicazione;
    3. a parità, ore al prossimo tramonto della Terra (M4).

    Tutte le metriche restano visibili, così l'utente può riordinare per qualsiasi colonna.

### 5.3 Risultato per regione

```text
regione: Malapert Massif
stato: valutata | scartata (motivo)
area_buona_km2, zona_continua_km2
qualità: mediana e massimo di M1–M7 nella zona
serie oraria: % di regione con Sole, con Terra, buona
tolleranza: area della zona a T−3 … T+3 giorni
posizione in classifica
```

### 5.4 Fatto quando

- Su de Gerlache Rim 2 e Malapert Massif, per una data, il calcolo produce la classifica in pochi secondi.
- I test coprono: conversione delle coordinate, az/el contro Horizons, horizon mask su terreno sintetico (già fatta nel prototipo [F13]), zona continua su griglie note.

---

## 6. Fase 6: validazione con dati indipendenti

| Controllo | Riferimento | Cosa deve risultare |
|---|---|---|
| Effemeridi | Horizons topocentrico (`CENTER='coord@301'`) [F5] | Az/el uguali per 3 celle per regione; il prototipo ha già mostrato uno scarto < 0,001° [F13] |
| Ombre permanenti | `lpsr_*` [F7] | Nessuna cella in ombra permanente vede mai il Sole |
| Illuminazione media | `avgvisib_*`, Sole e Terra [F7] | Su ~50 celle, la nostra media oraria su 18,6 anni è vicina alla mappa NASA; si riportano le differenze |
| Illuminazione osservata | `WAC_POLE_ILL_PCT_SOUTH_100M` [F8] | Sulle celle di de Gerlache Rim 2 a sud di 88°S, nel periodo febbraio 2010 – febbraio 2011, la nostra % di luce è coerente con quella delle immagini |
| Affermazione NASA | "Tutte le 13 regioni contengono siti con luce continua per 6,5 giorni" [F3] | Nell'arco di un anno, ogni regione ha almeno una finestra in cui una zona rispetta V5 |
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
- **framework:** `backend/API_CONTRACT.md` prevede **Flask**, il backend attuale usa **FastAPI**. Il contratto HTTP si può rispettare con entrambi;
- **`GET /api/sites`:** nel contratto restituisce un `SiteCatalog` in camelCase, con `coordinateStatus` e siti anche equatoriali (Apollo). Il nostro restituisce GeoJSON dei siti di `sites.toml`, limitati al settore polare. Il frontend oggi non lo legge, ma i due formati vanno unificati;
- **regioni:** `/api/regions` e la classifica delle regioni non sono nel contratto. Vanno aggiunte come estensione concordata.

Bozza degli endpoint per le regioni (estensione del contratto):

| Endpoint | Restituisce |
|---|---|
| `GET /api/health` | Stato del servizio |
| `GET /api/regions` | **Già fatto.** GeoJSON delle regioni in latitudine e longitudine, con nome, liste di appartenenza (2022, 2024), area, DEM; `?active=true` per le sole attive |
| `GET /api/ranking?t=…&duration_h=156&slope_max=10` | Classifica delle regioni con metriche e motivi |
| `GET /api/regions/{id}/evaluation?t=…` | Dettaglio: zona, serie oraria, tolleranza ai ritardi |
| `GET /api/regions/{id}/cells?t=…` | Stato delle celle per colorare la regione. Formato da decidere con la UI (D12) |
| `GET /api/sites` | **Già fatto.** Siti di atterraggio in GeoJSON con la loro cella di 100 m; in seguito anche la loro valutazione |

`duration_h=156` corrisponde a 6,5 giorni.

Da decidere insieme alla UI:

- **formato delle celle**: GeoJSON (semplice ma pesante con migliaia di celle), griglia compatta più georeferenziazione, oppure immagine PNG da sovrapporre in Cesium;
- **cache dei risultati** in memoria (ed eventualmente in file JSON), per data arrotondata e parametri;
- **schemi Pydantic** per le risposte: oggi `/regions` e `/sites` restituiscono GeoJSON generico, quindi lo schema OpenAPI non descrive ancora i campi;
- **strumenti dell'agente AI** del README [F13] (`list_sites`, `compare_sites`, …): l'agente sta nel backend Python e chiama direttamente le stesse funzioni delle API. Gli strumenti sono pensati per siti e vanno adattati alle regioni;
- ⚠️ ellissoide lunare in CesiumJS (`Cesium.Ellipsoid.MOON`), da verificare nella versione installata.

---

## 8. Decisioni da prendere

| # | Decisione | Opzioni | Proposta | Base |
|---|---|---|---|---|
| D1 | Confine del settore | 80°S / 84°S | 84°S, già impostato in `regions.toml` (`lat_limit`), modificabile | Requisito NASA dei 6° [F1] |
| D2 | Regioni attive | Quali delle 13 con contorno | Per ora de Gerlache Rim 2 e Malapert Massif (`active` in `regions.toml`) | Poligoni solo per il 2022 [F3, F4] |
| D3 | Pendenza massima su 100 m | 10° / 8° | 10°, con 8° come opzione | [F1], [F2] |
| D4 | Terra visibile | Centro / qualsiasi parte del disco | Frazione di disco, soglia configurabile | README [F13] / PGDA [F7] |
| D5 | Sole visibile | Metà disco / frazione | Frazione di disco, soglia 0,5 di default | README [F13] / Mazarico [F7] |
| D6 | Luce per tutta la permanenza | Vincolo / metrica | Vincolo | [F1, slide 26] |
| D7 | Durata di default | 6,5 giorni / altro | 6,5 giorni, modificabile | Artemis III [F3] |
| D8 | Griglia delle horizon mask | 100 m / più larga | Decidere dopo aver misurato i tempi | Pendenza e precisione a 100 m [F1] |
| D9 | Ordinamento delle regioni | Senza pesi (5.2) / punteggio pesato | Senza pesi | Nessuna fonte per i pesi: Scelta del team |
| D10 | Indice di potenza | Definizione da scrivere | Da proporre con una fonte | README [F13] |
| D11 | Prefiltro con le mappe medie NASA | Sì / no | Facoltativo, per risparmiare calcolo | La NASA scarta le aree con Terra visibile < 25% e Sole < 5% [F1, slide 25–26] |
| D12 | Formato delle celle per il frontend | GeoJSON / griglia / PNG | Con la UI | — |

Le decisioni D1, D2 e D7 cambiano `docs/siti-e-regioni.md`: una volta prese, va aggiornato.

---

## 9. Ordine di lavoro

1. Fase 1: Docker funzionante con `/health`.
2. Decisioni D1–D7.
3. Fase 2: poligoni delle regioni convertiti e salvati. **Fatto.** Restano da scegliere i siti di atterraggio.
4. Fase 3: download con manifest, prima per le 2 regioni di sviluppo.
5. Portare il prototipo del README in `backend/app/services/` (effemeridi e horizon mask), con i suoi test.
6. Fase 5 sulle 2 regioni, misurando i tempi, poi decisione D8.
7. Fase 6: validazione.
8. Estensione a tutte le regioni scelte in D2.
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
- **[F15]** Immagine Docker `mambaorg/micromamba`: https://hub.docker.com/r/mambaorg/micromamba (tag verificati il 14/11/2026).
