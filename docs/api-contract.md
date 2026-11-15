# Meowrizon — contratto API e mappa dei flussi frontend

**Versione 2.0, 15 novembre 2026.** Frontend verificato: `48c2cdfb90686313c41e14b0fec357460dff2c63`. Base main integrata in backend: `c81fccaae7578e9187e398cefca6b681e27be7d1`. Dopo il merge i file UI e il mock delle regioni coincidono con il branch frontend indicato.

Questo documento sostituisce il contratto preliminare v1. Mappa le schermate, i dati dimostrativi, le chiamate e i calcoli locali; definisce ciò che lo sviluppatore backend deve fornire e gli adattamenti necessari nel frontend.

**Schemi macchina, campi obbligatori, enum, nullabilità, richieste e JSON finali completi:** [api-contract.openapi.json](api-contract.openapi.json), OpenAPI 3.1. Contiene 16 operazioni; `x-implementation-status` distingue le esistenti da quelle da implementare. Gli esempi sono fixture di formato, **non misure NASA né previsioni astronomiche**. Gli invarianti fra campi, non esprimibili tutti con JSON Schema, sono definiti qui.

La copertura dei flussi e la coerenza dei DTO sono verificabili staticamente sul codice. La precisione scientifica dei futuri algoritmi richiede una successiva validazione del motore: la validità del JSON non certifica un risultato fisico.

## 1. Decisioni del repository da rispettare

Riferimenti: [stato-decisioni.md](stato-decisioni.md), [criteri-algoritmo.md](criteri-algoritmo.md), [siti-e-regioni.md](siti-e-regioni.md). Le decisioni aggiornate del 15/11 precedono le semplificazioni della UI mock.

| Tema | UI attuale | Contratto definitivo per questa consegna |
|---|---|---|
| Framework e archiviazione | Client HTTP indipendente dal framework | App esistente **FastAPI**, file locali; non ripristinare Flask o introdurre database |
| Effemeridi | Meeus ridotto in `approxEphemeris.ts` | **JPL Horizons**; nessun requisito SPICE/SpiceyPy o kernel locali |
| Ranking | 14 record statici e score pesato 0–100 | Regioni con contorno, celle interne da 100 m, ordine senza pesi; niente score inventato |
| Oggetto analizzato | Centri di regioni, siti e punti dimostrativi mescolati | Distinguere regione, sito e coordinate libere; un centro non rappresenta tutta una regione |
| Cataloghi | Sei EXAMPLE_SITES e regioni del mock | 13 regioni con contorno, 16 siti; inizialmente due regioni attive |
| Visibilità | Centro del disco sopra H(az) | Compatibilità body-center; nuova UI/criteri con frazione visibile e soglia parametrica, default 0.5 |
| Durata | 7/14/30/60/90 giorni | Regola i grafici; non limita i criteri al prossimo tramonto/Earthset/notte |
| Confronto temporale | Testi “vs last month” | Periodo immediatamente precedente di uguale durata, non mese di calendario |
| Eclissi | Due modelli locali e diametri medi | Contatti topocentrici, calendario lungo e oscuramento separato dal terreno |
| Orbite e luce | Calcolate localmente anche con provider API | Serie/direzioni dal backend; nessuna chiamata per frame |

Politica regionale: osservatore a **2 m**, maschere standard con **360 azimut**, sorgente temporale **oraria**, pendenza su base **100 m**, cella idonea con Sole e Terra visibili e pendenza **<10°**. Il client chiede oggi 0.5° e passi 10–120 minuti: distinguere passo sorgente, output e accuratezza. Non trasferire nel backend `WEIGHTS={sun:0.4,both:0.3,earth:0.15,night:0.15}` o il tetto `354 h` del mock.

## 2. Mappa completa dei flussi

| ID | Trigger / componente | Origine attuale | Dati attesi e flusso reale |
|---|---|---|---|
| F01 | Avvio, App | loadCoverage + mock regioni | Cataloghi regioni/siti, DEM e configurazione; errori distinti da cataloghi vuoti |
| F02 | Home, tile, All places, ricerca | Sei siti + mock, deduplicati per nome | Cataloghi reali; identità `{kind,id}`, nomi e coordinate; ricerca locale |
| F03 | DateDial, giorni/ore/minuti | UTC senza limiti di copertura | T preciso anche a minuti non orari; copertura dichiarata, debounce e cancellazione |
| F04 | Explore, Rank by, Area | rank() su JSON statico | Ranking parametrizzato da T, periodo di contesto, baseline e ordinamento server |
| F05 | Click regione/marker, Open horizon | Centro geografico trattato come sito | Regione aggregata e punto rappresentativo dichiarato; centro solo cartografico |
| F06 | Coordinate manuali / click sul globo | Pick sulla sfera, 4 decimali | Terreno alle coordinate effettive, quota DEM e altezza; stesso contratto dei punti noti |
| F07 | runScenario, fase terrain | Orizzonte e quota procedurali | Job terreno, profilo, osservatore, qualità, prodotti e avanzamento |
| F08 | runScenario, fase ephemeris | Sole/Terra analitici | Tracce allineate, intervalli, visibilità, eclissi e provenienza |
| F09 | ScenarioRun.previous | Seconda valutazione non bloccante | Stesso terreno/modello, range `[T−D,T)`; errore baseline non distrugge il corrente |
| F10 | CompareCard / runComparison | Fino a tre centri dal ranking mock | Fino a tre rappresentativi reali, stessi giorni/altezza di A, corrente e precedente |
| F11 | HorizonScene, Eye/Wide/360, Paths, HUD | Profilo demo, diametri medi, fase locale | H(az), tracce, diametri, fase, orientamento e oscuramento; proiezione locale |
| F12 | NowPanel e racconti Student/Teacher | bodyAt, spanAt, story | Az/El/H, margine e prossimo evento, stato dagli intervalli; testi locali |
| F13 | MonthPanel, PeriodPanel, Delta | intervalStats corrente/precedente | Statistiche dagli stessi intervalli, baseline esplicita, ore/punti percentuali |
| F14 | Planner A/B | Due scenari con inizi potenzialmente diversi | Stessi endpoint; mantenere range separati, non assumere stesso UTC |
| F15 | Timeline, play, scrub, velocità | Intervalli; eclissi ricalcolate nel browser | Intervalli sun/earth/both/eclipse; nessuna richiesta per tick |
| F16 | LightCalendarCard | Overlap in finestre da 24 h | Stessi intervalli; dichiarare ancoraggio dei bin, niente endpoint calendar |
| F17 | DayHourCard | Overlap giorno × ora | Stessi intervalli; non confondere visibilità separate con simultaneità |
| F18 | WindowsCard, minimo 24/72/168 h | Filtro locale di both | Lista completa di intervalli raffinati; clipping e ordine deterministici |
| F19 | EventsCard, click, Events CSV | Bordi eclissi locali; filtro 60 secondi | Eventi server con tipo/tempo/ID eclissi; niente eventi artificiali ai bordi |
| F20 | NextEclipseCard, EclipseStrip, tabella | Ricerca lunocentrica e visibilità approssimata | Due anni, contatti, massimo/totalità, magnitudine, area occultata, terreno locale |
| F21 | Go to eclipse | Cambia inizio/cursore | Ricalcolo da due giorni prima del massimo; nessuna API di navigazione |
| F22 | OrbitView mini/open, due viste | geocentric, orbitState, percorso ±14 giorni | Serie di vettori coerenti, range allargato, unità/frame e geometria lunocentrica |
| F23 | Sunlight on this day | subSolarPoint locale | Stato globo lunocentrico all'istante iniziale; diverso dall'azimut del sito |
| F24 | WAC, hillshade, DEM coverage | Immagini NASA reali, fasce hardcoded | Manifest/tile e catalogo DEM; immagini non usate come quote |
| F25 | DataPanel, Practice data | Metadati demo, solo provider.kind | Provenienza di ogni prodotto, non solo modalità HTTP |
| F26 | Building, progress, retry, stale | Pesi UI 60/40 e coda simulata | Job/progresso reale per prodotto; layout e pesi restano presentazione |
| F27 | Intervals CSV e Brand kit | Export locale / fixture statiche | CSV dagli intervalli reali; kit, stelle, SVG e creste vicine restano decorazione |

### Tracciabilità nel codice

- [types.ts](../frontend/src/api/types.ts), [httpProvider.ts](../frontend/src/api/httpProvider.ts), [demoProvider.ts](../frontend/src/api/demoProvider.ts), [jobs.ts](../frontend/src/api/jobs.ts): cinque operazioni del client.
- [runner.ts](../frontend/src/state/runner.ts), [store.ts](../frontend/src/state/store.ts), [App.tsx](../frontend/src/App.tsx): orchestrazione, baseline, confronto e stato.
- [MoonScreen.tsx](../frontend/src/screens/MoonScreen.tsx), [DateDial.tsx](../frontend/src/ui/DateDial.tsx), [ranking.ts](../frontend/src/domain/ranking.ts), [regions.json](../frontend/public/mock/regions.json): home/explore/ranking.
- [SiteScreen.tsx](../frontend/src/screens/SiteScreen.tsx), [Report.tsx](../frontend/src/features/Report.tsx), [DeepDive.tsx](../frontend/src/features/DeepDive.tsx), [Timeline.tsx](../frontend/src/features/Timeline.tsx): tutte le schede dei tre pubblici.
- [HorizonScene.tsx](../frontend/src/features/HorizonScene.tsx), [MoonGlobe.tsx](../frontend/src/features/MoonGlobe.tsx), [OrbitView.tsx](../frontend/src/features/OrbitView.tsx): geometrie e rendering.
- [eclipses.ts](../frontend/src/domain/eclipses.ts), [approxEphemeris.ts](../frontend/src/domain/approxEphemeris.ts), [EclipseCards.tsx](../frontend/src/features/EclipseCards.tsx): modelli locali da sostituire.
- [sampling.ts](../frontend/src/domain/sampling.ts), [sky.ts](../frontend/src/domain/sky.ts), [story.ts](../frontend/src/domain/story.ts), [format.ts](../frontend/src/domain/format.ts), [coverage.ts](../frontend/src/domain/coverage.ts): derivazioni, unità e bordi.
- [KitScreen.tsx](../frontend/src/screens/KitScreen.tsx), [Building.tsx](../frontend/src/ui/Building.tsx), [Bodies.tsx](../frontend/src/ui/Bodies.tsx), [Display.tsx](../frontend/src/ui/Display.tsx), [hooks.ts](../frontend/src/hooks.ts): fixture, Delta, loading e playback.

## 3. Backend esistente: cosa riusare

App unica: [backend/app/main.py](../backend/app/main.py). Sono implementati cataloghi e acquisizione/preparazione, non il motore scenario:

| Operazioni esistenti | Scopo / differenza |
|---|---|
| GET `/api/health`, alias `/health` | Stato servizio, non disponibilità scientifica |
| GET `/api/regions?active=true|false` | Contorni preparati, FeatureCollection, proprietà snake_case |
| GET `/api/sites` | Punti GeoJSON; **non SiteCatalog** della vecchia proposta |
| GET `/api/data/sources` | Profili di acquisizione configurati |
| POST `/api/data/collect`, `/api/data/prepare` | Download/preparazione, non valutazione sito |
| GET `/api/data/jobs/{job_id}` | Job di acquisizione con error anche stringa: DTO distinto dai job scientifici |
| GET `/api/data/datasets?name=...` | Versioni dei dataset |
| GET `/api/data/datasets/{dataset_id}/raw` | Risposta originale, anche TIFF/XML/immagine |
| GET `/api/data/sources/{source_name}/data?request_sha256=...` | Risposta salvata senza ambiguità di parametri |
| GET `/api/data/datasets/{dataset_id}/samples?start_ms=...&stop_ms=...` | Campioni preparati; filtro con estremi inclusi |
| GET `/api/data/datasets/{dataset_id}/products` | title_contains, max_source_resolution, limit, unità native |
| GET `/api/data/datasets/{dataset_id}/regions` | Poligoni sorgente, non ranking |

Fonti di verifica: [api/regions.py](../backend/app/api/regions.py), [routes.py](../backend/app/routes.py), [jobs.py](../backend/app/services/jobs.py), [storage.py](../backend/app/services/storage.py).

Non collegare direttamente un DTO `/api/data` a una scheda: dataset ID, job ID, product ID, unità native e colonne del provider non sono i risultati scientifici. Il nuovo layer usa i file preparati e costruisce i DTO seguenti. Date e sito arrivano dalla richiesta utente: il frontend non deve modificare `sources.example.json`.

## 4. Elenco delle operazioni frontend

| Stato | Metodo / percorso | Input | Schema finale / envelope |
|---|---|---|---|
| Esistente | GET `/api/regions` | active boolean opzionale | RegionFeatureCollection |
| Esistente | GET `/api/sites` | Nessuno | SiteFeatureCollection |
| Chiamata già nel client, backend mancante | GET `/api/coverage` | Nessuno | CoverageCatalog |
| Chiamata già nel client, backend mancante | POST `/api/terrain-analyses` | TerrainAnalysisRequest | TerrainJob → TerrainAnalysis |
| Chiamata già nel client, backend mancante | GET `/api/terrain-analyses/{jobId}` | ID job | TerrainJob |
| Chiamata già nel client, backend mancante | POST `/api/scenario-evaluations` | ScenarioEvaluationRequest | ScenarioJob → ScenarioEvaluation |
| Chiamata già nel client, backend mancante | GET `/api/scenario-evaluations/{jobId}` | ID job | ScenarioJob |
| Nuova | POST `/api/ranking` | RankingRequest | RankingJob → RankingResult |
| Nuova | GET `/api/ranking/{jobId}` | ID job | RankingJob |
| Nuova | POST `/api/eclipse-searches` | EclipseSearchRequest | EclipseSearchJob → EclipseSearchResult |
| Nuova | GET `/api/eclipse-searches/{jobId}` | ID job | EclipseSearchJob |
| Nuova | POST `/api/system-ephemerides` | SystemEphemeridesRequest | SystemEphemeridesJob → SystemEphemerides |
| Nuova | GET `/api/system-ephemerides/{jobId}` | ID job | SystemEphemeridesJob |
| Nuova | GET `/api/globe-state` | Query utc obbligatoria, ISO UTC | GlobeState |
| Nuova | GET `/api/visualization-config` | Nessuno | VisualizationConfig |
| Nuova | GET `/api/map-tiles/{layerId}/{tileMatrix}/{tileRow}/{tileCol}.{format}` | Layer/griglia/formato | Byte JPG/PNG |

Non servono endpoint per pubblico UI, countdown/camera per frame, TOP_N, ricerca testuale locale, CSV o layout. Per massimo tre confronti bastano gli stessi POST scientifici: nessun batch pubblico obbligatorio.

## 5. Convenzioni e invarianti comuni

### Trasporto, coordinate e tempi

- API sotto `/api`, JSON camelCase, nessun wrapper data/success. I due GeoJSON esistenti **mantengono snake_case**.
- Numeri finiti, booleani JSON, nessuna stringa numerica/NaN/Infinity. Campo nullable obbligatorio diverso da campo opzionale; null solo dove previsto, liste vuote `[]`.
- Gradi: latitudine planetocentrica Nord positiva, longitudine Est normalizzata `[−180,180)`, azimut Nord 0/Est 90/Sud 180/Ovest 270. Elevazione rispetto al piano orizzontale locale, H anche negativo.
- Quote/altezza/pixel in metri; `*Km` chilometri; `*Ms` **millisecondi Unix UTC**; `*H` e hours in ore; frazioni `[0,1]`.
- Request ISO 8601 con Z. Accettare T con minuti non orari; niente spostamento al campione più vicino.
- Superficie in MOON_ME, realizzazione esplicita; riferimento attuale 1737.4 km. Orbite in ECLIPJ2000: non mescolare i due frame.
- `origin:engine` indica fonti reali elaborate, non certificazione. Niente fallback sintetico engine dopo errori upstream.
- ID opachi: jobId per polling, TerrainAnalysis.id per terrainAnalysisId, dataset ID separati.

### Range e limiti

Serie visuali sul periodo **`[startMs,stopMs)`**, stop>start; timesMs include anche stop come campione di bordo. `N=ceil((stop−start)/(stepMinutes×60000))+1`. Includere stop anche con ultimo passo più corto. Tempi strettamente crescenti, nessun duplicato; tutti gli array paralleli hanno N elementi.

| Parametro | Limite proposto |
|---|---|
| Altezza di un punto | 0–500 m, come UI |
| Altezza ranking ufficiale | 2 m, politica corrente |
| azimuthStepDeg | 0.1–90; 360/passo intero, tolleranza 1e-9 |
| maxDistanceKm | 1–300; client attuale 150 |
| Scenario visuale | >0, massimo 90 giorni |
| Vettori sistema | >0, massimo 120 giorni, per margini del percorso |
| Ricerca eclissi | >0, massimo 800 giorni |
| stepMinutes output | Intero 1–1440, N massimo 20 000 |
| displayDays ranking | Intero 1–90, default 30, solo contesto visuale |

Limiti applicativi, non dei portali. Sorgente/criteri orari; se output più fine, dichiarare ricampionamento e precisione. Raffinamento eventi indipendente dal passo: tolleranza numerica ≤1000 ms, incertezza fisica separata/nullable se ignota.

Un profilo 0.5° richiede 720 valori. Non rinominare una maschera 1° come calcolata a 0.5°: ricampionamento esplicito, warning e versione distinta, oppure calcolo alla risoluzione richiesta. Poli esatti: 422 azimuth_undefined_at_pole, non spostare di nascosto il sito.

### Intervalli e modelli

TimeInterval: `{startMs,endMs,startClipped,endClipped}`. Liste ordinate/disgiunte, intervalli adiacenti uniti, durata positiva, clipping sul range. I flag distinguono eventi reali da bordi: non creare Sunset a stop se il Sole resta visibile.

Request senza visibility → **body-center**, compatibile col client attuale. Nuova UI/criteri → `{model:"disk-fraction",minVisibleFraction:0.5}`. Il risultato dichiara visibilityModel e minVisibleFraction (null per body-center). **centerVisible** conserva il significato del centro; **visible e intervals** seguono il modello richiesto. Aggiornare l'enum TypeScript e le etichette della UI per disk-fraction.

visibleDiskFraction (parte sopra il terreno), illuminatedFraction (fase della Terra) e obscurationFraction (Sole coperto dalla Terra) sono tre grandezze diverse. Versionare il metodo di integrazione del disco rispetto a H e le sue approssimazioni.

### Job scientifici

```json
{"id":"job-001","status":"queued","progress":0,"message":"Calcolo accodato"}
```

```json
{"id":"job-001","status":"failed","error":{"code":"terrain_coverage_incomplete","message":"Copertura del terreno insufficiente"}}
```

POST 202 per queued/running, 200 per completed in cache; GET 200 anche per failed noto. Stati queued/running/completed/failed: completed richiede result, failed error `{code,message}`, negli altri stati entrambi assenti. Progress opzionale 0–1 reale; message opzionale. Polling attuale 250 ms→3 s, stesso protocollo per nuove operazioni. AbortController non cancella il lavoro server. Deduplicare input identici. Risultati terminali immutabili; preview terreno false, perché il runner termina al primo completed. Job ignoto 404; scaduto noto 410; non eliminare terreni referenziati da job attivi. Il DTO di acquisizione `/api/data/jobs` resta distinto.

## 6. Cataloghi e identità

Preservare GET `/api/regions` e `/api/sites`, FeatureCollection prodotte da [regions/build.py](../backend/app/services/regions/build.py). Schemi completi RegionFeatureCollection/SiteFeatureCollection nell'OpenAPI.

| Dato esistente | Mapping frontend |
|---|---|
| Feature.id / properties.id | Identità stabile, non confronto per nome |
| Regione name, center_lat, center_lon | Nome e centro per marker/camera, non punto migliore |
| Regione geometry | Contorno Polygon/MultiPolygon, `[lon,lat]` lunari |
| Regione active, lists | Calcolabile/inattiva e liste NASA; inattiva non significa scartata |
| area_km2, cell_size_m, griglia/DEM | Metadati statici, non area idonea a T |
| Sito geometry.coordinates | `[lonEastDeg,latDeg]` del punto |
| Sito name, kind, date, source, note | Identità/provenienza; date e note nullable |
| in_sector, region, dem_near, dem_covering | Copertura polare; null fuori settore non elimina il sito |
| meowrizon.reference e metadati | Raggio, frame, proiezione, generazione e sorgente |

Nessun SiteCatalog parallelo su `/api/sites`, nessuna interpretazione WGS84/Terra delle coordinate lunari. Catalogo non inizializzato 503 con detail; non sostituirlo con lista vuota.

### Migrazione completa dei record mock

| ID attuale | Destinazione |
|---|---|
| malapert-massif, de-gerlache-rim-2 | Stessi ID regione, le due attive |
| haworth, nobile-rim-1, nobile-rim-2 | Contorno esistente ma inattive; nessuna frazione inventata |
| mons-mouton-plateau, mons-mouton, peak-near-cabeus-b, slater-plain | Non operative senza contorno ufficiale; niente poligoni inventati sui centri |
| apollo11, apollo15 | Alias espliciti di migrazione verso **site:apollo-11**, **site:apollo-15**, coordinate reali del catalogo |
| shackleton, de-gerlache, sp-ref | Punti dimostrativi; se conservati, coordinate libere, non regioni/siti ufficiali inventati |
| malapert degli EXAMPLE_SITES | Punto approssimato distinto da region:malapert-massif; non unire per nome |

Mock: 14 record; EXAMPLE_SITES: sei punti; backend: 13 regioni e 16 siti. Rendere selezionabili i cataloghi reali, senza cataloghi duplicati divergenti. “Equator” è oggi un gruppo mock: i siti reali stanno in tutta la Luna. Siti in una sezione separata, filtrabile geograficamente, senza mescolarli nella classifica regionale.

Il nuovo stato di selezione mantiene `{kind:"region"|"site"|"point",id}` quando applicabile. Per point l'ID è assente e le coordinate costituiscono l'input. Coordinate e nome non sostituiscono l'identità di una regione.

## 7. Catalogo DEM e analisi terreno

### GET /api/coverage

Nessun parametro. CoverageCatalog: origin, products. Ogni DemProduct conserva i campi già letti dal client `id,title,pixelSizeM,latMinDeg,latMaxDeg,source,url,notes,available`, più `version,coordinateFrame,frameVersion,referenceRadiusKm,footprint` (geometry nullable).

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
      "notes": "Fixture contrattuale, non stato del server.",
      "available": true,
      "version": "fixture-product-001",
      "coordinateFrame": "MOON_ME",
      "frameVersion": "DE421",
      "referenceRadiusKm": 1737.4,
      "footprint": null
    }
  ]
}
```

available significa preparato/utilizzabile, non solo esistente sul portale. Pixel nominale non è precisione verticale. Fasce e footprint non certificano la copertura di tutto il cerchio di analisi. Scegliere i prodotti realmente preparati, senza obbligare a tutte le varianti del catalogo demo. Non riprodurre il fallback di bestProductFor che può scegliere il primo prodotto fuori copertura.

### POST /api/terrain-analyses

Obbligatori site.latDeg/lonEastDeg, observerHeightM, config.azimuthStepDeg/maxDistanceKm. Nessuna data, pubblico, nome o A/B. Caso UI tipico: 2 m, 0.5°, 150 km. **Esempio a 90° soltanto per quattro campioni leggibili**:

```json
{
  "site": {
    "latDeg": -85.99,
    "lonEastDeg": 2.9
  },
  "observerHeightM": 2,
  "config": {
    "azimuthStepDeg": 90,
    "maxDistanceKm": 150
  }
}
```

Risultato finale TerrainAnalysis, inserito nel result del TerrainJob:

```json
{
  "id": "terrain-001",
  "origin": "engine",
  "preview": false,
  "profile": {
    "azimuthDeg": [
      0,
      90,
      180,
      270
    ],
    "elevationDeg": [
      1,
      1,
      1,
      1
    ],
    "observer": {
      "site": {
        "latDeg": -85.99,
        "lonEastDeg": 2.9
      },
      "surfaceHeightM": 1200,
      "heightAboveSurfaceM": 2,
      "referenceRadiusKm": 1737.4
    },
    "dem": {
      "productIds": [
        "LDEM_80S_20MPP_ADJ"
      ],
      "effectivePixelSizeM": 20,
      "noDataFraction": 0
    },
    "params": {
      "azimuthStepDeg": 90,
      "maxDistanceKm": 150
    },
    "algorithmVersion": "fixture-horizon-2.0",
    "warnings": [
      "Profilo ridotto a quattro campioni per leggibilità."
    ],
    "coordinateFrame": "MOON_ME",
    "frameVersion": "DE421",
    "verticalDatum": "sphere-1737400m"
  },
  "slope": {
    "baselineM": 100,
    "valueDeg": 5,
    "status": "computed",
    "reasonCode": null
  }
}
```

| Campo | Significato / vincolo |
|---|---|
| profile.azimuthDeg / elevationDeg | H(az), uniformi da 0 a 360 escluso; stessa lunghezza, H anche negativo |
| profile.observer | Sito normalizzato, quota superficie, altezza osservatore, raggio |
| profile.dem | Product ID reali, pixel effettivo conservativo, NoData iniziale |
| profile.params | Parametri effettivi; raggio non ridotto silenziosamente |
| algorithmVersion, warnings, coordinateFrame, frameVersion, verticalDatum | Elaborazione e riferimento riproducibili |
| slope | baselineM:100, valueDeg nullable, status computed/unavailable, reasonCode nullable |

Geometria 3D con quota DEM+altezza, curvatura lunare e riferimento coerente. Quote numeriche, non hillshade. NoData non vale zero metri/orizzonte piatto; fallire se manca terreno indispensabile al profilo. surfaceHeightM è nullable per compatibilità storica, ma il motore reale deve conoscere la quota per completare una nuova analisi topocentrica.

Pendenza non misurabile → null/unavailable, senza inventare 0°. Un raster globale da ~237 m non giustifica una pendenza su 100 m. Un profilo valido può restare utilizzabile per il panorama anche con pendenza indisponibile; il giudizio di idoneità dipendente dalla pendenza non è certo.

GET `/api/terrain-analyses/{jobId}` non ha query/body. Usare **result.id** nel POST scenario, non l'ID della coda. L'orizzonte non dipende dalle date e la cache si riusa fra periodi.

## 8. Scenario, tracce, statistiche e grafici

### POST /api/scenario-evaluations

| Campo input | Default / significato |
|---|---|
| terrainAnalysisId | Obbligatorio, ID risultato terreno completato |
| startUtc, stopUtc | Obbligatori, range visuale |
| stepMinutes | Obbligatorio, passo output |
| visibility | Opzionale body-center; target disk-fraction, minVisibleFraction default 0.5 |
| includePointAssessment | Opzionale false; true aggiunge i dieci criteri a T, non necessario per sola baseline |

```json
{
  "terrainAnalysisId": "terrain-001",
  "startUtc": "2026-12-01T00:00:00.000Z",
  "stopUtc": "2026-12-01T01:00:00.000Z",
  "stepMinutes": 30,
  "visibility": {
    "model": "disk-fraction",
    "minVisibleFraction": 0.5
  },
  "includePointAssessment": false
}
```

Risultato completo sotto result del ScenarioJob. Qui pointAssessment è null, corrispondente a una richiesta con includePointAssessment false; l'esempio macchina mostra anche i criteri completi.

```json
{
  "id": "scenario-001",
  "origin": "engine",
  "terrainAnalysisId": "terrain-001",
  "timeScale": "UTC",
  "range": {
    "startUtc": "2026-12-01T00:00:00.000Z",
    "stopUtc": "2026-12-01T01:00:00.000Z",
    "startMs": 1796083200000,
    "stopMs": 1796086800000
  },
  "timesMs": [
    1796083200000,
    1796085000000,
    1796086800000
  ],
  "sun": {
    "azimuthDeg": [
      90,
      90.5,
      91
    ],
    "elevationDeg": [
      2,
      0,
      2
    ],
    "horizonDeg": [
      1,
      1,
      1
    ],
    "centerVisible": [
      true,
      false,
      true
    ],
    "visible": [
      true,
      false,
      true
    ],
    "visibleDiskFraction": [
      1,
      0,
      1
    ],
    "distanceKm": [
      149600000,
      149600000,
      149600000
    ],
    "angularDiameterDeg": [
      0.533,
      0.533,
      0.533
    ]
  },
  "earth": {
    "azimuthDeg": [
      180,
      180.01,
      180.02
    ],
    "elevationDeg": [
      3,
      3.1,
      3.2
    ],
    "horizonDeg": [
      1,
      1,
      1
    ],
    "centerVisible": [
      true,
      true,
      true
    ],
    "visible": [
      true,
      true,
      true
    ],
    "visibleDiskFraction": [
      1,
      1,
      1
    ],
    "distanceKm": [
      384400,
      384400,
      384400
    ],
    "angularDiameterDeg": [
      1.9,
      1.9,
      1.9
    ],
    "illuminatedFraction": [
      0.5,
      0.5,
      0.5
    ],
    "brightLimbAngleDeg": [
      180,
      180,
      180
    ]
  },
  "intervals": {
    "sun": [
      {
        "startMs": 1796083200000,
        "endMs": 1796084100000,
        "startClipped": true,
        "endClipped": false
      },
      {
        "startMs": 1796085900000,
        "endMs": 1796086800000,
        "startClipped": false,
        "endClipped": true
      }
    ],
    "earth": [
      {
        "startMs": 1796083200000,
        "endMs": 1796086800000,
        "startClipped": true,
        "endClipped": true
      }
    ],
    "both": [
      {
        "startMs": 1796083200000,
        "endMs": 1796084100000,
        "startClipped": true,
        "endClipped": false
      },
      {
        "startMs": 1796085900000,
        "endMs": 1796086800000,
        "startClipped": false,
        "endClipped": true
      }
    ],
    "eclipse": [],
    "eclipseTotal": []
  },
  "visibilityModel": "disk-fraction",
  "minVisibleFraction": 0.5,
  "ephemeris": {
    "source": "NASA/JPL Horizons",
    "version": "fixture-adapter-2.0",
    "kernels": [],
    "corrections": "Convenzione apparente airless documentata dall’adapter; fixture di formato.",
    "coordinateFrame": "MOON_ME",
    "frameVersion": "DE421",
    "sourceDatasetIds": [
      "fixture-dataset-001"
    ],
    "sourceStepMinutes": 60,
    "timingUncertaintyMs": null,
    "accuracyNotes": [
      "Esempio contrattuale, non una previsione astronomica."
    ]
  },
  "eventToleranceMs": 1000,
  "approximations": [
    "Fixture di formato, non dati NASA."
  ],
  "summary": {
    "startMs": 1796083200000,
    "stopMs": 1796086800000,
    "visibilityModel": "disk-fraction",
    "minVisibleFraction": 0.5,
    "sun": {
      "totalMs": 1800000,
      "fraction": 0.5,
      "longestOnMs": 900000,
      "longestOffMs": 1800000,
      "count": 2,
      "riseCount": 1
    },
    "earth": {
      "totalMs": 3600000,
      "fraction": 1.0,
      "longestOnMs": 3600000,
      "longestOffMs": 0,
      "count": 1,
      "riseCount": 0
    },
    "both": {
      "totalMs": 1800000,
      "fraction": 0.5,
      "longestOnMs": 900000,
      "longestOffMs": 1800000,
      "count": 2,
      "riseCount": 1
    }
  },
  "events": [
    {
      "timeMs": 1796084100000,
      "kind": "sunset",
      "eclipseId": null
    },
    {
      "timeMs": 1796085900000,
      "kind": "sunrise",
      "eclipseId": null
    }
  ],
  "eclipses": [],
  "eclipseState": {
    "separationDeg": [
      90,
      90,
      90
    ],
    "magnitude": [
      0,
      0,
      0
    ],
    "obscurationFraction": [
      0,
      0,
      0
    ],
    "kind": [
      "none",
      "none",
      "none"
    ]
  },
  "pointAssessment": null
}
```

| Campo risultato | Consumatore e significato |
|---|---|
| id,origin,terrainAnalysisId,timeScale,range,timesMs | Identità, UTC, intervallo e asse comune |
| sun/earth.azimuthDeg,elevationDeg,horizonDeg | Array angolari N: panorama, traiettorie, HUD, Now |
| centerVisible | Array del centro geometrico, significato invariato |
| visibleDiskFraction,visible | Array di frazione sopra H e classificazione richiesta |
| distanceKm,angularDiameterDeg | Distanza topocentrica e diametro intero, non raggio |
| Terra illuminatedFraction,brightLimbAngleDeg | Array fase e orientamento del lato illuminato |
| intervals.sun/earth/both | Stato del modello richiesto: grafici/report/CSV |
| intervals.eclipse/eclipseTotal | Contatti geometrici tagliati al range |
| eclipseState | Array separationDeg,magnitude,obscurationFraction,kind |
| eclipses | Eventi completi SiteEclipse sovrapposti al periodo |
| events | `{timeMs,kind,eclipseId}`; enum preciso nello schema |
| summary | PeriodSummary dagli stessi intervalli |
| pointAssessment | PointAssessment oppure null se non richiesto |
| ephemeris,eventToleranceMs,approximations | Fonte/versione/frame/dataset/limiti |

brightLimbAngleDeg: piano tangente alla Terra, 0° verso azimut crescente, 90° verso elevazione decrescente, positivo orario nel disegno non stirato, [0,360). Null se indefinito (fase piena/nuova esatta, singolarità allo zenit). Il frontend adatta la proiezione e lo stiramento del panorama.

### PeriodSummary e baseline

Root: startMs,stopMs,visibilityModel,minVisibleFraction; oggetti sun/earth/both con:

| Campo | Definizione |
|---|---|
| totalMs | Somma delle durate dopo clipping |
| fraction | totalMs/(stopMs−startMs) |
| longestOnMs | Massima finestra, 0 se nessuna |
| longestOffMs | Massimo nel complemento del periodo, bordi inclusi |
| count | Numero finestre, come la statistica legacy |
| riseCount | Inizi fisici, senza startClipped; usare per Sunrises |

Mapping SiteSummary: sun=summary.sun.fraction, earth/both analoghi; nightH=summary.sun.longestOffMs/3600000. Corrente `[T,T+D)`, precedente `[T−D,T)`, stessi terreno/altezza/modello. Non sottrarre un mese di calendario. Delta frazioni = **punti percentuali** `100×(now−prev)`; Delta durate = ore. Prev assente → nessuna Delta, non 0%.

### Calendario, heatmap, finestre ed export

- Calendario: integrare intervalli in bin dichiarati. La UI usa `T+n×24h`, anche con T alle 14:05: non chiamarli giorni UTC interi. Per giorni civili UTC, tagliare primo/ultimo bin al range.
- Heatmap: due test indipendenti “ogni corpo visibile almeno 30 minuti” possono dare Both senza simultaneità. Se l'etichetta significa simultaneità, usare overlap di intervals.both; la scelta grafica non cambia i dati backend.
- Finestre: filtro locale both ≥24/72/168 h, ordine durata decrescente e inizio crescente. Le finestre clipped sono solo la porzione nel range, non una durata di missione certificata.
- Intervals CSV: `body,start_utc,end_utc,duration_h`; Events CSV: `event,utc`. Export locale da risultati server, UTC ISO e mapping enum alle etichette.

Gli intervalli both riguardano il terreno: non garantiscono energia, link radio o luce residua durante un'eclissi. Non sottrarre eclissi solo ad alcune schede creando statistiche discordanti. GET `/api/scenario-evaluations/{jobId}` ha solo ID job. Baseline/corrente possono riusare il terreno; il runner lo reinvia comunque, perciò deduplicare.

## 9. PointAssessment: dieci criteri senza endpoint aggiuntivo

Richiesto con includePointAssessment true sullo scenario; il ranking riusa lo stesso tipo. Schema completo PointAssessment e tipi annidati nell'OpenAPI.

| Criterio / dato | Campi esatti |
|---|---|
| Identità/stato | epochMs,site,observerHeightM,cellSizeM:100,policyVersion,visibilityThreshold,status,reasonCodes |
| 1–4: visibilità/elevazione | sun e earth: visible,visibleDiskFraction,elevationDeg,horizonDeg,marginDeg |
| 5–6: continuità | continuousSun e continuousEarth: status,eventMs,hours,searchedUntilMs |
| 7: prima notte | firstNight: status,startMs,endMs,durationH,atLeastH,exceeds50H |
| 8: pendenza | slope: baselineM,valueDeg,status,reasonCode |
| 9: illuminazione annua | annual: year,status,coverageFraction,sunFraction,isPeak,peakThreshold:0.8 |
| 10: tenuta | robustness: advanceDays,delayDays,balancedDays,samples[7] |

Stato eligible/excluded/unavailable. Idoneità: Sole e Terra sopra la soglia e pendenza strettamente <10°. Dati mancanti non sono una falsa esclusione; informazioni indipendenti valide possono restare disponibili.

Codici minimi stabili in reasonCodes: `sun_hidden_at_epoch`, `earth_hidden_at_epoch`, `slope_at_or_above_10deg`, `slope_unavailable`, `terrain_coverage_incomplete`, `ephemeris_coverage_incomplete`, `event_not_found_in_coverage`, `shift_coverage_incomplete`, `no_eligible_cells`. Un risultato escluso/non disponibile richiede almeno una causa; un errore tecnico che impedisce tutto il calcolo resta invece un job failed. La UI localizza i codici e deve gestire anche eventuali codici futuri non ancora conosciuti.

Continuità: found con evento e ore; already-hidden con eventMs=T/hours=0; not-found-in-coverage con evento/ore null e termine ricerca. La ricerca può superare stop del grafico. Limite iniziale proposto 365 giorni da T, entro effemeridi supportate: mancato evento non significa infinito.

Prima notte: comprende quella già in corso a T. Cercarne anche l'inizio prima di T entro copertura; non assumere che inizi a T. complete richiede estremi/durata; open-ended consente atLeastH e avviso solo se limite inferiore >50 h; not-found-in-coverage non significa “nessuna notte mai”.

Pendenza: verde <8, giallo [8,10), arancione [10,15], rosso >15; a 10° escluso. Buio: avviso **>50 h**, riferimento VIPER, non modello termico. Anno: 1 gennaio UTC→successivo escluso, rispettare anni bisestili; frazione/picco solo con copertura completa, picco ≥0.8.

PointShift contiene offsetDays,epochMs,status,eligible,sunVisible,earthVisible,sunMarginDeg,earthMarginDeg,continuousSunH,continuousEarthH,firstNightStartMs,firstNightDurationH. Esattamente una riga per offset −3…+3. Pendenza/anno riutilizzati. Anticipi/ritardi consecutivi senza buchi, 0–3; balancedDays=min(advanceDays,delayDays). Verifica mancante → non attribuire tenuta completa.

## 10. Ranking parametrizzato e confronto

### POST /api/ranking

```json
{
  "epochUtc": "2026-12-01T00:00:00.000Z",
  "regionIds": [
    "malapert-massif"
  ],
  "sortBy": "overall",
  "displayDays": 1,
  "stepMinutes": 60,
  "observerHeightM": 2,
  "minVisibleFraction": 0.5,
  "includePrevious": true
}
```

| Input | Default / regola |
|---|---|
| epochUtc | Obbligatorio, istante di atterraggio |
| regionIds | Opzionale, altrimenti regioni attive; duplicati/ignoti/inattivi non ignorati |
| sortBy | overall/sun/earth/both, default overall |
| displayDays | 30; solo contesto grafico/baseline, non idoneità |
| stepMinutes | 60, output per riassunti |
| observerHeightM | 2, altro valore rifiutato 422 per politica regionale |
| minVisibleFraction | 0.5, in (0,1], esplicito nella cache |
| includePrevious | true; baseline fallita dichiarata senza distruggere il corrente |

Risposta completa, esempi inclusi: **RankingResult** in [OpenAPI](api-contract.openapi.json). Non restituisce il vecchio mock o uno score artificiale.

| Campo / oggetto | Formato e significato |
|---|---|
| Root | id,origin,epochMs,policyVersion,observerHeightM,minVisibleFraction,sortBy,officialSort,statisticsScope,displayRange,previousRange,regions,warnings |
| statisticsScope | representative-cell: frazioni temporali di una cella dichiarata, non media regionale |
| regions[].id,name,center | Identità, nome e centro esclusivamente cartografico |
| status,reasonCodes | eligible/excluded/unavailable e cause |
| rank,overallRank | Posizione selezionata e ufficiale, null senza risultato idoneo |
| totalCellCount,evaluatedCellCount,eligibleCellCount,eligibleAreaKm2 | Copertura e area idonea del poligono, non del centro |
| robustness | Anticipo/ritardo/minimo e sette RegionShift con conteggi idonei a T±0…3 giorni |
| representative | Null senza punto idoneo, altrimenti site,terrainAnalysisId,selectionRule,assessment,current,previous,previousStatus |
| assessment | PointAssessment della cella, non robustezza regionale |
| current,previous | PeriodSummary dello stesso rappresentativo, previous nullable |
| previousStatus | complete/unavailable/not-requested |

Le celle restano interne. totalCellCount riferito alla parte valutabile del contorno nel settore; trattare bordi/intersezioni. Area da celle nel riferimento metrico con le correzioni previste, non numero di marker. Regione senza celle idonee → excluded; motivazione dominante dalla condizione che esclude più celle, tie-break Sole/Terra/pendenza. Conteggi di esclusione possono sovrapporsi.

Primo rilascio: ordine ufficiale solo con copertura di calcolo completa; altrimenti unavailable/rank null, senza assumere favorevole la parte mancante. Non sostituire una regione con il suo centro per ridurre il calcolo.

### Ordinamento e selezione rappresentativo

Ordine lessicografico overall:

1. balancedDays decrescente;
2. delayDays decrescente, tie-break della tenuta deciso dal team;
3. eligibleAreaKm2 decrescente;
4. ore continue Sole del rappresentativo decrescenti;
5. ore continue Terra della stessa cella decrescenti;
6. ID regione crescente, stabilità tecnica.

Rappresentativo scelto fra le celle idonee massimizzando luce continua, poi contatto continuo, poi ID cella stabile (selectionRule esplicita). La regione può avere celle idonee diverse alle date vicine: non copiarvi la robustezza del rappresentativo.

sun/earth/both sono riordini diagnostici per la frazione del rappresentativo nel periodo visuale; tie-break ordine ufficiale. rank segue la vista, overallRank conserva la politica. Cambiare durata può cambiare il riordino diagnostico, **non** idoneità/ordine ufficiale. Evento non trovato entro copertura non diventa infinito per vincere.

### Click e CompareCard

Conservare ID regione, aprire representative.site e terrainAnalysisId. Se si apre invece il centro, chiamarlo “panorama dal centro” senza attribuirgli i dati del punto migliore.

Fino a tre altre regioni idonee nell'ordine scelto, escludendo per identità la selezionata. Oggi due attive: accettare meno di tre righe, senza riempire con mock. Riassunti riusabili solo con stessi giorni, altezza e modello di A. Se A ha altezza diversa da 2 m, ricalcolare i confronti alla stessa altezza e dichiarare che i candidati provengono dal ranking ufficiale a 2 m. Non riselezionare il rappresentativo nel periodo precedente: il confronto temporale è sullo stesso punto.

Siti in tabella separata, valutati come punti con gli endpoint terreno/scenario. Siti sulla faccia nascosta o fuori settore non eliminati: possono avere Terra mai visibile o pendenza non misurabile. La UI “Area=Equator” non richiede una finta classifica di regioni equatoriali.

GET `/api/ranking/{jobId}` → RankingJob. Per le schermate attuali non servono endpoint ulteriori di dettaglio/celle: risultato e catalogo contengono già click e confronto. Una futura mappa di celle colorate avrà contratto dedicato quando esisterà il renderer; non esportare migliaia di punti inutilizzati.

## 11. Eclissi locali e calendario

POST `/api/eclipse-searches`: terrainAnalysisId,startUtc,stopUtc obbligatori, minVisibleFraction opzionale 0.5. Terreno identifica posizione/quota/altezza. Range massimo 800 giorni. La UI attuale ancora a mezzanotte di T meno 3 giorni e cerca per **2×365.25 giorni**: inviare estremi esatti, non years ambiguo.

```json
{
  "terrainAnalysisId": "terrain-001",
  "startUtc": "2026-12-01T00:00:00.000Z",
  "stopUtc": "2028-11-30T00:00:00.000Z",
  "minVisibleFraction": 0.5
}
```

EclipseSearchResult: id,origin,terrainAnalysisId,range,minVisibleFraction,events,eventToleranceMs,ephemeris,warnings. Esempio completo nell'OpenAPI. Ogni events[] è SiteEclipse:

```json
{
  "id": "eclipse-fixture-001",
  "startMs": 1796173200000,
  "endMs": 1796187600000,
  "maxMs": 1796180400000,
  "totalStartMs": 1796176800000,
  "totalEndMs": 1796184000000,
  "kind": "total",
  "magnitude": 1.2,
  "obscurationFraction": 1,
  "visible": true,
  "sunAzimuthDeg": 90,
  "sunElevationDeg": 2,
  "horizonDeg": 1,
  "visibleAtMaxFraction": 1
}
```

| Campo / regola | Significato |
|---|---|
| startMs,endMs,maxMs | Contatti esterni e massimo topocentrici: start<max<end |
| totalStartMs,totalEndMs | Entrambi null se partial; per total start≤totalStart≤max≤totalEnd≤end |
| kind | partial/total, Terra davanti al Sole vista dalla Luna |
| magnitude | Frazione del diametro solare occultato nel modello; può superare 1 |
| obscurationFraction | Frazione dell'area solare occultata, 0–1, diversa dalla magnitudine |
| visible | Sopra il terreno alla soglia **al massimo**, non per tutta l'eclissi |
| sunAzimuthDeg,sunElevationDeg,horizonDeg,visibleAtMaxFraction | Geometria locale al massimo |

Eventi che intersecano il range anche se massimo esterno; contatti fisici completi nel calendario, non tagliati. Intervalli sulla timeline tagliati e clipped. [] significa ricerca valida senza eventi, non errore upstream.

Scenario.eclipses, intervals.eclipse/eclipseTotal, events e eclipseState usano lo stesso metodo/parametri della ricerca lunga. Non ricalcolare contatti con diametri medi nel browser. Ricerca interna capace di trovare eventi brevi fra campioni; incertezza del modello distinta da tolleranza del raffinamento.

Un'eclissi non modifica la frazione sopra H o la visibilità geometrica della Terra. Il panorama oscura il Sole usando **area occultata**, non il vecchio coverage() del diametro. Le frasi percentuali della UI devono distinguere le due grandezze.

Go to eclipse resta locale: `start=floor((max−2 giorni)/1 ora)×1 ora`, offset=max−start, playback fermo, nuovo scenario. Con durata minima attuale 7 giorni il massimo è contenuto. GET `/api/eclipse-searches/{jobId}` → EclipseSearchJob.

## 12. Orbite e stato del globo

### POST /api/system-ephemerides

startUtc,stopUtc richiesti, stepMinutes opzionale 60. SystemEphemerides: vettori di Sole/Luna geocentrici in **km**, frame **ECLIPJ2000**, origine centro Terra, correzioni geometriche. UTC pubblico; conversione esplicita se sorgente TDB. Tutti gli array N, vettori con tre componenti.

```json
{
  "startUtc": "2026-12-01T00:00:00.000Z",
  "stopUtc": "2026-12-01T01:00:00.000Z",
  "stepMinutes": 30
}
```

```json
{
  "id": "system-001",
  "origin": "engine",
  "range": {
    "startUtc": "2026-12-01T00:00:00.000Z",
    "stopUtc": "2026-12-01T01:00:00.000Z",
    "startMs": 1796083200000,
    "stopMs": 1796086800000
  },
  "timeScale": "UTC",
  "coordinateFrame": "ECLIPJ2000",
  "vectorOrigin": "earth-center",
  "vectorUnits": "km",
  "corrections": "geometric",
  "timesMs": [
    1796083200000,
    1796085000000,
    1796086800000
  ],
  "sunGeocentricKm": [
    [
      149600000,
      0,
      0
    ],
    [
      149600000,
      0,
      0
    ],
    [
      149600000,
      0,
      0
    ]
  ],
  "moonGeocentricKm": [
    [
      384400,
      0,
      0
    ],
    [
      384400,
      0,
      0
    ],
    [
      384400,
      0,
      0
    ]
  ],
  "moonEclipticLatitudeDeg": [
    0,
    0,
    0
  ],
  "moonCenterEclipse": {
    "separationDeg": [
      180,
      180,
      180
    ],
    "magnitude": [
      0,
      0,
      0
    ],
    "obscurationFraction": [
      0,
      0,
      0
    ],
    "kind": [
      "none",
      "none",
      "none"
    ]
  },
  "ephemeris": {
    "source": "NASA/JPL Horizons",
    "version": "fixture-adapter-2.0",
    "kernels": [],
    "corrections": "geometric",
    "coordinateFrame": "ECLIPJ2000",
    "frameVersion": "ICRF/J2000",
    "sourceDatasetIds": [
      "fixture-dataset-001"
    ],
    "sourceStepMinutes": 60,
    "timingUncertaintyMs": null,
    "accuracyNotes": [
      "Esempio contrattuale, non una previsione astronomica."
    ]
  }
}
```

Mapping OrbitView: g.moon=moonGeocentricKm, g.sun=sunGeocentricKm; earthAu=−sunGeocentricKm/149597870.7, moonKm=moonGeocentricKm. moonEclipticLatitudeDeg alimenta il testo sopra/sotto il piano; moonCenterEclipse lo stato **lunocentrico**, diverso dai contatti al sito.

Miniatura/vista aperta condividono i dati. Camera, ring illustrativi, dimensioni ×4 e distanza lunare ×60 restano rendering, con etichette di scala. “150 million km” è oggi costante: ricavare la distanza dai vettori se presentata come dato. Non sono traiettorie di missione.

Percorso attuale ±14 giorni rispetto a bucket di 6 ore, ogni 12 ore. Caricare almeno `[inizioScenario−14 giorni−6 ore,fineScenario+14 giorni+6 ore]`, oppure finestre contigue con stessi metadati; 90+28.5 giorni entro 120. Decimazione/interpolazione per rendering, ricarica solo fuori copertura, non per frame. Il modello precedente era eclittica di data: passare al frame dichiarato senza mescolare epoche. GET `/api/system-ephemerides/{jobId}` → SystemEphemeridesJob.

### GET /api/globe-state?utc=...

utc richiesto ISO Z, nessun body. GlobeState: origin,utc,timeMs,coordinateFrame,frameVersion,sun,earth,ephemeris. Per corpo subPoint `{latDeg,lonEastDeg}`, directionMoonFixed unitario dal centro Luna verso il corpo e distanceKm lunocentrica.

```json
{
  "origin": "engine",
  "utc": "2026-12-01T00:00:00.000Z",
  "timeMs": 1796083200000,
  "coordinateFrame": "MOON_ME",
  "frameVersion": "DE421",
  "sun": {
    "subPoint": {
      "latDeg": 0,
      "lonEastDeg": 0
    },
    "directionMoonFixed": [
      1,
      0,
      0
    ],
    "distanceKm": 149600000
  },
  "earth": {
    "subPoint": {
      "latDeg": 0,
      "lonEastDeg": 90
    },
    "directionMoonFixed": [
      0,
      1,
      0
    ],
    "distanceKm": 384400
  },
  "ephemeris": {
    "source": "NASA/JPL Horizons",
    "version": "fixture-adapter-2.0",
    "kernels": [],
    "corrections": "Convenzione apparente airless documentata dall’adapter; fixture di formato.",
    "coordinateFrame": "MOON_ME",
    "frameVersion": "DE421",
    "sourceDatasetIds": [
      "fixture-dataset-001"
    ],
    "sourceStepMinutes": 60,
    "timingUncertaintyMs": null,
    "accuracyNotes": [
      "Esempio contrattuale, non una previsione astronomica."
    ]
  }
}
```

X a lat0/lon0, Y a lat0/lon90Est, Z al Nord; norma 1 entro 1e-9, subpoint coerente. Cesium DirectionalLight usa il **negativo** del vettore Sole. Globo all'istante iniziale scelto, panorama/orbite al cursore. Debounce/cache mentre si scorre DateDial; luce piatta a toggle off è rendering, non fallback scientifico.

## 13. Manifest mappe, tile e copertura temporale

GET `/api/visualization-config`, nessun parametro. VisualizationConfig completo nell'OpenAPI:

- moon: referenceRadiusKm,coordinateFrame,frameVersion,geometry:sphere; nessun terreno 3D implicito;
- timeCoverage: supportedStartUtc/supportedStopUtc e cachedStartUtc/cachedStopUtc nullable; supporto e cache distinti;
- sourceStepMinutes:60, maximumSamples:20000;
- layers: id,title,role,upstreamLayerId,format,tileUrlTemplate,minimumLevel,maximumLevel,tileWidthPx,tileHeightPx,tilingScheme,attribution,sourceUrl.

Layer correnti WAC `LRO_WAC_Mosaic_Global_303ppd_v02` JPG e hillshade `LRO_LOLA_Shade_Global_256ppd_v06` PNG. Template locale `/api/map-tiles/lro-wac/{TileMatrix}/{TileRow}/{TileCol}.jpg`. Schema geographic, levelZeroColumns:2, levelZeroRows:1. Proiezioni polari richiederebbero altro renderer.

Leggere Capabilities per formato/griglia/dimensioni/livelli; valori 256 px e livello 7 delle fixture **non certificano la configurazione live**. Crediti conservati. Linee DEM hardcoded derivabili dal catalogo, senza usarle per decidere disponibilità scientifica.

GET `/api/map-tiles/{layerId}/{tileMatrix}/{tileRow}/{tileCol}.{format}`: layer noto e formato uguale al manifest, niente URL arbitrario. L intero nel range; griglia 2×1: 0≤row<2^L, 0≤col<2×2^L, origine Nord-Ovest; traduzione agli ID WMTS effettivi nel backend. Successo 200 byte image/jpeg o image/png, non JSON/base64; ETag/Cache-Control e 304 senza corpo. Tile veramente assente 404, parametro fuori griglia 422, servizio remoto guasto 502/503/504, non falsa tile nera o falso NoData.

Immagini già reali nel frontend: il proxy realizza il punto unico. Mappe indisponibili possono lasciare la sfera con messaggio senza invalidare un risultato scientifico già disponibile. Hillshade non alimenta quote/H.

## 14. Sorgenti e cache

| Prodotto | Dati/elaborazioni necessari |
|---|---|
| Terreno | DEM numerici LOLA PDS/PGDA/globali Moon Trek, trasformazioni, curvatura, ray tracing e pendenza 100 m |
| Tracce/criteri | Tabella globale Horizons COMMAND=301,CENTER=500@399,QUANTITIES=14,15,20 oraria; geometria locale con quota/parallasse Terra |
| Diametri/fase/eclissi | Distanze e geometria apparente coerenti per sito; ricerca contatti e unità normalizzate |
| Orbite nuove | Ulteriori query **Horizons VECTORS**, target 10 e 301 dal centro Terra, piano eclittico J2000, KM-S, correzione NONE |
| Luce globale | Direzioni Moon-fixed distinte dagli azimut locali e dai vettori geocentrici |
| Mappe | Capabilities e tile WMTS, mai quote ricavate da immagini |

Parametri/correzioni nell'[API Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html); quantità e frame nel [manuale](https://ssd.jpl.nasa.gov/horizons/manual.html). Validare payload anche con HTTP200: JSON può contenere errore o tabella testuale in result. Riconciliare scala tempi, verso longitudini e unità. La tabella globale decisa non fornisce da sola i vettori della nuova OrbitView. Nessun nuovo requisito WebGeocalc/SPICE. Non chiamare Horizons per ogni cella/frame; preparazione locale e cache riusabili offline.

| Cache | Chiave minima |
|---|---|
| Terreno | Coordinate precise normalizzate, altezza/passo/raggio, prodotti/versioni/frame/datum/algoritmo |
| Scenario | Terreno immutabile, range/passo, modello/soglia, effemeridi/correzioni/eventi |
| Ranking | Catalogo/geometrie/versioni, ID regioni, T, politica/soglie/2m, sorgenti/terreno; statistiche visuali distinte per periodo |
| Baseline/confronto | Stessa posizione/parametri, range espliciti, non solo nome |
| Eclissi | Posizione 3D/terreno, range/soglia/metodo/sorgenti |
| Orbite/globo | Istante/range, frame/unità/passo/modello |
| Tile | Prodotto/versione, matrix set,L,row,col,format |

Deduplicare anche richieste concomitanti. Sorgenti/versioni nuove invalidano i derivati opportuni, senza mutare risultati emessi. No quantizzazione chilometrica del mock. Esporre sourceDatasetIds per risalire alle acquisizioni; distinguere epoca analizzata da generazione/cache.

## 15. Errori, loading e risultati parziali

HttpProvider legge detail **stringa**. Normalizzare gli errori scientifici, compresi i detail-list di validazione FastAPI/Pydantic, senza cambiare alla cieca gli endpoint raw esistenti:

```json
{
  "detail": "Il periodo supera 20000 campioni",
  "code": "sample_limit_exceeded",
  "fields": [
    {
      "field": "stepMinutes",
      "message": "Aumentare il passo o ridurre il periodo"
    }
  ],
  "retryable": false
}
```

| HTTP | Casi |
|---|---|
| 400/415 | JSON malformato/media type |
| 404/410 | Ignoto/scaduto noto |
| 409 | Terreno non completato o stato incompatibile |
| 422 | Coordinate/poli/range/passo/soglia/campioni, ID regione ignoto/inattivo, epoca fuori supporto |
| 429 | Coda/limite richieste, Retry-After quando disponibile |
| 502/503/504 | Payload upstream errato/dati o servizio indisponibili/timeout |
| 500 | Errore interno senza traceback pubblico |

Dopo accodamento, errore nel JobState con polling200; mai running eterno. excluded è risultato scientifico, unavailable mancanza dati. Baseline assente senza perdere il corrente. Confronto: righe fallite non sono 0h e non devono azzerare tutte le righe valide. Eclissi [] solo dopo ricerca valida. Vecchi risultati stale mantengono identità/range: non accoppiare terreno nuovo ed effemeridi vecchie. timingUncertaintyMs null significa ignota, non zero; eventToleranceMs non è accuratezza fisica.

Vite/nginx inoltrano `/api`; origine dev da MEOWRIZON_API_ORIGIN. HttpProvider mette Content-Type anche ai GET, quindi cross-origin può richiedere preflight. Niente recupero browser di file sorgente arbitrari.

## 16. Adattamenti frontend espliciti

Questa consegna aggiorna documentazione/schema, **non collega la UI**. Cambiare soltanto VITE_DATA_SOURCE non completa l'integrazione.

| Punto | Modifica necessaria |
|---|---|
| tipi/provider HTTP | Nuovi metodi/tipi/enum, campi tracce/summary/eclissi/criteri; mantenere i cinque metodi C |
| loadRegions | Rimuovere fetch mock e promise globale non parametrizzata; cataloghi/ranking dipendono da T/parametri |
| ranking e selezione | Rimuovere pesi/score client, ordine server, cataloghi GeoJSON e ID tipizzati; siti separati |
| Regione | Distinguere contorno, centro e rappresentativo; niente matching per nome |
| runScenario | Modello esplicito, criteri richiesti solo dove utili, baseline non bloccante, protezione risposte obsolete |
| runComparison | Chiave con passo/raggio/modello/identità, meno di tre candidati, errore per riga |
| useAutoRun | Aggiungere passo azimut/raggio/modello ai trigger, ora assenti; invalidare ranking/eclissi/globo al cambio input |
| HorizonScene/story | Diametri/fase/orientamento reali, area occultata, stato del modello; testi non garantiscono potenza/link budget |
| spanAt/inIntervals | Clipping e campione terminale senza eventi/stati falsi |
| PeriodPanel | riseCount per albe; baseline con range reale, non etichetta fissa del mese |
| DeepDive/Timeline | Eventi/eclissi server, rimuovere euristica 60s, bin temporali e Both coerenti |
| EclipseCards | Job per sito/terreno/range, loading/error/empty, contatti locali e area distinta da magnitude |
| OrbitView/MoonGlobe | Serie/direzioni/manifest API, rimuovere dipendenze scientifiche approxEphemeris; nessun fetch per frame |
| DemoChip | Provenienza di tutti i prodotti, non solo provider.kind |
| Building | Stato di ciascun prodotto; scenario pronto non implica baseline/calendario/ranking pronti |

approxEphemeris ora usa Meeus ridotto; alcune stringhe demoProvider.approximations descrivono ancora il vecchio modello sinodico. I metadati del motore devono dichiarare il metodo eseguito, senza copiarle. Brand kit, SVG, stelle e creste vicine rimangono fixture/decorazioni dichiarate.

## 17. Sequenza e verifica di consegna

1. Configurazione/cataloghi/DEM; distinguere errore da lista vuota.
2. T cambia con debounce: globo e ranking; non acquisire per ogni scatto della rotella.
3. Selezione regione con ID e punto rappresentativo; sito/pick libero con coordinate/altezza reali.
4. Terreno→poll→result.id→scenario→poll; render dei risultati coerenti.
5. Baseline, confronto, eclissi lunghe e vettori del range allargato indipendenti ma associati allo stesso input.
6. Cursore/eventi/finestre/calendario/playback locali sui prodotti caricati; nuove richieste solo se input/copertura cambiano.

### Casi di accettazione

- [ ] F01–F27 coperti da DTO reale, derivazione deterministica o decorazione dichiarata; nessun `/mock` sul percorso reale.
- [ ] Cinque chiamate HttpProvider compatibili, ID coda/risultato/dataset corretti.
- [ ] Array N, UTC millisecondi, quota/altezza/frame, uniformità H e 720 valori a 0.5°.
- [ ] Date alle 14:05, passaggio anno bisestile, passo finale corto, sempre/mai visibile, eventi vicini ai bordi, cursore finale.
- [ ] Baseline uguale durata/parametri, Delta punti percentuali, assenza senza zeri fittizi.
- [ ] Ranking parametrico T, senza pesi; regione/centro distinti; inattiva/esclusa/non disponibile distinti.
- [ ] Due regioni attive e sedici siti gestiti, meno di tre confronti, siti separati e ID stabili.
- [ ] Criteri oltre stop grafico, notte già iniziata, ricerca censurata, pendenza ignota, anno completo, sette offset senza buchi.
- [ ] Eclissi partial/total, massimo fuori range ma contatti dentro, terreno che nasconde il Sole, eventi brevi, area distinta dal diametro.
- [ ] Calendario/scenario locali coerenti, orbitale lunocentrico distinto, niente query per tick.
- [ ] Summary/eventi coerenti con intervalli di grafici e CSV; bordi non contati come albe/tramonti.
- [ ] Job deduplicati/terminali, cache versionata, risultati superati ignorati, errori senza fallback sintetico engine.
- [ ] Schemi/esempi validati oltre ai controlli scientifici su casi di riferimento: il formato non valida la fisica.

Fuori dalla UI attuale: agente AI, profili missione, modello termico, relay/link budget/potenza, traiettorie di volo, scrittura scenari/siti e griglie massive senza renderer. Le mappe future di celle richiedono un contratto quando saranno consumate; non simulare requisiti assenti con API inutilizzate.

### Verifiche eseguite su questa revisione

- OpenAPI 3.1 validato formalmente: 16 operazioni e 63 schemi.
- 21 esempi macchina e 14 blocchi JSON del Markdown validati contro gli schemi, inclusi sette casi negativi per verificare il rifiuto di payload incompatibili.
- Invarianti controllati su ID, UTC millisecondi, campioni e array, intersezioni, clipping, statistiche, baseline, contatti eclissi e vettori.
- Proiezioni dei DTO legacy compilate direttamente contro i tipi TypeScript del frontend verificato, senza rimuovere i campi già richiesti dal client.
- Censimento incrociato di tutti i 14 record mock, 13 regioni, 16 siti e delle proprietà GeoJSON effettivamente generate dal backend; 27 flussi mappati.

La verifica è statica e contrattuale; non è un test UI o una validazione scientifica di algoritmi ancora da implementare. Il server dovrà emettere modelli Pydantic coerenti con questa specifica e verificare separatamente i casi scientifici di riferimento.
