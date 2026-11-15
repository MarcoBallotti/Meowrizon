# Contratto API e integrazione del simulatore

**Priorità approvata V1 (15/11/2026):** engine puntuale Python per 2–3 punti e date esplicite, con CLI/JSON e validazione; aggregazioni regionali, P50 e robustezza sono V2. HTTP scientifico e frontend seguono il nucleo. I dettagli estesi sotto non ampliano questo incarico: vedere il [piano V1](piano-logica.md).

**Revisione 3.0, 15 novembre 2026. Audit statico del frontend `48c2cdf`, su `main`.** Questa revisione documenta il codice esistente e il lavoro di integrazione. Non modifica l'applicazione, non installa TanStack Query e non certifica un engine già disponibile.

Il backend corrente usa **Python/FastAPI e file**, come verificabile in [main.py](../backend/app/main.py). La precedente richiesta di Flask non descrive più il repository. Le [specifiche scientifiche approvate](criteri-algoritmo.md) prevalgono sui modelli del vecchio client e sugli appunti storici.

## Indice operativo

| Documento | Contenuto |
|---|---|
| Questo contratto | Stato degli endpoint, parametri, flussi e vincoli di integrazione. |
| [Mappa delle interazioni](api-integration-map.md) | Ogni controllo/evento/effetto con stato, righe di codice, comportamento e chiamate condizionali. Include 42 punti precisi dove intervenire. |
| [Dizionario dati](api-data-dictionary.md) | Campi JSON esistenti, dati letti da ciascuna visualizzazione e lacune del nuovo modello. |
| [Piano TanStack Query](api-query-plan.md) | Chiavi, dipendenze, abilitazione, polling, riuso, annullamento e stati. |
| [Manifest verificabile](api-integration-map.json) | Hash e ancore: 150 interazioni, 25 effetti, 18 accessi dati, 303 funzioni e 97 modelli TypeScript. |
| [Archivio precedente](../backend/API_CONTRACT.v1-archive.md) | Vecchio contratto backend conservato integralmente, comprese le annotazioni preesistenti. Non è il target da implementare. |

L'audit copre tutti i TS/TSX/CSS di `frontend/src`, il JSON mock e i confini di configurazione/server indicati nel manifest. Include i callback delegati e i pulsanti Brand kit senza handler. Non sono 150 pulsanti distinti: uno stesso controllo può avere più eventi e un template più istanze. Non sono stati eseguiti test UI/e2e né tutte le combinazioni dinamiche del DOM.

## Decisioni ancora aperte: cosa non so

La mappa del codice è completa per la revisione censita; **non è possibile dichiarare definitivo al 100% il contratto scientifico**, perché mancano decisioni reali. Le evidenze sono nella [sezione 8 della mappa](api-integration-map.md#8-decisioni-aperte).

| ID | Mancanza verificata | Impatto |
|---|---|---|
| U01 | UX di `Overall/Best`, trofeo e primi tre candidati, incompatibili con l'assenza di uno score globale approvato. | Non implementare i pesi mock come algoritmo scientifico. |
| U02 | DTO finale della nuova scienza e binding HTTP del confronto regionale; il client usa ancora `body-center`. | Nessun URL di ranking o conversione dei booleani in frazioni inventati. |
| U03 | Corrispondenza fra regioni/siti/esempi, filtro `Equatorial/All` e selezione del rappresentante. | Servono identità e adapter espliciti, senza alias per somiglianza dei nomi. |
| U04 | Deduplicazione, retention, job scaduti, retry e ripresa dei job scientifici. | Nessuna garanzia di exactly-once o header di idempotenza fittizio. |
| U05 | Copertura temporale, limiti, timeout e accuratezza numerica reali. | Non ereditare limiti demo o promettere precisione di un secondo. |
| U06 | Significato del badge eclissi “visible”: osservabilità sopra terreno oppure stato solare C3. | Una totalità osservabile con `fSun=0` non è automaticamente nascosta dal terreno. |
| U07 | Altezze supportate e qualità della slope con DEM/coordinate incerti. | Non forzare 2 m né riempire unknown con zero. |
| U08 | Versione/configurazione TanStack, memoria, persistenza e offline. | Il piano v5 è una proposta, nessuna dipendenza installata. |
| U09 | Adapter Horizons validato, frame pubblico delle orbite e correzioni. | Nessuna garanzia numerica o trasformazione implicita fra frame. |

Le sezioni distinguono **implementato server**, **dichiarato client** e **proposto**. Le proposte non sono campi o rotte già supportati. REGION_COMPARISON resta senza URL fino alla soluzione di U01/U02/U03.

## 1. Dati utilizzati oggi

- [api/index.ts](../frontend/src/api/index.ts#L5-L17): `VITE_DATA_SOURCE` ha default `demo`, `VITE_API_BASE_URL` default `/api`. `DemoProvider` genera orizzonti e risultati sintetici; `HttpProvider` dichiara cinque metodi scientifici non implementati nel server corrente.
- [ranking.ts](../frontend/src/domain/ranking.ts#L67-L74) carica sempre [public/mock/regions.json](../frontend/public/mock/regions.json), anche in modalità `api`. Frazioni/notti sono inventate e indipendenti da T.
- [sites.ts](../frontend/src/domain/sites.ts#L17-L24) contiene sei esempi con coordinate approssimate; non è il catalogo reale dei sedici siti.
- Globo, orbite, eclissi, fase e diametri usano ancora `approxEphemeris.ts`, `eclipses.ts` e `sky.ts`. Cambiare provider non li sostituisce.
- Le immagini WMTS di Cesium provengono da servizi esterni. Provenienza e qualità vanno dichiarate per prodotto: la modalità `api` non certifica tutti i prodotti della pagina.

**Comportamento osservato:** [useAutoRun](../frontend/src/App.tsx#L10-L30) dopo 350 ms avvia A su ogni route, anche Home/Brand kit, e B se compare è attivo. Ogni run fa terreno → corrente → precedente non bloccante. Il bootstrap carica coverage e catalogo mock. CompareCard montata in `site` avvia anche i tre candidati mock. Non è una cache Query condivisa.

## 2. Convenzioni e parametri

| Dato | Definizione nel codice |
|---|---|
| T_A / T_B | `scenarios.A/B.input.startMs`, millisecondi Unix UTC. Cambiare T_A non cambia T_B. |
| D | `durationDays * 86_400_000`; controllo 7/14/30/60/90 giorni. |
| Passo | `stepMinutes`: 10/30/60/120 nel controllo Planner; passo visuale distinto dall'accuratezza degli eventi. |
| h | `observerHeightM` sopra DEM; default 2 m, UI 0–500 m, supporto reale U07. |
| Config terreno | Default stato `azimuthStepDeg=0.5`, `maxDistanceKm=150`; non limiti scientifici validati. |
| Coordinate | `{latDeg,lonEastDeg}`; latitudine `[-90,90]`, longitudine planetocentrica Est normalizzata `[-180,180)`. GeoJSON usa invece `[lon,lat]`. |
| Tempo HTTP | `new Date(ms).toISOString()`, senza conversione locale. |
| Corrente / precedente | `[T,T+D)` e `[T-D,T)`, stessa durata, terreno, altezza e modello. Il precedente non è il mese di calendario. |
| Cursore | `t=T_A+cursorOffsetMs`, senza cambiare T. |
| Unità | Gradi; azimut Nord in senso orario; elevazione sull'orizzontale locale; altezze m, distanze km, aree km², frazioni 0–1. |

Nome, audience, route, lettera A/B, hover, camera, playback e minimo delle finestre non sono parametri scientifici. L'identità di un risultato comprende valori della richiesta e revisioni effettive di fonti/modello; se queste mancano, non inventarle. Un campione al bordo finale serve all'interpolazione, senza aggiungere durata al range.

## 3. Registro HTTP

I percorsi sono completi di `/api`; il provider concatena base `/api` e suffissi `/coverage`, ecc. Non duplicare il prefisso.

| Prodotto | Operazione | Stato / input e risposta |
|---|---|---|
| REGIONS | `GET /api/regions`, `active` booleano opzionale | Server implementato, non collegato al ranking. GeoJSON metadata, senza metriche a T. |
| SITES | `GET /api/sites` | Server implementato, non collegato agli esempi. Nessun parametro, GeoJSON punti. |
| COVERAGE | `GET /api/coverage` | Solo client. Nessun parametro → `CoverageCatalog`. |
| TERRAIN | `POST /api/terrain-analyses`; `GET /api/terrain-analyses/{jobId}` | Solo client. `TerrainAnalysisRequest` → `JobState<TerrainAnalysis>`. |
| SCENARIO / PREVIOUS | `POST /api/scenario-evaluations`; `GET /api/scenario-evaluations/{jobId}` | Solo client; nuova scienza U02. Stesso endpoint, due range/chiavi. |
| GLOBE | `GET /api/globe-state?utc=<ISO>` | Proposta non implementata. Direzione solare Moon-fixed lunocentrica a T, non azimut del punto A. |
| VIS_CONFIG | `GET /api/visualization-config` | Proposta non implementata. Manifest disponibilità/layer WMTS, schema da concordare. |
| MAP_TILE | `GET /api/map-tiles/{layerId}/{tileMatrix}/{tileRow}/{tileCol}.{format}` | Proxy proposto. Byte `image/jpeg`/`image/png`, stile/griglia validati da Capabilities. |
| ECLIPSES | `POST /api/eclipse-searches`; `GET /api/eclipse-searches/{jobId}` | Proposta non implementata; U06. `terrainAnalysisId,startUtc,stopUtc` → calendario locale condiviso. |
| SYSTEM | `POST /api/system-ephemerides`; `GET /api/system-ephemerides/{jobId}` | Proposta non implementata; U09. Range UTC e passo visuale da concordare → serie globali. |
| REGION_COMPARISON | **Binding HTTP non definito** | ID regioni, T, metrica esplicita, verso, soglie, copertura/versioni. Non è `/api/regions` né uno score `/api/ranking` approvato. |

I JSON esatti già dichiarati e i dati ancora da concordare sono nel [dizionario](api-data-dictionary.md). L'OpenAPI servita da FastAPI descrive le sole rotte implementate: oggi non genera i tipi delle API scientifiche future.

### Richieste del client esistente

Esempio terreno con il primo punto demo, non una coordinata certificata:

```json
{
  "site": { "latDeg": -89.67, "lonEastDeg": 129.8 },
  "observerHeightM": 2,
  "config": { "azimuthStepDeg": 0.5, "maxDistanceKm": 150 }
}
```

Il terreno non dipende da T, D o passo temporale. Per lo scenario usare **`terrain.result.id`**, non `job.id`:

```json
{
  "terrainAnalysisId": "<id risultato terreno>",
  "startUtc": "2026-11-15T00:00:00.000Z",
  "stopUtc": "2026-12-15T00:00:00.000Z",
  "stepMinutes": 30
}
```

Con D=30, PREVIOUS chiede `2026-10-16T00:00:00.000Z` → `2026-11-15T00:00:00.000Z`. Non chiede automaticamente ottobre. Sono esempi di formato, non garanzie di copertura.

### Job, polling ed errori

```json
{ "id": "job-123", "status": "running", "progress": 0.4, "message": "Computing" }
```

```json
{ "id": "job-123", "status": "failed", "error": { "code": "<codice server>", "message": "<messaggio leggibile>" } }
```

[JobState](../frontend/src/api/types.ts#L47-L58) ammette `queued|running|completed|failed` e opzionali `progress,message,result,error`. In `completed`, `result` deve essere **il risultato completo** del relativo tipo. Il client accetta POST già completata oppure fa polling GET da 250 ms a un massimo di 3 s fra tentativi ([runJob](../frontend/src/api/jobs.ts#L34-L55)). Non ha timeout totale o cancellazione server.

HTTP non riuscito → `HttpError(status,message)`; viene letto solo `detail` stringa, non la validazione strutturata FastAPI. Il cast JSON non valida il payload. Dedup, job scaduti e retry dopo failed sono U04: non aggiungere header/flag fittizi. `AbortSignal` interrompe l'attesa client senza provare che il server abbia cancellato il lavoro.

### API di acquisizione e servizio

[routes.py](../backend/app/routes.py) implementa, sotto `/api/data`: `/sources`, POST `/collect`, POST `/prepare`, GET `/jobs/{job_id}`, `/datasets`, `/datasets/{dataset_id}/raw`, `/sources/{source_name}/data`, `/datasets/{dataset_id}/samples`, `/products`, `/regions`. Parametri e formati interni nel [README backend](../backend/README.md#acquisizione-e-preparazione-dei-dati-apidata).

**Nessun controllo attuale del simulatore chiama queste rotte.** Non avviare acquisizioni/download a ogni click o playback. I dati preparati richiedono adapter scientifici, non sono automaticamente un `ScenarioEvaluation`. La coda dati non prova l'esistenza della coda scientifica. `/api/health`, `/health`, `/api/docs` e `/api/openapi.json` sono rotte di servizio senza azione UI corrente.

## 4. Attivazione target per pagina e pubblico

Questa è una proposta di integrazione, distinta da `useAutoRun` attuale. Attivare un prodotto significa leggere dati coerenti dalla cache o caricarli se mancanti; navigare non impone un nuovo POST.

| Contesto | Prodotti necessari |
|---|---|
| Home `moon` | Cataloghi, manifest/immagini, GLOBE se luce accesa; COVERAGE se necessario. Nessuna valutazione puntuale per sola selezione/globo. |
| Explore | Come Home + confronto regionale dopo U01/U02/U03; non mostrare frazioni mock sotto una data reale. |
| `site`, tutti | TERRAIN A → SCENARIO A; ECLIPSES; SYSTEM per miniatura/aperta; confronto candidati dopo accordo. |
| Student | CompareCard, LightCalendar, NextEclipse/Strip, spiegazioni. CompareCard oggi legge anche current/previous dei candidati: non ometterli se resta questo confronto. |
| Teacher | Come site + PREVIOUS A per MonthInNumbers; BestWindows, LightCalendar, Prompts. |
| Planner | Come site + PREVIOUS A; PeriodPanel, BestWindows, DayHourMap, EventList, DataSource. Se compare attivo: prodotti B con input B. |
| Brand kit | Nessun nuovo prodotto scientifico; controlli dimostrativi censiti. |

Le schede derivano da [sectionsFor](../frontend/src/screens/SiteScreen.tsx#L51-L130). Cambiare audience non cambia il modello; abilita prodotti di schede prima assenti. NextEclipse e Strip condividono dati; B non è uno dei tre candidati di CompareCard. Le dipendenze e le chiavi sono nel [piano Query](api-query-plan.md).

## 5. Azioni trasversali

La [mappa completa](api-integration-map.md#2-tutti-i-punti-di-interazione) contiene ogni binding con stato e righe. Queste regole valgono per tutte le sue istanze:

| Azione | Parametri / prodotti da attivare, solo se mancanti |
|---|---|
| Selezionare punto A, tile, marker, riga; commit coordinate valido | Nuovo `site` → TERRAIN → corrente, eventuale precedente/eclissi. Globo/orbite globali riusati. Il centro di un poligono non è un rappresentante operativo approvato. |
| Digitazione, ricerca, menu, apertura calendario, navigazione mesi | Solo stato locale. Submit/blur valido applica le coordinate; il testo invalido non genera job. |
| Data da strip/spin/giorno/Today/frecce | T_A esatto → corrente/precedente e prodotti globali attivi; terreno riusato, T_B invariato. |
| D / passo / h | D cambia i range A/B e azzera cursore; passo cambia le serie A/B; h A richiede nuovo terreno A e dipendenze. B conserva h propria. |
| Compare B / scelta B | Prodotti B mancanti; stesso payload A/B condivide cache. Chiusura non cancella job condivisi. |
| Ordinamento / Area / primi N | Filtro/ordine locale su risultato completo; prodotto regionale aggiuntivo solo se realmente necessario e dopo U01/U02/U03. Nessuna chiamata assegnata a Best universale. |
| Luce globo / DEM overlay | GLOBE a T se on, luce piatta se off; overlay legge COVERAGE. Nessun terreno per disegnare l'overlay. |
| Aprire orbite / fullscreen / frame / scala | SYSTEM solo se manca copertura; miniatura e vista grande condividono serie. Frame e scale visuali sono locali. |
| Play/pause/Space/scrub/±6h/velocità/click giorno, ora, finestra o evento | Cambia cursore, non T: nessuna nuova analisi. Leggere serie/intervalli disponibili, senza fetch per frame. |
| Go to eclipse / evento strip | `T=floor((maxMs−2 giorni)/1 ora)*1 ora`, `offset=maxMs−T`, playback fermo. Come cambio T, senza perdere l'offset con un reset generico. |
| Drag globo/panorama, Look/Lens/Paths, hover | Camera/rendering/tooltip locali; Cesium può scaricare immagini per la vista, senza calcoli scientifici. |
| CSV intervalli/eventi | Export locale dei dati coerenti già caricati; nessun endpoint export necessario per il formato corrente. |
| Retry | Riprendere stadio mancante con lo stesso fingerprint, conservando dipendenze valide; protocollo failed/scaduto U04. |
| Link fonte / preview Brand kit senza handler | Navigazione esterna / nessuna operazione. Non inventare API per icone dimostrative. |

## 6. Stati e casi limite

Ogni prodotto ha stato autonomo: un errore eclissi non deve cancellare un panorama valido; baseline mancante non è zero.

| Stato / evento | Regola target |
|---|---|
| Input invalido o incompleto | Nessun job; errore del campo. Testo digitato distinto da parametro applicato. |
| Valido, dati assenti | Caricare dipendenze della pagina; scenario solo dopo terreno pronto. |
| Stessa richiesta già in corso | Condividere query, senza POST per ogni scheda. Dedup server U04 separata. |
| Input cambia durante job | Nuova chiave, annullare attese inutilizzate, ignorare risposte obsolete. Ordine di arrivo non decide quale risultato mostrare. |
| Stessa scelta / nome diverso ma stessi valori | Nessuna nuova analisi. Non usare identità dell'oggetto come identità scientifica. |
| Risultato precedente durante caricamento | Anteprima esplicitamente etichettata con vecchi parametri; non usarla per KPI/CSV del nuovo input. |
| Terreno valido, scenario fallito | Retry scenario, senza rifare terreno. |
| Previous fallito | Corrente resta utilizzabile, delta non disponibile; retry della sola baseline. |
| Un candidato fallito | Stato per riga; non azzerare gli altri con Promise.all. |
| HTTP/payload errato, failed, job scaduto | Errore esplicito e protocollo U04, nessun loop di POST infinito. |
| Partial/NoData/unknown | Motivo e copertura; niente false/0 o interpolazioni attraverso buchi. |
| Nessun evento nel range completo | Lista vuota valida con range; distinguere errore e ricerca incompleta. |
| Bordo del range/cache | Non è un tramonto o evento fisico; clipping e limiti inferiori espliciti. |
| Back/forward, deep link, reload | Attivazione della route. Oggi input non persistiti né serializzati in URL; solo audience persistita. Ripresa job/cache U04/U08. |
| StrictMode, remount, focus, reconnect | Nessuna assunzione di effetto eseguito una sola volta; opzioni Query e dedup esplicite. |

Problemi osservati: [Building](../frontend/src/ui/Building.tsx#L108-L116) e [CSS](../frontend/src/ui/ui.css#L975-L985) nascondono i figli con opacità senza disabilitare i controlli. [SiteScreen](../frontend/src/screens/SiteScreen.tsx#L185-L193) mostra retry solo senza evaluation; errori con dati vecchi possono restare poco evidenti. `useAutoRun` non osserva raggio/passo azimutale; la guardia di `runScenario` non confronta tutti i parametri. Sono evidenze da gestire nell'integrazione, non fix già applicati.

## 7. Vincoli scientifici per i nuovi DTO

Il [dizionario](api-data-dictionary.md#4-requisiti-scientifici-non-espressi-dal-client) associa requisiti e consumatori. Il significato è approvato, la proiezione HTTP finale U02:

- `fSunTerrain`, `fSun` dall'unione delle occultazioni terreno/Terra, `fEarth` geometrica; C3 ≥0,5, non semplice centro sopra orizzonte.
- Buio completo `fSun=0`, luce ridotta `0<fSun<0,5`, sotto soglia `fSun<0,5` distinti. `longestOffMs` degli intervalli C3 non dimostra notte completa.
- Eventi raffinati e cause, clipping, dati mancanti, copertura e limiti inferiori; nessun limite scientifico arbitrario di un mese, 365/800 giorni o precisione 1 s.
- P50 sull'anno UTC completo 365/366 giorni, eclissi incluse; 80% è evidenziazione del team, non idoneità universale.
- Slope su supporto circolare diametro 100 m, qualità e fasce `[0,5)`, `[5,10)`, `[10,15)`, `≥15`; nessuna esclusione automatica a 10°.
- B(T) senza filtro slope; A5/A10/A15 cumulative; denominatori, copertura per metrica e componente connessa a quattro vicini. Nessuna rimozione automatica delle regioni.
- Confronto per metrica esplicita e dati della stessa cella quando combinati in un punto; nessun vincitore universale.
- T±1/2/3 giorni: alternative regionali e persistenza delle stesse celle separate, senza nascondere buchi o comprimere i versi nel minimo.
- Horizons è la fonte scelta; quantità globali 14/15/19/20 e adapter da validare. Il campo legacy `kernels` non introduce un requisito SPICE.

## 8. Consegna allo sviluppatore

Prima di chiudere gli schemi scientifici risolvere U01/U02/U03/U06/U09; poi implementare prodotti, protocollo U04 e limiti verificati U05/U07. Collegare i cataloghi con ID/geometrie/provenienza, preservando il formato nativo. Integrare query/trasporto nei 42 punti indicati e sostituire tutti i percorsi mock/locali censiti, compresi orbite ed eclissi.

Dopo modifiche ai file censiti eseguire dalla radice `python3 scripts/verify_api_integration.py`. Il controllo verifica hash, ancore e link; non avvia UI/API e non riscrive il manifest. Aggiornare solo numeri di riga e hash non sostituisce una nuova revisione del comportamento. La verifica scientifica richiede inoltre le evidenze previste dai criteri approvati.

Verifiche di questa revisione: 43 sorgenti frontend e 55 file censiti, 1.000 ancore di codice e 725 link locali validati; controllo negativo con modifica simulata del frontend correttamente rifiutato; tabelle Markdown e frammenti JSON verificati. Lo snippet Query è stato controllato con TypeScript e React Query 5.107.1 in una cartella temporanea, senza aggiungere dipendenze al progetto. Questi controlli attestano la coerenza documentale, non l'accuratezza dell'engine o tutte le combinazioni di runtime.
