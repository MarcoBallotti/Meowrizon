# Moonrizon — contratto API per il backend FastAPI

Data di ricognizione: **14 novembre 2026**. Versione del contratto: **1.0 proposta**.

**Precedenza della specifica scientifica, 15/11/2026.** Questo documento conserva il
contratto del client esistente e le estensioni proposte allora. Per il nuovo engine
prevale [docs/criteri-algoritmo.md](../docs/criteri-algoritmo.md): fasce descrittive
[0°,5°), [5°,10°), [10°,15°), ≥15°, nessun filtro automatico a 10°, aree cumulative
e confronto per metriche senza classifica globale. Visibilità dei dischi, eclissi,
buio completo, margine sul terreno e limiti di copertura seguono quella specifica.
In particolare `body-center` e i default temporali riportati sotto documentano il
client precedente e non sostituiscono il modello del disco approvato. Gli schemi HTTP
saranno riallineati dopo l'algoritmo; non si modifica il frontend in questa fase e
nessuno schema o esempio qui presente dimostra che l'engine sia già implementato.

Questo documento è la specifica di consegna allo sviluppatore backend: inventaria i dati dimostrativi presenti nel simulatore, assegna ciascun dato a un endpoint e definisce parametri, risposte JSON, validazioni e responsabilità di elaborazione.

Decisione aggiornata del team: **Python con FastAPI e archiviazione su file, senza database**. Il backend è autonomo nella cartella `backend/`, con configurazioni e dati locali. Dispone di endpoint `/api/data` per acquisizione, preparazione JSON/Parquet, job e filtro dei dati salvati; gli endpoint scientifici di questo documento restano una proposta da implementare. I raster restano GeoTIFF. Il contratto HTTP è indipendente dai formati interni di salvataggio.

## 1. Compatibilità e perimetro

Ci sono due livelli di consegna:

- **C — contratto già consumato dal client:** cinque endpoint, con campi e nomi compatibili con `frontend/src/api/types.ts`, `httpProvider.ts` e `state/runner.ts`. Consentono di sostituire `DemoProvider` nei calcoli di terreno e scenario.
- **V — completamento delle visualizzazioni:** nuovi endpoint e campi aggiuntivi per sostituire anche cataloghi locali, luce del globo, dimensioni e fase dei corpi e configurazione delle mappe. Queste estensioni richiedono un successivo collegamento nel frontend: oggi il client non le legge.

I campi marcati **V** sono obbligatori nella consegna completa descritta qui; possono essere introdotti dopo il livello C. I campi aggiuntivi non cambiano il significato dei campi C. Nessuna API di questo documento è attualmente implementata nel backend.

Il backend è il punto unico di accesso del simulatore alle fonti: risolve le richieste parametrizzate, consulta i portali o i dati scaricati, normalizza formati e riferimenti, calcola i prodotti mancanti e applica cache. **Il solo proxy delle risposte dei portali non basta:** orizzonte del terreno e intervalli di visibilità richiedono calcolo scientifico lato backend.

Tutti gli esempi JSON seguenti sono **fixture contrattuali costruite per spiegare il formato**, non misure NASA o risultati scientifici verificati. I valori di disponibilità negli esempi non descrivono lo stato del server attuale.

### File esaminati

Percorsi relativi alla radice del repository:

- `frontend/src/api/{types,index,demoProvider,httpProvider,jobs}.ts`;
- `frontend/src/state/{runner,store}.ts`, `frontend/src/App.tsx`;
- `frontend/src/domain/{sites,coverage,sampling,approxEphemeris,sky,story}.ts`;
- `frontend/src/features/{MoonGlobe,HorizonScene,Timeline,Report,TopBar}.tsx`;
- `frontend/src/screens/{MoonScreen,SiteScreen,KitScreen}.tsx`, `frontend/src/ui/{Bodies,phase}.ts*`;
- `docs/api-contract.md`, `docs/guida-dati.md`, `frontend/.env.example`.

Questo documento estende la proposta sintetica in `docs/api-contract.md`. In caso di differenze, il livello C mantiene il formato effettivamente letto dal client; le differenze V sono esplicitamente indicate.

## 2. Inventario completo dei dati e delle visualizzazioni

| Dato attuale | Origine attuale | Destinazione API | Utilizzo |
|---|---|---|---|
| Profilo angolare `H(az)` | `syntheticHorizon()` in `demoProvider.ts` | C: `TerrainAnalysis.profile.azimuthDeg/elevationDeg` | Cresta lontana della vista dal suolo, occultamento e margine angolare |
| Quota del punto sul DEM | Numero pseudocasuale in `syntheticHorizon()` | C: `profile.observer.surfaceHeightM` | Posizione fisica dell'osservatore, effemeridi topocentriche |
| Effetto dell'altezza dell'osservatore | Abbassamento illustrativo dell'orizzonte | C: parametro `observerHeightM`, risultato `heightAboveSurfaceM` | Ricalcolo reale dell'orizzonte e della posizione del pannello/antenna |
| Raggio lunare e riferimento geometrico | Costante `1737.4 km` | C: `referenceRadiusKm`; V: `visualization-config.moon` e metadati di frame | Coerenza fra terreno, coordinate e globo |
| Catalogo DEM, fasce e pixel | `DEM_CATALOG` statico; prodotti tutti non disponibili | C: `GET /coverage`; V: footprint e versione | Pannello fonti, copertura e scelta dei raster |
| Qualità del terreno | `noDataFraction: 0`, pixel copiato dal catalogo | C: `profile.dem`, `warnings` | Copertura reale, risoluzione usata e limiti |
| Azimut/elevazione di Sole e Terra | Modello analitico approssimato | C: `ScenarioEvaluation.sun/earth` | Posizione dei corpi, traiettorie, HUD e tabella Now |
| Orizzonte lungo la direzione dei corpi | Interpolazione dell'orizzonte sintetico | C: `sun/earth.horizonDeg` | Margine sopra/sotto i rilievi |
| Visibilità di Sole e Terra | Confronto con l'orizzonte sintetico | C: `centerVisible`, `intervals.sun/earth` | Stato visibile/nascosto, messaggi e timeline |
| Finestre simultanee | Intersezione di intervalli demo | C: `intervals.both` | Barra Sun + Earth, finestre congiunte e CSV |
| Fonte, kernel, correzioni delle effemeridi | Stringhe demo e kernel vuoti | C: `ephemeris`, `approximations`; V: frame e tolleranza eventi | Pannello Data and caveats e tracciabilità |
| Attese, avanzamento e ID dei lavori | Coda simulata con timer | C: envelope `JobState` | Indicatore di avanzamento e polling |
| Siti predefiniti e marker | Sei record in `domain/sites.ts`, coordinate dichiarate approssimate | V: `GET /sites` | Selezione sito, marker, nome del report e confronto B |
| Luce/terminatore sul globo | `subSolarPoint()` in `approxEphemeris.ts` | V: `GET /globe-state` | Toggle Sunlight on this day; oggi resta approssimato anche scegliendo il provider API |
| Punto sub-terrestre e librazione | `subEarthPoint()` nello stesso modulo | C: tracce topocentriche; V: `globe-state.earth` | Sostituzione del modello condiviso con geometria reale |
| Dimensione apparente del Sole | Costante `SUN_DIAMETER_DEG` | V: `sun.angularDiameterDeg[]` | Disco solare e descrizioni in Sun-widths |
| Dimensione apparente della Terra | Costante a distanza media | V: `earth.angularDiameterDeg[]` | Disco terrestre e descrizioni in Earth-widths |
| Fase della Terra | Formula approssimata dalla separazione Sole/Terra | V: `earth.illuminatedFraction[]` | Terminatore della Terra e valore LIT |
| Orientamento della fase terrestre | Direzione del Sole proiettata in pixel | V: `earth.brightLimbAngleDeg[]` | Orientamento del lato illuminato nel cielo locale |
| Immagini WAC e hillshade LOLA | Già reali, richieste direttamente a Moon Trek | V: `GET /visualization-config` e `GET /map-tiles/...` | Texture del globo; centralizzazione delle richieste nel backend |
| Linee DEM a −80°, −87°, ±60° | `COVERAGE_LINES` statico | C/V: prodotti e footprint di `/coverage` | Overlay coerente con il catalogo, senza confondere fascia dichiarata e dati preparati |
| Percentuali, durata massima di luce/buio/silenzio, countdown | Derivati localmente dagli intervalli demo | Nessun nuovo endpoint: derivati dagli intervalli reali | Report Student/Teacher/Planner e confronto A/B |
| Creste vicine, stelle, bagliori, dettagli grafici della Terra | `makeRelief()`, `makeStars()` e SVG | Nessuna API scientifica prevista | Decorazione: non sono rilievi DEM o cataloghi stellari |
| Esempi di barre e numeri del Brand kit | `demoSun/demoEarth/demoBoth` e testi statici in `KitScreen.tsx` | Nessuna API: fixture di presentazione | Pagina del design system, separata dai risultati del simulatore |

La cresta lontana deve provenire dal DEM. Le creste intermedie/vicine restano un'illustrazione, anche dopo il collegamento dei dati reali. Un panorama fotorealistico, una mesh 3D scientifica del suolo o un cielo stellare astronomico richiederebbero ulteriori contratti e non sono consumati dall'app attuale. Il globo Cesium attuale è una sfera con immagini e hillshade, non un modello altimetrico 3D.

## 3. Convenzioni comuni

### 3.1 Trasporto e nomi

- Base URL: **`/api`**. Percorsi senza slash finale; risposte dirette, senza wrapper `data` o `success`.
- JSON UTF-8, nomi **camelCase**, richieste JSON con `Content-Type: application/json`.
- Tutti i campi nelle tabelle sono obbligatori per il rispettivo livello, salvo indicazione `opzionale`. Un campo nullable resta obbligatorio, ma può contenere `null`. I campi V sono richiesti nella consegna completa C+V.
- Campi opzionali assenti: ometterli. `null` è ammesso solo dove indicato. Le liste vuote sono `[]`.
- Numeri finiti: mai `NaN`, `Infinity`, stringhe numeriche, valori NumPy non serializzati o unità dentro al valore.
- Gli ID sono stringhe opache stabili; il client non deve interpretarne il formato.
- `origin` vale **`engine`** per prodotti elaborati dal backend con fonti reali, **`demo`** per dati sintetici. `engine` indica la provenienza, non una certificazione di precisione. Un errore delle fonti non deve attivare un fallback sintetico presentato come `engine`.
- Il contratto C non richiede autenticazione. Il frontend attuale non invia token o header applicativi; eventuale autenticazione futura richiede un'integrazione concordata.

### 3.2 Coordinate, frame e unità

| Grandezza | Convenzione |
|---|---|
| `latDeg` | Latitudine planetocentrica lunare, gradi, da −90 a +90; Nord positivo |
| `lonEastDeg` | Longitudine Est positiva, normalizzata in `[−180, 180)` |
| Azimut | Gradi in `[0, 360)`, Nord 0, Est 90, Sud 180, Ovest 270 |
| Elevazione | Gradi in `[−90, 90]`, rispetto al piano orizzontale locale definito dalla direzione radiale dell'osservatore |
| Quote/altezza/pixel | Metri; distanze e raggi con suffisso `Km` in chilometri |
| Quote DEM | Riferite al datum del prodotto, convertite al riferimento comune prima di combinarle |
| Frame comune | Mean Earth/Polar Axis, identificato con `coordinateFrame: "MOON_ME"`; `frameVersion` identifica la realizzazione effettiva |
| Sfera di riferimento attuale | Raggio 1 737 400 m, coerente con il rendering attuale |
| Tempi richiesti | ISO 8601 UTC con `Z`, per esempio `2026-12-01T00:00:00.000Z` |
| Tempi nelle serie/intervalli | Interi Unix epoch **in millisecondi**, non secondi |
| Percentuali/frazioni | Numeri in `[0, 1]`, non `[0, 100]` |

Il backend normalizza anche longitudini equivalenti ricevute fuori intervallo, per esempio `270` diventa `−90`, prima di costruire le chiavi di cache. Non arrotondare le coordinate alla quantizzazione del mock: ai poli poche decine di metri possono cambiare l'orizzonte.

La latitudine geodetica, quella planetocentrica e le coordinate native del raster vanno trasformate esplicitamente quando non coincidono. Conservare nel catalogo il riferimento originale; non combinare alla cieca `MOON_ME`, `MOON_PA`, realizzazioni DE421/DE440 o proiezioni terrestri WGS84. Una nuova realizzazione richiede trasformazioni coerenti di raster, sito e vettori.

**Poli esatti:** il contratto accetta coordinate geografiche fino a ±90°, ma l'analisi topocentrica C restituisce `422 azimuth_undefined_at_pole` a ±90°, perché la UI usa un Nord/azimut locale senza parametro di meridiano di riferimento. Non spostare silenziosamente il punto. I poli possono comunque essere disegnati sul globo.

### 3.3 Intervallo temporale e campionamento

Definiti `startMs`, `stopMs` e `stepMs = stepMinutes × 60000`:

1. `stopMs > startMs`; periodo analizzato **`[startMs, stopMs)`**.
2. La serie contiene sempre `startMs` e `stopMs`, anche se l'ultimo passo è più corto. Con range divisibile: `N = (stopMs − startMs) / stepMs + 1`; altrimenti `N = ceil((stopMs − startMs) / stepMs) + 1`.
3. `timesMs` è strettamente crescente, contiene almeno due elementi e non ha duplicati.
4. Ogni array di una traccia ha esattamente `N` elementi: nessun campione va eliminato unilateralmente da Sole o Terra.
5. Le effemeridi coprono l'intero periodo. Se non è disponibile, errore esplicito; nessuna estrapolazione sintetica.
6. L'ultimo campione è un riferimento di bordo per l'interpolazione. Gli intervalli restano semiaperti: il client deve gestire il cursore a `stopMs` come fine periodo, senza inventare un tramonto o una scomparsa a quel punto.

Limiti di servizio proposti per la prima implementazione, da applicare in FastAPI:

| Parametro | Limite |
|---|---|
| Durata scenario | Maggiore di zero e al massimo 90 giorni |
| `stepMinutes` | Intero da 1 a 1440; la UI attuale usa 10, 30, 60, 120 |
| Campioni `N` | Al massimo 20 000, limite incluso |
| `observerHeightM` | Numero da 0 a 500 |
| `azimuthStepDeg` | Numero da 0.1 a 90; `360 / passo` deve essere intero, tolleranza numerica `1e-9` |
| `maxDistanceKm` | Numero da 1 a 300 |

Questi sono vincoli del servizio proposto, non limiti dichiarati dai portali. Il default applicativo attuale è: 30 giorni, passo 30 minuti, osservatore 2 m, azimut 0.5°, raggio terreno 150 km. Nessun campo richiesto dal client deve essere sostituito da un default silenzioso.

## 4. Elenco degli endpoint da sviluppare

| Livello | Metodo | Endpoint | Input | Output |
|---|---|---|---|---|
| C | GET | `/api/coverage` | Nessuno | `CoverageCatalog` |
| C | POST | `/api/terrain-analyses` | `TerrainAnalysisRequest` | `JobState<TerrainAnalysis>` |
| C | GET | `/api/terrain-analyses/{jobId}` | ID del job terreno | `JobState<TerrainAnalysis>` |
| C | POST | `/api/scenario-evaluations` | `ScenarioEvaluationRequest` | `JobState<ScenarioEvaluation>` |
| C | GET | `/api/scenario-evaluations/{jobId}` | ID del job scenario | `JobState<ScenarioEvaluation>` |
| V | GET | `/api/sites` | Nessuno | `SiteCatalog` |
| V | GET | `/api/globe-state` | Query `utc` | `GlobeState` |
| V | GET | `/api/visualization-config` | Nessuno | `VisualizationConfig` |
| V | GET | `/api/map-tiles/{layerId}/{tileMatrix}/{tileRow}/{tileCol}.{format}` | Layer e coordinate della tessera | Immagine binaria; JSON solo in caso di errore |

Non sono necessari endpoint separati per i tre pubblici, per il confronto A/B, per ogni movimento del cursore o per l'export CSV. Tutte queste funzioni possono usare gli stessi risultati scientifici.

## 5. Lavori asincroni: schema condiviso `JobState<T>`

Entrambi i POST scientifici producono un job. Il risultato può essere immediato se già disponibile in cache.

| Campo | Tipo | Regola |
|---|---|---|
| `id` | string | ID del **job**, da passare al GET di polling dello stesso tipo |
| `status` | string enum | `queued`, `running`, `completed`, `failed` |
| `progress` | number, opzionale | Da 0 a 1; omettere se non stimabile, non fingere un avanzamento temporizzato |
| `message` | string, opzionale | Messaggio di stato leggibile; non è una fase enum |
| `result` | oggetto `T` | Obbligatorio solo quando `status = completed`; assente negli altri stati |
| `error` | oggetto | Obbligatorio solo quando `status = failed`; assente negli altri stati |
| `error.code` | string | Codice stabile per l'errore del lavoro |
| `error.message` | string | Spiegazione leggibile |

Risposta all'accodamento, HTTP **202**:

```json
{
  "id": "job-terrain-001",
  "status": "queued",
  "progress": 0,
  "message": "Analisi del terreno accodata"
}
```

Risposta al polling, HTTP **200**:

```json
{
  "id": "job-terrain-001",
  "status": "running",
  "progress": 0.45,
  "message": "Calcolo del profilo dell'orizzonte"
}
```

Un job noto che fallisce continua a rispondere HTTP **200**, con stato terminale `failed`:

```json
{
  "id": "job-terrain-001",
  "status": "failed",
  "error": {
    "code": "terrain_coverage_incomplete",
    "message": "Il DEM non copre tutte le direzioni entro il raggio richiesto"
  }
}
```

Un POST con risultato già pronto risponde HTTP **200** con `status: "completed"`, `progress: 1` e `result` completo. I GET dei job rispondono 200 anche se ancora accodati o in esecuzione. Errori della richiesta o dell'accesso al job usano invece gli status e l'envelope della sezione 13.

**Distinzione degli ID:** `JobState.id` non è `TerrainAnalysis.id` e non è `ScenarioEvaluation.id`. Il polling usa il primo; `ScenarioEvaluationRequest.terrainAnalysisId` usa l'ID del risultato terreno. Non usare i nomi `ta-*` o il valore di un contatore del mock per dedurli.

Il client esistente effettua polling dopo 250 ms e aumenta fino a 3 s. Non richiede WebSocket, SSE o callback. L'annullamento di `fetch` tramite `AbortController` interrompe l'attesa nel browser: **non equivale alla cancellazione del job sul server**. I job possono terminare ed essere riutilizzati in cache.

## 6. `GET /api/coverage` — catalogo DEM e disponibilità

**Parametri:** nessuno. **Risposta:** HTTP 200, `CoverageCatalog`.

### Schema

| Campo | Tipo | Significato |
|---|---|---|
| `origin` | `engine` o `demo` | Provenienza del catalogo |
| `products` | `DemProduct[]` | Tutti i prodotti pubblicati dal backend, anche non ancora preparati |
| `products[].id` | string | Identificativo stabile, referenziato in `profile.dem.productIds` |
| `products[].title` | string | Nome leggibile del dataset |
| `products[].pixelSizeM` | number > 0 | Passo dichiarato dei pixel; non precisione verticale né dettaglio realmente misurato |
| `products[].latMinDeg` | number | Estremo Sud della fascia nominale, incluso |
| `products[].latMaxDeg` | number | Estremo Nord della fascia nominale, incluso |
| `products[].source` | string | Ente/progetto di origine |
| `products[].url` | string URL HTTPS | Pagina del prodotto e delle relative limitazioni |
| `products[].notes` | string | Avvisi su interpolazione, copertura, disponibilità e qualità |
| `products[].available` | boolean | `true` solo se il prodotto è preparato e utilizzabile dal motore sul server; non equivale a "esiste un link" |
| `products[].version` | string, V | Versione/revisione immutabile registrata dal backend per il prodotto |
| `products[].coordinateFrame` | string, V | Frame originale o normalizzato, dichiarato senza ambiguità |
| `products[].frameVersion` | string, V | Realizzazione del frame del prodotto |
| `products[].referenceRadiusKm` | number > 0, V | Raggio usato dal datum verticale normalizzato |
| `products[].footprint` | GeoJSON Geometry o null, V | `Polygon` o `MultiPolygon`, coordinate `[lonEastDeg, latDeg]`, footprint nominale effettivo; `null` se non noto |

Esempio completo C+V con un prodotto. Il footprint è esplicitamente non noto; il catalogo non certifica la copertura locale:

```json
{
  "origin": "engine",
  "products": [
    {
      "id": "LDEM_80S_20MPP_ADJ",
      "title": "LOLA south pole 20 m/pixel",
      "pixelSizeM": 20,
      "latMinDeg": -90,
      "latMaxDeg": -80,
      "source": "NASA GSFC / LOLA",
      "url": "https://pgda.gsfc.nasa.gov/products/90",
      "notes": "Disponibilità e NoData verificati nuovamente per ogni area di analisi.",
      "available": true,
      "version": "catalog-product-revision-001",
      "coordinateFrame": "MOON_ME",
      "frameVersion": "DE421",
      "referenceRadiusKm": 1737.4,
      "footprint": null
    }
  ]
}
```

I campi V sono ignorati dal client C attuale. Un footprint con struttura GeoJSON e coordinate lunari non deve essere interpretato come WGS84 terrestre: il sistema di coordinate è quello lunare del catalogo; trattare correttamente antimeridiano e inclusione del polo. `null` significa geometria non nota, non copertura globale.

### Catalogo da riconciliare con i mock attuali

| ID corrente | Risoluzione nominale nel mock | Fascia nel mock | Fonte da verificare/preparare |
|---|---|---|---|
| `lola-gdr-global` | 237 m | −90° / +90° | LOLA GDR globale, variante effettivamente selezionata |
| `sldem2015` | 59 m | −60° / +60° | SLDEM2015, variante e risoluzione effettivamente scaricate |
| `LDEM_80S_20MPP_ADJ` | 20 m | −90° / −80° | PGDA prodotto 90 |
| `lola-sp-5mpp` | 5 m | −90° / −87° | PGDA prodotto 81 |

Conservare gli ID esistenti quando rappresentano lo stesso prodotto; se cambia il significato, creare un ID nuovo. Le dimensioni del mock non costituiscono un manifest scientifico: restituire variante, passo e versione realmente utilizzati.

Le fasce nominali servono a mostrare il catalogo; non certificano la copertura completa del cerchio di analisi attorno a un sito. La selezione scientifica avviene nel backend usando disponibilità, footprint, NoData e raggio richiesto. Non riprodurre il fallback di `bestProductFor()`, che può scegliere il primo prodotto anche fuori copertura. Un catalogo valido ma vuoto è `products: []`; l'indisponibilità temporanea del servizio è invece un errore HTTP.

## 7. Terreno: `POST /api/terrain-analyses`

Calcola una horizon mask indipendente dal periodo temporale. **Input:** JSON `TerrainAnalysisRequest`. **Output:** `JobState<TerrainAnalysis>`.

### Parametri richiesti

| Campo | Tipo | Validazione |
|---|---|---|
| `site` | oggetto | Coordinate del punto scelto, anche fuori dal catalogo dei siti |
| `site.latDeg` | number | Regole coordinate e poli della sezione 3 |
| `site.lonEastDeg` | number | Longitudine Est; normalizzata dal backend |
| `observerHeightM` | number | Altezza sopra il terreno DEM, da 0 a 500 |
| `config` | oggetto | Parametri dell'analisi |
| `config.azimuthStepDeg` | number | Passo uniforme che divide 360°, limiti della sezione 3 |
| `config.maxDistanceKm` | number | Distanza massima dal sito cercata per l'orizzonte |

Richiesta rappresentativa dell'app attuale:

```json
{
  "site": { "latDeg": -89.67, "lonEastDeg": 129.8 },
  "observerHeightM": 2,
  "config": { "azimuthStepDeg": 0.5, "maxDistanceKm": 150 }
}
```

Non passare date, nome del sito, pubblico della UI o scenario A/B: non influenzano questo prodotto. Un sito scelto liberamente sul globo deve funzionare con lo stesso contratto.

### Schema completo del risultato `TerrainAnalysis`

| Campo | Tipo | Significato/invariante |
|---|---|---|
| `id` | string | ID persistente del risultato terreno |
| `origin` | `engine` o `demo` | Provenienza |
| `preview` | boolean | Per il primo rilascio deve essere `false`: il client termina il polling al primo completed |
| `profile` | oggetto | Profilo e metadati |
| `profile.azimuthDeg` | number[] | Campioni uniformi `i × azimuthStepDeg`, da 0 incluso a 360 escluso |
| `profile.elevationDeg` | number[] | `H(az)` in gradi; stessa lunghezza dell'array azimut, sono ammessi valori negativi |
| `profile.observer.site` | oggetto | Coordinate effettive normalizzate `latDeg`, `lonEastDeg` |
| `profile.observer.surfaceHeightM` | number o null | Quota della superficie al sito nel datum normalizzato; il motore reale deve conoscerla per il calcolo topocentrico |
| `profile.observer.heightAboveSurfaceM` | number | Valore effettivo dell'altezza richiesta |
| `profile.observer.referenceRadiusKm` | number > 0 | Raggio della sfera di riferimento |
| `profile.dem.productIds` | string[] | Uno o più prodotti realmente usati, presenti nel catalogo |
| `profile.dem.effectivePixelSizeM` | number > 0 | Passo del terreno effettivamente usato, dichiarato in modo conservativo se si combinano risoluzioni; non errore metrico stimato |
| `profile.dem.noDataFraction` | number `[0,1]` | Frazione dei campioni raster richiesti non validi prima di eventuale riempimento; documentare il metodo nei warning |
| `profile.params.azimuthStepDeg` | number | Passo effettivo uguale a quello accettato |
| `profile.params.maxDistanceKm` | number | Raggio effettivo uguale a quello accettato |
| `profile.algorithmVersion` | string | Versione riproducibile del metodo e delle sue opzioni scientifiche |
| `profile.warnings` | string[] | Limitazioni, interpolazioni, risoluzioni miste, estensione finita del terreno |
| `profile.coordinateFrame` | string, V | `MOON_ME` nel riferimento comune |
| `profile.frameVersion` | string, V | Realizzazione coerente con sito, DEM ed effemeridi |
| `profile.verticalDatum` | string, V | Identificativo esplicito del datum normalizzato, per esempio `sphere-1737400m` |

Esempio completo C+V con passo **90° solo per mantenere quattro campioni leggibili**. Risponde a una richiesta identica alla precedente ma con `config.azimuthStepDeg: 90`; non è un risultato della richiesta a passo 0.5°.

```json
{
  "id": "job-terrain-001",
  "status": "completed",
  "progress": 1,
  "result": {
    "id": "terrain-001",
    "origin": "engine",
    "preview": false,
    "profile": {
      "azimuthDeg": [0, 90, 180, 270],
      "elevationDeg": [1, 1, 1, 1],
      "observer": {
        "site": { "latDeg": -89.67, "lonEastDeg": 129.8 },
        "surfaceHeightM": 1200,
        "heightAboveSurfaceM": 2,
        "referenceRadiusKm": 1737.4
      },
      "dem": {
        "productIds": ["LDEM_80S_20MPP_ADJ"],
        "effectivePixelSizeM": 20,
        "noDataFraction": 0
      },
      "params": { "azimuthStepDeg": 90, "maxDistanceKm": 150 },
      "algorithmVersion": "terrain-horizon-1.0.0",
      "warnings": ["Ricerca dell'orizzonte limitata a 150 km."],
      "coordinateFrame": "MOON_ME",
      "frameVersion": "DE421",
      "verticalDatum": "sphere-1737400m"
    }
  }
}
```

Con passo 0.5° devono esserci **720** elementi in ciascun array del profilo. La UI interpola assumendo campionamento uniforme e origine 0°: un array semplicemente crescente ma irregolare non è compatibile.

### Elaborazione richiesta al backend

1. Selezionare DEM realmente disponibili per tutto il dominio richiesto; leggere quote numeriche, proiezione, NoData, scale e offset del prodotto.
2. Ricavare la quota del sito e collocare l'osservatore a `surfaceHeightM + observerHeightM` rispetto alla sfera comune.
3. Trasformare i punti del DEM in geometria lunare coerente e cercare la massima elevazione apparente per ogni azimut fino a `maxDistanceKm`, includendo curvatura lunare e dislivelli reali.
4. Restituire esattamente il passo/raggio accettati. Un raggio ridotto o una risoluzione diversa non possono essere nascosti nei metadati.
5. Trattare i vuoti del raster con una politica esplicita e versionata. Primo rilascio: fallire se mancano dati necessari; eventuale riempimento scientifico deve essere dichiarato e non deve generare certezze su zone non osservate.

Non usare hillshade, texture WMTS o screenshot come quote. Non dichiarare un orizzonte piatto come analisi DEM quando i dati mancano. `surfaceHeightM: null` resta ammesso dal tipo storico, ma non è sufficiente per completare una nuova analisi reale che richiede la quota: in quel caso fallire.

### `GET /api/terrain-analyses/{jobId}`

Solo parametro di percorso `jobId`, stringa opaca restituita dal POST. Nessuna query e nessun body. Restituisce lo stesso `JobState<TerrainAnalysis>` aggiornato. Un risultato terminale è immutabile. Job sconosciuto: 404; job scaduto di cui è conservata la tombstone: 410. Non passare `terrain-001` al posto di `job-terrain-001`.

## 8. Scenario: `POST /api/scenario-evaluations`

Usa un risultato terreno già completato per calcolare Sole, Terra e finestre di visibilità. **Output:** `JobState<ScenarioEvaluation>`.

### Parametri richiesti

| Campo | Tipo | Validazione |
|---|---|---|
| `terrainAnalysisId` | string | ID del **risultato** terreno valido e completo |
| `startUtc` | string UTC ISO 8601 | Inizio richiesto |
| `stopUtc` | string UTC ISO 8601 | Fine esclusa del periodo; inclusa come campione di bordo |
| `stepMinutes` | integer | Passo di campionamento; limiti e numero massimo di campioni della sezione 3 |

Esempio compatto di un'ora:

```json
{
  "terrainAnalysisId": "terrain-001",
  "startUtc": "2026-12-01T00:00:00.000Z",
  "stopUtc": "2026-12-01T01:00:00.000Z",
  "stepMinutes": 30
}
```

Per la UI predefinita il periodo è 30 giorni: il frontend calcola `stopUtc = startUtc + durationDays × 86400000`. Non si inviano anche coordinate o altezza: sono già fissate dall'analisi terreno referenziata, evitando incoerenze.

### Schema `ScenarioEvaluation`

| Campo | Tipo | Significato |
|---|---|---|
| `id` | string | ID del risultato scenario |
| `origin` | `engine` o `demo` | Provenienza |
| `terrainAnalysisId` | string | ID del terreno realmente usato |
| `timeScale` | string costante | `UTC` |
| `timesMs` | integer[] | Asse temporale comune secondo la sezione 3 |
| `sun` | `BodyTrack` | Traccia del centro del Sole |
| `earth` | `BodyTrack` | Traccia del centro della Terra |
| `intervals.sun` | `TimeInterval[]` | Finestre di visibilità del centro del Sole |
| `intervals.earth` | `TimeInterval[]` | Finestre di visibilità del centro della Terra |
| `intervals.both` | `TimeInterval[]` | Intersezione esatta delle due liste precedenti |
| `visibilityModel` | string costante | `body-center`, coerente con la UI attuale |
| `ephemeris` | `EphemerisMetadata` | Fonte e modello effettivamente usati |
| `approximations` | string[] | Limiti e approssimazioni applicati realmente |
| `eventToleranceMs` | integer > 0, V | Tolleranza temporale dichiarata del raffinamento eventi; obiettivo iniziale massimo 1000 ms |

### Schema `BodyTrack`

| Campo | Tipo | Corpi | Significato |
|---|---|---|---|
| `azimuthDeg` | number[] | Entrambi, C | Azimut topocentrico a ogni tempo |
| `elevationDeg` | number[] | Entrambi, C | Elevazione del centro rispetto al piano locale |
| `horizonDeg` | number[] | Entrambi, C | `H(azimuthDeg[i])` dal profilo del terreno |
| `centerVisible` | boolean[] | Entrambi, C | Classificazione del centro coerente con gli intervalli |
| `distanceKm` | number[] > 0 | Entrambi, V | Distanza osservatore-centro del corpo, non distanza dal centro della Luna |
| `angularDiameterDeg` | number[] > 0 | Entrambi, V | Diametro apparente del disco intero, non raggio |
| `illuminatedFraction` | number[] `[0,1]` | Solo Terra, V | Frazione illuminata del disco terrestre vista dal sito |
| `brightLimbAngleDeg` | (number o null)[] | Solo Terra, V | Angolo del lato illuminato nel piano tangente locale, come definito sotto |

Tutti gli array presenti hanno lunghezza `timesMs.length`, compresi quelli V. Nessun numero deve essere sostituito con 0 se la fonte restituisce `n.a.`: cambiare sorgente/calcolare correttamente oppure dichiarare l'errore. `null` è ammesso solo negli elementi di `brightLimbAngleDeg` per orientamento non definito.

**Orientamento del lato illuminato (V):** nel piano tangente alla direzione della Terra, asse destro = incremento dell'azimut, asse alto = incremento dell'elevazione. L'angolo è misurato dall'asse destro verso il basso, in senso orario, in `[0,360)`: 0° significa lato illuminato verso azimut crescente, 90° verso elevazione decrescente. Il backend usa la geometria Terra-Sole-osservatore. Restituire `null` se l'orientamento non è definito, per esempio a fase esattamente piena/nuova o al singolare dello zenit. Il frontend adatta la proiezione grafica e lo stiramento del panorama; non interpreta l'angolo come un azimut lunare.

### Schema `TimeInterval`

| Campo | Tipo | Significato |
|---|---|---|
| `startMs` | integer | Inizio incluso dell'intervallo, Unix ms |
| `endMs` | integer | Fine esclusa dell'intervallo, Unix ms; `endMs > startMs` |
| `startClipped` | boolean, V | Inizio tagliato dal range richiesto, non un sorgere osservato |
| `endClipped` | boolean, V | Fine tagliata dal range richiesto, non un tramonto osservato |

Gli intervalli sono ordinati per inizio, disgiunti, limitati al range richiesto; unire intervalli adiacenti della stessa condizione. Lista vuota significa mai visibile nel periodo. Una lista con un intervallo uguale al periodo significa sempre visibile **nel periodo**, non in assoluto.

Per il livello V, `startClipped`/`endClipped` distinguono il bordo della richiesta da una transizione fisica. Per `both`, un bordo è clipped se dipende dal taglio del periodo, non da una transizione di uno dei due corpi. Un contatto tangenziale senza finestra di durata positiva non deve creare un intervallo nullo.

### Schema `EphemerisMetadata`

| Campo | Tipo | Significato |
|---|---|---|
| `source` | string | Per esempio `NASA/JPL Horizons` oppure motore locale SPICE |
| `version` | string | Versione effettiva del modello/adapter e dell'effemeride, non un numero fisso inventato |
| `kernels` | string[] | Kernel realmente caricati; `[]` se non si usa SPICE localmente |
| `corrections` | string | Convenzione effettiva: tempo luce, aberrazione, geometrico/apparente, assenza di rifrazione ecc. |
| `coordinateFrame` | string, V | Frame comune della geometria lunare |
| `frameVersion` | string, V | Realizzazione compatibile con quella del terreno |

### Esempio finale completo C+V

Esempio coerente con il profilo didattico piatto a 1° della sezione 7, tre campioni e transizioni lineari a 00:15 e 00:45:

```json
{
  "id": "job-scenario-001",
  "status": "completed",
  "progress": 1,
  "result": {
    "id": "scenario-001",
    "origin": "engine",
    "terrainAnalysisId": "terrain-001",
    "timeScale": "UTC",
    "timesMs": [1796083200000, 1796085000000, 1796086800000],
    "sun": {
      "azimuthDeg": [90, 90.5, 91],
      "elevationDeg": [2, 0, 2],
      "horizonDeg": [1, 1, 1],
      "centerVisible": [true, false, true],
      "distanceKm": [149600000, 149600010, 149600020],
      "angularDiameterDeg": [0.533, 0.533, 0.533]
    },
    "earth": {
      "azimuthDeg": [180, 180.01, 180.02],
      "elevationDeg": [3, 3.1, 3.2],
      "horizonDeg": [1, 1, 1],
      "centerVisible": [true, true, true],
      "distanceKm": [384400, 384401, 384402],
      "angularDiameterDeg": [1.9, 1.9, 1.9],
      "illuminatedFraction": [0.48, 0.481, 0.482],
      "brightLimbAngleDeg": [25, 25.1, 25.2]
    },
    "intervals": {
      "sun": [
        { "startMs": 1796083200000, "endMs": 1796084100000, "startClipped": true, "endClipped": false },
        { "startMs": 1796085900000, "endMs": 1796086800000, "startClipped": false, "endClipped": true }
      ],
      "earth": [
        { "startMs": 1796083200000, "endMs": 1796086800000, "startClipped": true, "endClipped": true }
      ],
      "both": [
        { "startMs": 1796083200000, "endMs": 1796084100000, "startClipped": true, "endClipped": false },
        { "startMs": 1796085900000, "endMs": 1796086800000, "startClipped": false, "endClipped": true }
      ]
    },
    "visibilityModel": "body-center",
    "ephemeris": {
      "source": "NASA/JPL Horizons",
      "version": "adapter-1.0.0 / ephemeris-version-from-source",
      "kernels": [],
      "corrections": "Coordinate topocentriche apparenti airless; modello effettivo registrato dalla sorgente.",
      "coordinateFrame": "MOON_ME",
      "frameVersion": "DE421"
    },
    "eventToleranceMs": 1000,
    "approximations": [
      "Visibilità riferita al centro del disco.",
      "Non vengono calcolati potenza elettrica, link budget o occultazioni da altri corpi."
    ]
  }
}
```

La prima finestra solare è già aperta all'inizio della richiesta (`startClipped: true`), la seconda è ancora aperta alla fine (`endClipped: true`); quella terrestre attraversa entrambi i bordi. Il client C ignora i campi aggiuntivi V. Le dimensioni, distanze, fase e orientamento di questa fixture illustrano i tipi dei campi, non una geometria astronomica validata.

### Regole scientifiche e di consistenza

- Per i due corpi si valuta il **centro** del disco: lontano dalle transizioni è visibile quando `elevationDeg > H(azimuthDeg)`. In prossimità di un attraversamento, gli intervalli raffinati e la loro convenzione semiaperta sono la fonte dello stato; rendere i flag dei campioni interni coerenti con tale convenzione entro la tolleranza dichiarata. Il campione terminale può risultare ancora visibile pur essendo fuori dall'intervallo semiaperto analizzato.
- Un disco parzialmente emergente non cambia automaticamente `centerVisible`: il rendering può disegnarlo mentre il centro è ancora nascosto. Non passare a "lembo superiore visibile" senza versionare il contratto e aggiornare la UI.
- `horizonDeg[i]` deve corrispondere al profilo restituito per il terreno, con interpolazione circolare in azimut. Il margine è `elevationDeg[i] − horizonDeg[i]`.
- Gli eventi vanno cercati e raffinati dal backend; il passo richiesto è una densità di output, non la precisione temporale degli eventi. Non limitarsi a cercare cambi di segno tra campioni grossolani: si possono perdere finestre brevi fra due campioni entrambi nascosti. Usare una ricerca interna adeguata e dichiararne i limiti.
- `intervals.both` è l'intersezione di `sun` e `earth`, non una terza stima indipendente. Per il livello V propagare correttamente i flag di clipping.
- Le effemeridi devono usare la posizione reale dell'osservatore, inclusa la quota DEM e l'altezza. La parallasse della Terra non va eliminata con l'approssimazione dei corpi a distanza infinita usata nel mock.
- La visibilità richiesta è **rispetto al terreno**. Non equivale a energia prodotta, affidabilità del collegamento radio o irradianza dopo eventuali eclissi: questi modelli non sono previsti dagli input attuali.

### `GET /api/scenario-evaluations/{jobId}`

Solo `jobId` di percorso, nessuna query/body; stesso comportamento di polling del terreno. Il risultato deve conservare il `terrainAnalysisId` utilizzato. Una richiesta che referenzia un terreno inesistente restituisce 404; se non completo, 409; se scaduto e riconosciuto, 410. L'analisi già completata non deve cambiare mentre uno scenario la usa.

## 9. `GET /api/sites` — catalogo dei siti (V)

**Parametri:** nessuno; catalogo piccolo completo. **Risposta:** HTTP 200, `SiteCatalog`.

| Campo | Tipo | Significato |
|---|---|---|
| `origin` | `engine` o `demo` | Provenienza del catalogo |
| `sites` | `Site[]` | Siti pubblicati, incluso il punto di riferimento se utile |
| `sites[].id` | string | ID stabile, compatibile con gli ID correnti quando appropriato |
| `sites[].name` | string | Nome completo |
| `sites[].short` | string | Etichetta del marker |
| `sites[].region` | string enum | `South pole` oppure `Equatorial band`, valori attualmente letti dalla UI |
| `sites[].latDeg` | number | Coordinata normalizzata |
| `sites[].lonEastDeg` | number | Coordinata Est normalizzata |
| `sites[].coordinateStatus` | string enum | `verified`, `approximate`, `reference` |
| `sites[].source` | oggetto o null | `{ "title": string, "url": string }`; obbligatoriamente non null per `verified` |
| `sites[].notes` | string | Provenienza, significato del punto, limiti e distinzione fra cratere e sito di atterraggio |

```json
{
  "origin": "engine",
  "sites": [
    {
      "id": "sp-ref",
      "name": "Horizons reference point",
      "short": "Horizons ref.",
      "region": "South pole",
      "latDeg": -89.5,
      "lonEastDeg": 0,
      "coordinateStatus": "reference",
      "source": null,
      "notes": "Punto convenzionale di confronto, non sito di allunaggio certificato."
    }
  ]
}
```

Record locali da migrare e verificare, senza promuovere automaticamente `approximate` a `verified`:

| ID | Nome | Latitudine attuale | Longitudine Est attuale | Regione attuale |
|---|---|---|---|---|
| `shackleton` | Shackleton crater | −89.67 | 129.8 | South pole |
| `de-gerlache` | de Gerlache crater | −88.5 | −87.1 | South pole |
| `malapert` | Malapert massif | −86.0 | 2.9 | South pole |
| `sp-ref` | Horizons reference point | −89.5 | 0 | South pole |
| `apollo11` | Apollo 11 · Tranquility Base | 0.6741 | 23.473 | Equatorial band |
| `apollo15` | Apollo 15 · Hadley Rille | 26.1322 | 3.6339 | Equatorial band |

Il backend può inizialmente pubblicare coordinate approssimate con relativo stato; per dati verificati servono fonti ufficiali e frame coerente. Un sito fuori catalogo continua a essere analizzabile inviando le sue coordinate al POST terreno. Nessun endpoint di creazione o salvataggio siti è richiesto dall'app attuale.

## 10. `GET /api/globe-state` — geometria per la luce del globo (V)

Sostituisce `subSolarPoint()`/`subEarthPoint()` nella visualizzazione globale. Il globo attuale usa l'istante iniziale scelto; non serve scaricare una serie temporale a ogni frame.

**Query obbligatoria:** `utc`, stringa UTC ISO 8601. Esempio:

```text
GET /api/globe-state?utc=2026-12-01T00%3A00%3A00.000Z
```

**Risposta:** HTTP 200, `GlobeState`.

| Campo | Tipo | Significato |
|---|---|---|
| `origin` | `engine` o `demo` | Provenienza |
| `utc` | string UTC | Istante richiesto normalizzato |
| `timeMs` | integer | Lo stesso istante in Unix ms |
| `coordinateFrame` | string | `MOON_ME` nel riferimento concordato |
| `frameVersion` | string | Realizzazione effettiva |
| `sun`, `earth` | oggetti | Direzioni riferite al **centro della Luna**, non al sito |
| `<body>.subPoint` | oggetto | `{ latDeg, lonEastDeg }` della direzione radiale del corpo nel frame comune |
| `<body>.directionMoonFixed` | number[3] | Vettore unitario dal centro della Luna verso il corpo: X a lat 0/lon 0, Y a lat 0/lon 90 Est, Z al polo Nord |
| `<body>.distanceKm` | number > 0 | Distanza dal centro della Luna al centro del corpo |
| `ephemeris` | `EphemerisMetadata` | Stessa struttura della sezione 8, compresi i campi V |

```json
{
  "origin": "engine",
  "utc": "2026-12-01T00:00:00.000Z",
  "timeMs": 1796083200000,
  "coordinateFrame": "MOON_ME",
  "frameVersion": "DE421",
  "sun": {
    "subPoint": { "latDeg": 0, "lonEastDeg": 0 },
    "directionMoonFixed": [1, 0, 0],
    "distanceKm": 149600000
  },
  "earth": {
    "subPoint": { "latDeg": 0, "lonEastDeg": 90 },
    "directionMoonFixed": [0, 1, 0],
    "distanceKm": 384400
  },
  "ephemeris": {
    "source": "NASA/JPL Horizons",
    "version": "adapter-1.0.0 / ephemeris-version-from-source",
    "kernels": [],
    "corrections": "Direzioni lunocentriche normalizzate nel frame comune; convenzione apparente registrata dalla sorgente.",
    "coordinateFrame": "MOON_ME",
    "frameVersion": "DE421"
  }
}
```

Esempio geometrico di formato: **non è la configurazione astronomica reale del 1 dicembre 2026**. Norme: vettori di modulo 1 entro `1e-9`, direzioni e subpoint coerenti; metadati di frame uguali a quelli esterni. Nel codice Cesium `DirectionalLight.direction` indica il verso dei raggi luminosi, quindi il frontend userà **l'opposto** di `sun.directionMoonFixed`.

Non ricavare la luce del globo dall'azimut topocentrico di un singolo sito. La centralizzazione delle effemeridi globali non autorizza a trascurare quota/parallasse nelle tracce topocentriche dello scenario.

## 11. Mappe: configurazione e tessere (V)

Le immagini sono già reali; questa parte elimina la dipendenza diretta del frontend dagli URL NASA hardcoded e realizza il punto unico FastAPI richiesto.

### `GET /api/visualization-config`

Nessun parametro. Risposta HTTP 200, `VisualizationConfig`:

| Campo | Tipo | Significato |
|---|---|---|
| `origin` | `engine` o `demo` | Provenienza della configurazione |
| `moon.referenceRadiusKm` | number > 0 | Raggio del rendering e del riferimento comune |
| `moon.coordinateFrame` | string | Frame concordato |
| `moon.frameVersion` | string | Realizzazione concordata |
| `moon.geometry` | string costante | `sphere`; nessuna mesh altimetrica implicita |
| `layers` | `ImageryLayer[]` | Layer pubblicati dal backend |
| `layers[].id` | string | ID da usare nella route delle tessere |
| `layers[].title` | string | Nome leggibile |
| `layers[].role` | string enum | `basemap` oppure `hillshade` |
| `layers[].upstreamLayerId` | string | Identificativo del prodotto sorgente |
| `layers[].format` | string enum | `jpg` oppure `png` |
| `layers[].tileUrlTemplate` | string | URL relativo al backend, con placeholder case-sensitive come nell'esempio |
| `layers[].minimumLevel` | integer >= 0 | Primo livello pubblicato |
| `layers[].maximumLevel` | integer >= minimumLevel | Ultimo livello pubblicato e verificato |
| `layers[].tileWidthPx`, `tileHeightPx` | integer > 0 | Dimensioni reali delle tessere |
| `layers[].tilingScheme` | oggetto | Schema geografico definito sotto, compatibile con il Cesium attuale |
| `layers[].tilingScheme.type` | string costante | `geographic` |
| `layers[].tilingScheme.levelZeroColumns` | integer costante | `2`, colonne al livello iniziale 0 |
| `layers[].tilingScheme.levelZeroRows` | integer costante | `1`, righe al livello iniziale 0 |
| `layers[].attribution` | string | Crediti da mostrare nel globo |
| `layers[].sourceUrl` | string URL HTTPS | Metadati/Capabilities della sorgente |

```json
{
  "origin": "engine",
  "moon": {
    "referenceRadiusKm": 1737.4,
    "coordinateFrame": "MOON_ME",
    "frameVersion": "DE421",
    "geometry": "sphere"
  },
  "layers": [
    {
      "id": "lro-wac",
      "title": "LRO WAC global mosaic",
      "role": "basemap",
      "upstreamLayerId": "LRO_WAC_Mosaic_Global_303ppd_v02",
      "format": "jpg",
      "tileUrlTemplate": "/api/map-tiles/lro-wac/{TileMatrix}/{TileRow}/{TileCol}.jpg",
      "minimumLevel": 0,
      "maximumLevel": 7,
      "tileWidthPx": 256,
      "tileHeightPx": 256,
      "tilingScheme": { "type": "geographic", "levelZeroColumns": 2, "levelZeroRows": 1 },
      "attribution": "LRO WAC mosaic · NASA/GSFC/Arizona State University · via NASA Moon Trek",
      "sourceUrl": "https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/WMTSCapabilities.xml"
    },
    {
      "id": "lola-hillshade",
      "title": "LOLA global hillshade",
      "role": "hillshade",
      "upstreamLayerId": "LRO_LOLA_Shade_Global_256ppd_v06",
      "format": "png",
      "tileUrlTemplate": "/api/map-tiles/lola-hillshade/{TileMatrix}/{TileRow}/{TileCol}.png",
      "minimumLevel": 0,
      "maximumLevel": 7,
      "tileWidthPx": 256,
      "tileHeightPx": 256,
      "tilingScheme": { "type": "geographic", "levelZeroColumns": 2, "levelZeroRows": 1 },
      "attribution": "LOLA hillshade · NASA/GSFC · via NASA Moon Trek",
      "sourceUrl": "https://trek.nasa.gov/tiles/Moon/EQ/LRO_LOLA_Shade_Global_256ppd_v06/1.0.0/WMTSCapabilities.xml"
    }
  ]
}
```

I layer corrispondono ai due identificativi nel frontend attuale. **Dimensioni, livelli, proiezione e disponibilità dell'esempio sono illustrativi:** il backend deve leggerli dalle Capabilities e restituire solo una configurazione verificata. Non assumere che ogni layer abbia lo stesso formato o che sia disponibile a tutti gli zoom. `tilingScheme.type` è per ora solo `geographic`; se servono layer polari stereografici, occorre estendere contratto e renderer.

### `GET /api/map-tiles/{layerId}/{tileMatrix}/{tileRow}/{tileCol}.{format}`

| Parametro di percorso | Tipo | Regola |
|---|---|---|
| `layerId` | string | Solo uno degli ID pubblicati in `/visualization-config` |
| `tileMatrix` | integer | Livello fra `minimumLevel` e `maximumLevel` |
| `tileRow` | integer | Per schema 2×1: `0 <= row < 2^level`, origine Nord |
| `tileCol` | integer | Per schema 2×1: `0 <= col < 2 × 2^level`, origine Ovest |
| `format` | enum | Il formato dichiarato dal layer: `jpg` o `png` |

Nessuna query/body. Il backend traduce il livello negli identificativi WMTS effettivi e nel relativo `TileMatrixSet`, letti dalle Capabilities.

- Successo 200: **byte immagine**, `Content-Type: image/jpeg` o `image/png`, mai base64 dentro JSON.
- Layer non noto o tile inesistente in una configurazione valida: 404 con errore JSON; parametro malformato/fuori griglia: 422.
- Errore remoto transitorio: 502/503/504, non una falsa tessera nera né un falso 404 di copertura.
- Supportare cache HTTP (`Cache-Control`, `ETag`, eventuale 304) oltre alla cache interna; conservare attribuzioni e versione della sorgente.

`tilingScheme` descrive griglia e orientamento; i riferimenti spaziali reali devono essere verificati con la sorgente. Le immagini di hillshade servono alla lettura del rilievo, non al calcolo di `surfaceHeightM` o di `H(az)`.

## 12. Metriche e dati che non richiedono nuove API

Il frontend può continuare a calcolare questi dati dai risultati C, evitando numeri duplicati non coerenti con la timeline:

| Valore mostrato | Fonte/costruzione |
|---|---|
| Az/El/H al cursore | Interpolazione di `timesMs` e delle tracce; azimut con wrap a 360° |
| Visibile/nascosto | Appartenenza agli intervalli restituiti, non confronto ricalcolato su valori interpolati |
| Margine angolare | Elevazione meno orizzonte lungo il corpo |
| Prossimo sorgere/tramonto | Prossimo bordo fisico degli intervalli; V: ignorare i bordi clipped |
| Tempo residuo di luce o attesa | Differenza fra cursore e prossimo evento reale entro il periodo |
| Percentuale di visibilità | Somma delle durate degli intervalli / durata del periodo |
| Durata massima di luce/link/entrambi | Massima lunghezza dei rispettivi intervalli |
| Notte/silenzio massimo | Massimo intervallo nel complemento della lista entro il periodo |
| Confronto A/B | Due esecuzioni degli stessi POST; lettura delle metriche per ciascuno scenario |
| CSV degli intervalli | Esportazione locale di `sun`, `earth`, `both` con date UTC e durate |
| Frasi e domande educative | Presentazione locale degli stessi dati; nessun LLM o endpoint narrativo richiesto |
| Unità "larghezze del Sole/Terra" | V: margine / diametro apparente interpolato della traccia |

### Correzioni del frontend da pianificare con l'integrazione

Questi punti non si risolvono semplicemente sviluppando i cinque endpoint C:

1. `MoonGlobe` usa sempre il Sole analitico locale: collegare `/globe-state` e gestire l'errore senza passare alla luce approssimata come se fosse reale.
2. `HorizonScene` e `story.ts` usano diametri costanti e fase approssimata: leggere le aggiunte V, mantenendo solo la proiezione nel frontend.
3. Marker, selettori e confronto B leggono `EXAMPLE_SITES`: sostituirli con `/sites`; usare ID stabili, non il nome come identità del sito.
4. Overlay DEM e selezione di prodotto devono rispettare catalogo, footprint e prodotto realmente usato. Non confondere disponibilità globale del prodotto con copertura completa del sito.
5. `spanAt()` oggi tratta `endMs = stopMs` come una transizione e `inIntervals(stopMs)` è falso. Usare i flag V e la semantica di fine periodo per evitare countdown o scomparse fittizie sul bordo.
6. La riga "Sunrises" oggi conta il numero degli intervalli (`stats.sun.count`): una finestra già aperta a inizio range non è un'alba. Contare solo inizi non clipped, senza cambiare l'API per le altre statistiche.
7. Unificare manifest e URL tessere con `/visualization-config`; il codice attuale costruisce direttamente gli URL NASA.
8. `origin: engine` non certifica link radio o potenza. I testi educativi che equiparano Terra visibile a collegamento garantito e Sole visibile a potenza disponibile vanno allineati alla sola visibilità geometrica.
9. Per una modifica futura a `azimuthStepDeg`/`maxDistanceKm`, includerli tra le dipendenze del rilancio automatico: oggi `useAutoRun()` osserva solo input sito, confronto, durata e passo temporale.

Non sono necessari endpoint per velocità di riproduzione, lente/FOV, azimut della camera, selezione Student/Teacher/Planner, icone, stelle decorative, creste vicine o campioni del Brand kit. Questi restano stato/presentazione locale e non entrano nelle cache scientifiche.

## 13. Errori HTTP e validazione FastAPI

Il client esistente estrae **`detail` come stringa** dalle risposte non-2xx. Per compatibilità usare sempre questo envelope per errori HTTP, anche quelli generati da FastAPI o dal reverse proxy applicativo:

```json
{
  "detail": "Il periodo richiesto supera il limite di 20000 campioni",
  "code": "sample_limit_exceeded",
  "fields": [
    { "field": "stepMinutes", "message": "Aumentare il passo o ridurre il periodo" }
  ],
  "retryable": false
}
```

| Campo | Tipo | Regola |
|---|---|---|
| `detail` | string | Obbligatorio, compatibile con `HttpProvider` |
| `code` | string | Obbligatorio, stabile e adatto a gestione programmatica |
| `fields` | array di `{field: string, message: string}` | Obbligatorio; `[]` se non applicabile; percorso campo con notazione puntata |
| `retryable` | boolean | Obbligatorio; possibilità di riprovare senza cambiare input |

| HTTP | Codici applicativi indicativi | Quando |
|---|---|---|
| 400 | `invalid_json` | Corpo non decodificabile come JSON |
| 404 | `job_not_found`, `terrain_not_found`, `layer_not_found`, `tile_not_found` | Risorsa inesistente |
| 409 | `terrain_not_ready` | Risultato terreno referenziato non completo |
| 410 | `job_expired`, `terrain_expired` | Risorsa scaduta nota al backend |
| 415 | `unsupported_media_type` | POST senza media type JSON supportato |
| 422 | `invalid_parameter`, `invalid_time_range`, `sample_limit_exceeded`, `azimuth_undefined_at_pole`, `unsupported_epoch` | JSON valido ma parametri non supportati |
| 429 | `rate_limited` | Limite di richieste o job; aggiungere `Retry-After` |
| 502 | `upstream_error`, `invalid_upstream_payload` | Portale remoto in errore o risposta non interpretabile |
| 503 | `data_unavailable`, `worker_unavailable` | Dataset, cache necessaria o servizio di calcolo non pronto |
| 504 | `upstream_timeout` | Timeout della fonte durante una richiesta sincrona |
| 500 | `internal_error` | Errore interno imprevisto, senza traceback pubblico |

Gli errori che emergono **dopo l'accodamento** appartengono invece a `JobState.error`, con `status: failed` e HTTP 200 sul polling. Conservare codici utili come `terrain_coverage_incomplete`, `ephemeris_unavailable`, `frame_mismatch`, `upstream_timeout`; non far restare un job bloccato per sempre in `running`.

Validare campi mancanti, tipi, numeri finiti, range e consistenza fra campi prima di accodare. Rifiutare i booleani dove è richiesto un numero: in Python `bool` è una sottoclasse di `int`. Date prive di timezone/UTC esplicito, stop precedente all'inizio, passi nulli e array incompleti non devono arrivare al motore. Convertire tipi NumPy e datetime in tipi JSON standard; niente pagine di errore HTML sugli endpoint JSON.

## 14. Fonti upstream e adattamento nel backend

I portali non espongono tutti lo stesso tipo di API. Gli URL documentati qui sono sorgenti del backend, non nuovi parametri che il frontend deve conoscere.

### 14.1 JPL Horizons — effemeridi

Riferimenti verificati: [API Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html), [manuale e quantità osservabili](https://ssd.jpl.nasa.gov/horizons/manual.html).

Richiesta upstream: `GET https://ssd.jpl.nasa.gov/api/horizons.api`. Adapter indicativo per le tracce locali:

| Parametro upstream | Traduzione dal contratto |
|---|---|
| `format` | `json` |
| `COMMAND` | `10` Sole, `399` Terra |
| `EPHEM_TYPE`, `MAKE_EPHEM`, `OBJ_DATA` | `OBSERVER`, `YES`, `NO` |
| `CENTER`, `COORD_TYPE` | `coord@301`, `GEODETIC` |
| `SITE_COORD` | Longitudine, latitudine e quota assoluta dell'osservatore **in km**, convertite al riferimento richiesto dalla sorgente |
| `START_TIME`, `STOP_TIME`, `STEP_SIZE` | UTC e passo della richiesta, con eventuali query aggiuntive per raffinare eventi |
| `QUANTITIES` | C: `4`; V: aggiungere `13,20` e, per Terra, `10` |
| `CSV_FORMAT`, `APPARENT` | `YES`, `AIRLESS` |

L'output JSON contiene una tabella testuale in `result`: verificare `error`, delimitatori `$$SOE`/`$$EOE`, intestazioni, unità e numero di righe anche con HTTP 200. Convertire diametri da arcosecondi a gradi, fase percentuale a frazione e distanze all'unità dichiarata. Non usare i flag sorgere/tramonto di Horizons per il terreno locale. Rispettare codifica URL e convenzioni della documentazione.

Per la geometria globale si possono usare quantità lunari `14,15,20` con Luna come target e osservatore geocentrico, oppure vettori calcolati localmente. L'adapter deve riconciliare frame, versi delle longitudini, significato apparente dei subpoint e correzioni con `/globe-state`; non assumere che una tabella geocentrica sia una traccia topocentrica pronta.

### 14.2 DEM LOLA / SLDEM — terreno numerico

Il backend deve leggere raster scientifici, non immagini di ombreggiatura:

- [PGDA prodotto 90](https://pgda.gsfc.nasa.gov/products/90): distribuisce DEM polari in COG GeoTIFF, compreso `LDEM_80S_20MPP_ADJ`, con quote in metri e riferimento MOON_ME/DE421.
- [PGDA prodotto 81](https://pgda.gsfc.nasa.gov/products/81): mosaico del Polo Sud a 5 m/pixel, fascia 87–90°S, GeoTIFF in coordinate polari e riferimento MOON_ME/DE421.
- [SLDEM2015](https://pgda.gsfc.nasa.gov/products/54): prodotti per la fascia ±60°; scegliere esplicitamente formato e densità della variante.

PGDA offre cataloghi e file, non un endpoint JSON che restituisce direttamente l'orizzonte. Il backend prepara manifest/versione, acquisisce file o finestre del raster quando il formato lo consente e calcola la horizon mask. Valori NoData, interpolazione, datum, dimensione effettiva del pixel e copertura vanno ricavati dal prodotto effettivo.

I servizi raster `ImageServer` citati in `docs/guida-dati.md` sono un'alternativa da qualificare durante l'implementazione; in questa ricognizione non è stato verificato il loro payload live. Non renderli una dipendenza garantita o confonderli con l'API WMTS.

### 14.3 Moon Trek WMTS — immagini del globo

Riferimento ufficiale: [NASA Open APIs — Trek WMTS](https://api.nasa.gov/), [catalogo dei servizi Trek](https://trek.nasa.gov/tiles/apidoc/).

Il backend legge le Capabilities del layer e traduce griglia, stile, matrix set e formato verso `/visualization-config` e `/map-tiles/...`. Il template upstream del codice attuale è:

```text
https://trek.nasa.gov/tiles/Moon/EQ/{upstreamLayerId}/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{format}
```

La documentazione distingue `.png` e `.jpg` e richiede di leggere gli identificativi dalle Capabilities. Le Capabilities specifiche non sono state decodificate in questa ricognizione: la pubblicazione dei metadati di ogni layer deve includere una verifica live, senza copiare dimensioni o livelli dall'esempio JSON.

### 14.4 Altre fonti e calcolo locale

- SPICE/SpiceyPy può sostituire o affiancare Horizons come implementazione interna, senza cambiare il JSON pubblico. Registrare kernel, effemeride e realizzazione dei frame effettivamente impiegati.
- I siti verificati devono essere accompagnati da un riferimento ufficiale per il punto preciso; il centro di un cratere non è automaticamente una posizione di allunaggio.
- LROC QuickMap può servire al confronto manuale dei risultati; questo contratto non dipende da API private non documentate o da scraping del portale.
- Non sono previsti endpoint per CSA, missioni, news, classifiche dei migliori siti, pendenza/sicurezza di atterraggio, power budget o agente AI: non alimentano modelli mock consumati dalle schermate attuali.

## 15. Cache, riproducibilità e responsabilità FastAPI

### Cache e job

| Prodotto | Componenti minimi della chiave |
|---|---|
| Terreno | Coordinate normalizzate precise, altezza, passo azimut, raggio, prodotti/versioni/datum/frame, versione algoritmo |
| Effemeridi locali interne | Posizione 3D effettiva, range UTC, modello/correzioni, frame e sorgente/versione |
| Scenario finale | ID/versione immutabile del terreno, range UTC, passo output, modello di visibilità, effemeride/correzioni, algoritmo/tolleranza eventi |
| Stato globo | Istante UTC, sorgente/modello/correzioni e frame |
| Tessere | Prodotto/versione, matrix set, livello, riga, colonna, formato |

Deduplicare richieste contemporanee identiche: riusare job o risultato, senza moltiplicare download e ray tracing. Un cambiamento di DEM, kernel, correzioni, datum o algoritmo deve invalidare la chiave appropriata. I risultati scientifici già emessi restano immutabili, anche se cambia il catalogo.

Conservare separatamente ID dei job e ID dei risultati. Per il primo rilascio mantenere job terminali e risultati referenziabili almeno 24 ore dopo l'ultimo uso e non eliminare terreni usati da job attivi. Dopo scadenza restituire 410 se nota, altrimenti 404; il client deve poter ricreare l'analisi. Questo criterio di retention è una scelta di servizio proposta, non una proprietà dei portali.

Timeout e retry delle fonti devono essere limitati, con backoff; non lanciare chiamate upstream per ogni tick del cursore. Registrare origine, richiesta normalizzata, versione dei dati e tempi, evitando di esporre dettagli interni nei messaggi pubblici.

### Implementazione FastAPI

- Esporre route JSON tramite `APIRouter(prefix="/api")`; la separazione fra moduli HTTP, adapter delle fonti e calcolo rimane interna al backend.
- Spostare download lunghi e calcolo terreno in worker separati dal processo HTTP; salvare lo stato dei job in file JSON persistenti con aggiornamenti atomici e lock; usare risultati immutabili referenziati dai manifest. Un dizionario Python in memoria non basta con più processi o riavvii.
- I GET dei job devono leggere lo stato, non avviare nuovamente il calcolo.
- Validare/serializzare esplicitamente il contratto, compresi errori 404/405/500 per le route API. Serializzare in camelCase anche se il codice Python usa snake_case.
- Supportare `OPTIONS`, `GET`, `POST` e gli header `Accept`/`Content-Type` se frontend e FastAPI hanno origini diverse; in sviluppo è preferibile il proxy Vite già predisposto. Il client aggiunge Content-Type anche ai GET, quindi richieste cross-origin possono richiedere preflight.
- Con una sola origine pubblica, esporre frontend e `/api` dietro lo stesso ingresso. Il proxy delle tessere evita che il browser debba gestire dettagli dei servizi remoti.
- Avvio del server: `python -m uvicorn app:app --port 8000` dalla cartella `backend/`. Sono disponibili `/health` e le route `/api/data` documentate nel README locale; le route scientifiche descritte qui non sono ancora implementate.

## 16. Sequenza di integrazione frontend/backend

1. Caricare `/coverage`; nel livello V caricare anche `/sites` e `/visualization-config`.
2. Per la data scelta, nel livello V richiedere `/globe-state?utc=...` e aggiornare la luce del globo.
3. Al cambio di sito, altezza o parametri terreno: POST `/terrain-analyses`, poi GET di polling con `JobState.id` fino al completamento.
4. Prendere **`result.id`** del terreno e inviarlo come `terrainAnalysisId` al POST `/scenario-evaluations`, insieme a UTC iniziale/finale e passo.
5. Effettuare il polling dello scenario e usare `result` per vista dal suolo, traiettorie, timeline, report e CSV.
6. Per B eseguire lo stesso flusso, senza inventare un endpoint compare. Il backend può riusare prodotti/cache quando gli input coincidono.
7. Riproduzione e cursore leggono i risultati già caricati. Cambio della sola data/durata/passo può riusare il terreno; il runner attuale reinvia comunque il POST terreno, quindi la deduplicazione è necessaria.

Configurazione frontend esistente per il livello C:

```dotenv
VITE_DATA_SOURCE=api
VITE_API_BASE_URL=/api
```

In sviluppo Vite inoltra `/api` a `http://localhost:8000`, modificabile con `MEOWRIZON_API_ORIGIN`. Il processo FastAPI deve ascoltare all'indirizzo configurato. Queste variabili **non** collegano automaticamente le aggiunte V: per esse servono nuove chiamate e tipi nel frontend.

## 17. Criteri di consegna per lo sviluppatore backend

### Livello C: sostituzione dei risultati demo

- [ ] Tutti e cinque gli endpoint C implementati con campi e semantica descritti.
- [ ] Catalogo con disponibilità e prodotti reali; nessun `available: true` dedotto dalla sola esistenza del prodotto remoto.
- [ ] Analisi di coordinate libere, quota reale, altezza e geometria del terreno, inclusa la curvatura lunare.
- [ ] Profilo uniforme, circolare, con origine 0° e lunghezza coerente col passo.
- [ ] Tracce Sole/Terra allineate con range, unità e quota dell'osservatore corretti.
- [ ] Intervalli raffinati, intersezione congiunta e corretta gestione di sempre/mai visibile.
- [ ] Identità separate di job e risultati, cache e polling, errori terminali e scadenze coerenti.
- [ ] Provenienza e approssimazioni veritiere, nessun fallback scientifico sintetico silenzioso.
- [ ] Controlli scientifici mirati su frame, trasformazioni, az/el e orizzonte con fonti/casi di riferimento; le fixture di questo documento verificano solo il formato.

### Livello V: eliminazione delle altre approssimazioni nei dati visualizzati

- [ ] Catalogo siti con stato delle coordinate e fonti.
- [ ] Endpoint stato del globo con direzioni, subpoint e metadati coerenti.
- [ ] Diametri apparenti variabili, distanze, fase e orientamento terrestre nelle tracce.
- [ ] Frame/datum/versione del terreno e delle effemeridi dichiarati.
- [ ] Tolleranza eventi e clipping degli intervalli disponibili al frontend.
- [ ] Manifest delle immagini e proxy binario tessere, con configurazione letta dalla sorgente.
- [ ] Integrazione frontend dei campi V e correzioni dei bordi temporali/contatore albe elencate nella sezione 12.

La consegna C rende reali i risultati numerici del simulatore. La consegna completa C+V sostituisce anche i modelli locali che oggi influenzano le visualizzazioni; le sole decorazioni e la pagina Brand kit restano volutamente grafiche.
