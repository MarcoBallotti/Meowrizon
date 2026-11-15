# Dati richiesti dalle visualizzazioni

Revisione 3.0. Leggere insieme al [contratto](api-contract.md), alla [mappa dei controlli](api-integration-map.md) e al [piano Query](api-query-plan.md). **Esistente** indica un campo letto dal codice; **requisito** indica un'informazione necessaria secondo i criteri approvati; **proposta** non è un DTO implementato. Nessun valore numerico illustrativo è un risultato scientifico.

## 1. JSON e tipi già dichiarati nel client

La definizione completa, incluse proprietà annidate e opzionali, è in [api/types.ts](../frontend/src/api/types.ts#L17-L169). Tutti i modelli del frontend sono elencati nella [mappa, sezione 6](api-integration-map.md#6-modelli-e-campi-dichiarati-nel-frontend) e nel JSON con righe e hash. Questa tabella consente di leggere il formato senza dedurlo dai componenti.

| Risposta / oggetto | Campi effettivi | Vincoli per un adapter compatibile |
|---|---|---|
| `CoverageCatalog` | `origin`, `products: DemProduct[]` | `origin: demo\|engine`. |
| `DemProduct` | `id,title,pixelSizeM,latMinDeg,latMaxDeg,source,url,notes,available` | Pixel dichiarato distinto da risoluzione effettiva; `available` significa preparato dall'engine, non solo esistenza di una fonte pubblica. |
| `JobState<T>` | `id,status,progress?,message?,result?,error?:{code,message}` | Progress 0–1 se stimabile; result completo in completed, messaggio d'errore in failed. Id job distinto dall'id risultato. |
| `TerrainAnalysis` | `id,origin,preview,profile` | `preview` è booleano; nessun protocollo di sostituzione preview/finale è implementato nel client. |
| `HorizonProfile` | `azimuthDeg:number[]`, `elevationDeg:number[]`, `observer,dem,params,algorithmVersion,warnings` | Array paralleli, azimut crescente su [0,360); interpolazione client attuale assume passo uniforme e chiusura ciclica. Elevazioni possono essere negative. |
| `profile.observer` | `site:{latDeg,lonEastDeg}`, `surfaceHeightM:number\|null`, `heightAboveSurfaceM`, `referenceRadiusKm` | Null è ammesso solo per surfaceHeight nel DTO attuale. Non serializzare NaN/Infinity. |
| `profile.dem` | `productIds:string[]`, `effectivePixelSizeM`, `noDataFraction` | NoData 0–1, prodotto identificabile nel catalogo. Il DTO non rappresenta i settori di orizzonte unknown. |
| `profile.params` | `azimuthStepDeg,maxDistanceKm` | Eco della configurazione effettivamente usata. |
| `ScenarioEvaluation` | `id,origin,terrainAnalysisId,timeScale,timesMs,sun,earth,intervals,visibilityModel,ephemeris,approximations` | `timeScale: UTC`, `visibilityModel: body-center` nel tipo legacy, non nel modello target. |
| `BodyTrack` (sun/earth) | `azimuthDeg:number[]`, `elevationDeg:number[]`, `horizonDeg:number[]`, `centerVisible:boolean[]` | Array paralleli a timesMs crescente; client non supporta null/unknown per campione. I booleani non sono frazioni visibili. |
| `intervals` | `sun:TimeInterval[]`, `earth:TimeInterval[]`, `both:TimeInterval[]` | Intervalli ordinati, senza sovrapposizioni per canale; `both` è concomitanza. Il client usa `startMs<=t<endMs`. |
| `TimeInterval` | `startMs,endMs` | Millisecondi UTC. Non contiene completezza, causa o precisione: insufficiente per gli eventi target. |
| `ephemeris` | `source,version,kernels:string[],corrections` | Metadati della fonte realmente usata. `kernels: []` possibile con Horizons, nessun obbligo SPICE. |
| `approximations,warnings` | Array di stringhe | Conservare provenienza e limiti; non etichettare `engine` un fallback sintetico. |

Richieste esatte: `TerrainAnalysisRequest={site,observerHeightM,config:{azimuthStepDeg,maxDistanceKm}}`; `ScenarioEvaluationRequest={terrainAnalysisId,startUtc,stopUtc,stepMinutes}`. Esempi serializzati e periodi nel [contratto](api-contract.md#richieste-del-client-esistente).

**Invarianti da verificare all'ingresso del futuro adapter**, non già validate dal trasporto: tipi e unità; array non vuoti e della stessa lunghezza; tempi monotoni; copertura coerente col range; intervalli validi e ritagliati per i calcoli di periodo; riferimento terreno corretto; provenienza. `bodyAt` oggi blocca l'interpolazione ai campioni estremi, quindi può mostrare una posizione vecchia se non si verifica il range. `intervalStats` assume intervalli già pertinenti al range e ne somma la durata senza clipping interno. Non passargli intervalli estesi oltre il periodo senza adattarlo.

Il server `bd9e7c3` implementa [GET /api/coverage](../backend/app/api/coverage.py#L9-L12) con `{ "origin": "engine", "products": [] }`. È un catalogo vuoto valido: non un errore HTTP, non la prova che esista un DEM pronto, e non autorizza un fallback ai prodotti demo.

## 2. Cataloghi: il server non restituisce RegionCatalog mock

### GeoJSON attuale, già implementato

Sorgenti: [router](../backend/app/api/regions.py), [costruzione](../backend/app/services/regions/build.py#L80-L220), [catalogo regioni](../backend/catalog/regions.toml), [catalogo siti](../backend/catalog/sites.toml).

| Livello | Campi presenti nel costruttore server |
|---|---|
| Collection | `type:FeatureCollection`, `features`, `meowrizon:{kind,generated_at,reference,sector,cell_size_m,source?}`. Source è aggiunto alla collection delle regioni. |
| `reference` | `body,sphere_radius_m,frame,lonlat,projection_m`. È riferimento lunare; un viewer terrestre non deve reinterpretare questi dati come geodesia terrestre. |
| `sector` | `name,lat_limit`. Le regioni che intersecano il settore sono mantenute intere. |
| Feature regione | `type:Feature`, `id`, `geometry:{type:Polygon,coordinates:[ring]}`, `properties`. Coordinate `[lonEastDeg,latDeg]`; anello chiuso e densificato. |
| properties regione | `id,name,moontrek_label,lists,active,area_km2,center_lon,center_lat,lat_min,lat_max,corners_m,bbox_m,cell_size_m,cells_x,cells_y,grid_aligned,dem_near,dem_covering`. `cells_x/y` possono essere null se non allineata. |
| Feature sito | `type:Feature`, `id`, `geometry:{type:Point,coordinates:[lon,lat]}`, `properties`. |
| properties sito | `id,name,kind,date,source,note,in_sector,cell_size_m,x_m,y_m,cell_bounds_m,region,dem_near,dem_covering`. Fuori settore: x/y/bounds/region/dem_near null, dem_covering vuoto nel codice corrente. |

Qui esistono nomi **snake_case**; non dichiarare tutto il repository camelCase. Il DTO scientifico client usa camelCase, l'adapter dei cataloghi deve convertire esplicitamente i campi necessari e conservare il payload nativo. Il router restituisce 503 `detail` stringa se i file non sono inizializzati; `active` assente include tutte le regioni, `true` solo attive, `false` solo inattive. Non chiamare entrambi i cataloghi “regioni”.

Il catalogo corrente contiene le 13 regioni storiche NASA 2022, due attive (`de-gerlache-rim-2`, `malapert-massif`), e 16 siti separati. Le cifre descrivono i TOML censiti, non limiti fissi delle API. I `center_lon/lat` sono centri geometrici: non dimostrano che quella cella sia rappresentativa delle metriche regionali.

### Formato mock da sostituire

[RegionCatalog](../frontend/src/domain/ranking.ts#L11-L29) è `{origin,note,period:{days},regions:Region[]}`. Ogni Region ha `id,name,area,center:{latDeg,lonEastDeg},sunFraction,earthFraction,bothFraction,longestNightH,previous?`; previous ripete le quattro metriche. `Ranked` aggiunge `rank,score,value`. Il JSON mock ha valori per un periodo fisso; non contiene la data della valutazione, copertura, poligoni o qualità.

`ExampleSite` è `{id,name,short,region,latDeg,lonEastDeg}`. `usePlaces` fonde esempi e mock deduplicando per nome; `runComparison` cerca la regione di A per nome. Per l'integrazione serve un'identità tipizzata regione/sito/punto libero e gli ID server. Non convertire `in_sector:false` in `Equatorial` automaticamente; non inventare un `short` ufficiale se è solo un'etichetta locale. U03 resta aperta.

## 3. Dato → consumatore → intervento

Questa tabella indica i campi letti e i calcoli già locali. Le callback e i loro parametri sono censiti individualmente nella mappa. Nessun endpoint aggiuntivo è necessario solo perché due grafici mostrano gli stessi intervalli.

| Consumatore / sorgente | Dati attuali | Dato o adeguamento target |
|---|---|---|
| [Home/Explore, usePlaces e righe](../frontend/src/screens/MoonScreen.tsx#L80-L131) | Esempi, RegionCatalog, rank e center; lookup nome/ID | Cataloghi reali separati; metriche regionali con semantica/data/qualità dopo U01/U02/U03. |
| [Ranking e trofeo](../frontend/src/domain/ranking.ts#L31-L65) | Pesi 0.4/0.3/0.15/0.15, cap notte 354h, tie-break score | Non trasportare lo score nel nuovo engine; UI e candidati aperti U01. |
| [Globo, luce](../frontend/src/features/MoonGlobe.tsx#L140-L166) | `subSolarPoint(T)` locale → vettore Cesium | GLOBE: direzione Moon-fixed dal backend a T; nessuna dipendenza da coordinate/altezza A. |
| [Globo, immagini/overlay](../frontend/src/features/MoonGlobe.tsx#L43-L89) | Due layer NASA fissi, bande latitudine hardcoded, DEM_CATALOG demo | VIS_CONFIG/MAP_TILE proposti; coverage reale, formati/griglie e provenienza. Bande e disponibilità distinte. |
| [Panorama](../frontend/src/features/HorizonScene.tsx#L76-L100) | profile.azimuth/elevation; bodyAt su serie sole/terra/intervalli | Orizzonte + tracce topocentriche, copertura e segmenti validi. Camera/FOV/Paths locali. |
| [Dischi, fase, eclissi nel panorama](../frontend/src/features/HorizonScene.tsx#L227-L246) | Diametri medi, fase da separazione, copertura sul diametro | Diametri apparenti e geometria/fase fisica dal backend; frazioni areali di occultazione separate dalla magnitude sul diametro. |
| [Now / storie / planner](../frontend/src/features/Report.tsx#L25-L62) | az/el/H, visible, span.since/until, margine el−H | Stato C3 e frazioni; eventi/cause veri, fine copertura non evento. Testi “power/radio” non sono risultati ingegneristici. |
| [Timeline](../frontend/src/features/Timeline.tsx#L42-L85) | intervals.sun/earth/both, B opzionale; eclipseIntervals locale | Intervalli scientifici raffinati + eventi eclissi; nessuna riclassificazione da campioni o chiamata per frame. |
| [MonthInNumbers](../frontend/src/features/Report.tsx#L99-L123) | fraction di sun/earth/both; longestOff; delta previous | Periodi coerenti. Separare longest full-dark da longest sotto-C3; previous è T−D..T. |
| [PeriodPanel A/B](../frontend/src/features/Report.tsx#L244-L338) | Come sopra, longestOn, count, previous; B propri input | A e B indipendenti. “Sunrises” da eventi effettivi, non numero degli intervalli clipped. |
| [LightCalendar](../frontend/src/features/DeepDive.tsx#L74-L146) | Ore per bin T+d*24h e T+(d+1)*24h; click a +12h | Bin rolling a partire da T, non automaticamente giorni civili UTC se T ha un'ora. API restituisce intervalli, aggregazione visuale locale. |
| [DayHourMap](../frontend/src/features/DeepDive.tsx#L154-L247) | Overlap ≥0.5h indipendente Sole/Terra per casella | “Both” deve riflettere concomitanza, non due mezze ore disgiunte; usare intervals.both e chiarire la legenda. |
| [BestWindows](../frontend/src/features/DeepDive.tsx#L317-L382) | intervals.both, filtro locale ≥24/72/168h | Finestra C3 con clipping/completezza. Filtro visuale non limite fisico della ricerca né certificazione di atterraggio. |
| [CompareCard/bars](../frontend/src/features/DeepDive.tsx#L490-L514) | A e tre candidati current/previous; sun/earth/both/nightH | Comparazione omogenea dopo scelta candidati U01; stessi parametri e stessa cella per KPI puntuali, errori per riga. |
| [EventList/CSV](../frontend/src/features/DeepDive.tsx#L391-L435) | Bordi intervalli, euristica >60s dal bordo, eclissi locali | Eventi backend, cause e clipping; non perdere eventi reali entro 60s dal bordo. CSV è locale. |
| [NextEclipse / Strip](../frontend/src/features/EclipseCards.tsx#L14-L29) | SiteEclipse da modello globale + orizzonte al massimo | ECLIPSES locale/topocentrico, eventi/contatti e osservabilità concordata U06; entrambe le schede condividono il prodotto. |
| [Miniatura e OrbitView](../frontend/src/features/OrbitView.tsx#L56-L96) | geocentric(t), moonPath, eclipseGeometry/magnitude, moonLat | SYSTEM globale condiviso; frame/correzioni U09, scale e proiezione restano locali. |
| [DataSources](../frontend/src/features/Report.tsx#L340-L418) | profile.dem/params/observer/warnings; coverage; ephemeris/approximations | Metadati realmente usati e qualità; non scegliere prodotto per sola latitudine quando manca analisi valida. |
| [Prompts/Why](../frontend/src/domain/story.ts) | Regole testuali su stato/margine Sole/Terra | Restano presentazione; nessuna API AI necessaria per le funzioni attuali. Unknown richiede testi dedicati. |
| [Loading/errore](../frontend/src/screens/SiteScreen.tsx#L132-L193) | phase,progress,error,stale e presenza evaluation | Stato per prodotto e corrispondenza fingerprint; controlli oggi non tutti bloccati dall'overlay. |
| [Brand kit](../frontend/src/screens/KitScreen.tsx) | Valori dimostrativi, state locale e icone senza callback | Nessun dato backend da inventare. |

### Richieste aggiuntive proposte: parametri determinati dal codice

**ECLIPSES:** la finestra visuale attuale è `from=floor(T_A/DAY)*DAY−3*DAY`, `to=from+2*365.25*DAY`. POST proposta `{terrainAnalysisId,startUtc:ISO(from),stopUtc:ISO(to)}`; nessun D del grafico o stepMinutes necessario al calendario. Il range di circa due anni è un'esigenza di navigazione della UI, **non un limite scientifico alla ricerca degli eventi**. La copertura reale può essere parziale e deve essere dichiarata. Cambiare ora nello stesso giorno non cambia questa chiave; cambiare punto/h/orizzonte cambia l'osservabilità locale.

L'oggetto oggi consumato è `SiteEclipse extends SolarEclipseFromMoon`: `startMs,maxMs,endMs,totalStartMs:number|null,totalEndMs:number|null,kind:partial|total,magnitude,visible:boolean,sunElevationDeg`. `magnitude` nel modello locale misura diametro occultato, non frazione di area. Mancano nel DTO attuale: provenienza, geometria topocentrica verificata, identità evento stabile, precisione, contatti incompleti e stato unknown del badge. Queste informazioni sono requisiti; i loro nomi HTTP finali non sono stati approvati. Non usare `visible:false` per codificare dati mancanti.

**SYSTEM:** richiedere un range che contenga lo scenario e i cammini intorno al cursore. Il codice ricampiona il cammino su un bucket di 6 ore, con estremi ±14 giorni e punti ogni 12 ore. Margine conservativo di caricamento proposto: `T_A−(14 giorni+6 ore)` → `T_A+D+(14 giorni+6 ore)`. Non fare un POST ogni 6 ore simulate: l'intera copertura si riusa. Il passo del prodotto SYSTEM non è stato scelto; i 12h del disegno corrente non garantiscono accuratezza per contatti o animazioni.

Il modello locale restituisce `GeocentricState={moon:[x,y,z],sun:[x,y,z],F,node}` in km, eclittica di data. F/node sono intermedi del modello locale, non campi obbligatori di una futura risposta backend. Servono posizioni vettoriali rispetto a un'origine/frame/epoca espliciti, tempi, distanze/diametri fisici e geometria eclissi necessaria alla vista. Frame e adapter U09; nessun `ECLIPJ2000` implicito. Distinguere geometria globale e topocentrica; una magnitude globale non sostituisce il risultato al sito. Ingrandimenti ×4/×60 e distanza illustrativa della vista sono presentazione, non misure API.

**GLOBE:** query `utc=ISO(T_A)`. Servono direzione Sole nel frame fisso lunare e metadati di fonte/frame/correzioni/epoca. L'equivalente del `subSolarPoint` attuale può essere convertito in vettore dal renderer senza eseguire un modello astronomico locale. Nomi del JSON da concordare; il dato non è l'az/el topocentrico di A. Nessuna richiesta per hover/camera.

**VIS_CONFIG/MAP_TILE:** il codice usa `LRO_WAC_Mosaic_Global_303ppd_v02` e `LRO_LOLA_Shade_Global_256ppd_v06`, `style=default`, `tileMatrixSet=default028mm`, schema geografico 2×1 al livello zero e maximumLevel 7. Sono valori client, da verificare contro Capabilities; non attribuirli automaticamente a qualunque layer. Il manifest proposto deve dichiarare ID, URL/template autorizzato, stile, matrix set, formato, livelli, schema/griglia, credits, disponibilità e versione. Una tile è un'immagine, non una risposta `CoverageCatalog`; caching immagini può restare a Cesium/HTTP, senza inserire ogni tile in Query. Nessun proxy arbitrario di URL upstream forniti dall'utente è necessario.

## 4. Requisiti scientifici non espressi dal client

Questa tabella specifica le informazioni da trasportare, **senza inventare il JSON finale**. È il lavoro U02 da chiudere insieme al backend. Le formule e le convenzioni approvate sono in [criteri-algoritmo.md](criteri-algoritmo.md); non si possono risolvere con un semplice cast a `ScenarioEvaluation`.

| Dato richiesto | Significato / metadati minimi | Dove serve |
|---|---|---|
| fSunTerrain, fSun, fEarth | Frazioni [0,1]; fSun calcolata sull'unione delle occultazioni; fEarth indipendente dalla fase luminosa. | Stato, panorama, timeline, percentuali e confronto. |
| Classificazione C3 | fSun/fEarth ≥0.5; stato unknown separato; modello/soglia/versione espliciti. | Tutte le rappresentazioni di visibilità. |
| Buio completo / luce ridotta / sotto soglia | fSun=0 / 0<fSun<0.5 / fSun<0.5, cause e tolleranze dichiarate. | “Longest night”, storie, eventi, periodi e finestre. |
| Eventi e finestre | Inizio/fine/massimo se noto, causa, già in corso a T, residuo, ricerca fino al limite reale; precisione misurata. | Countdown, eventi, eclissi e finestre. |
| Completezza temporale | Start/end clipped, segmenti validi, buchi, limite esaminato, durata verificata inferiore se fine ignota. | Non trasformare fine cache in tramonto; non attraversare buchi interpolando. |
| Az/el/H/margine | Centro geometrico, orizzonte nella direzione, margine separato dalle frazioni. | Planner Now e panorama; non classificare dischi irregolari col solo margine. |
| Diametri/fase/occultazione | Diametri apparenti, frazione illuminata della Terra distinta da visibilità geometrica, occultazione terrestre e combinata. | Rendering corpi ed eclissi. Magnitude su diametro non è percentuale areale. |
| Slope | Gradi, supporto circolare diametro 100m, fit/DEM/qualità/incertezza; quattro fasce descrittive. | Valutazione puntuale e regionale futura. La UI attuale non ha tutti questi controlli/pannelli. |
| P50 annuale | Anno UTC e durata 365/366 giorni, integrazione fSun≥0.5, copertura/denominatore, eclissi incluse. | Valutazione scientifica futura; non è la fraction del periodo D o fSun media. |
| Geometria regionale | ID e poligono intero, celle 100×100m ritagliate, aree sferiche; dati per metrica. | Aggregazioni e confronto, non riuso delle frazioni del centro come medie regionali. |
| B(T), A5/A10/A15 | B con Sole+Terra C3 e geometria valida, senza slope; aree cumulative sotto 5/10/15; km² e % area totale con denominatore. | Confronto esplicito; non sommare le cumulative. |
| Copertura e spiegazioni | Sole, Terra, intersezione, sconosciuti; area valida e non valutabile per metrica, parziale come limite inferiore. | Nessuna concomitanza nota non equivale a intera regione sfavorevole. |
| Componenti connesse | Area totale e maggiore componente per B e A5/A10/A15, quattro vicini; unknown non connette componenti. | Confronto senza area minima universale. |
| Identità del punto rappresentato | ID cella e coordinate, criterio selezione; tutti i KPI combinati dello stesso punto. | Non combinare massimi di celle diverse in un sito inesistente. Selezione U03. |
| Sensibilità date | Risultati a T±1/2/3d, buchi, alternative regionali distinte dalla persistenza delle stesse celle per verso/k. | Analisi futura: nessun minimo fra versi usato come score universale. |
| Provenienza/riproducibilità | Fonti effettive, revisioni, DEM, altezza/config, correzioni/frame, algoritmo, approssimazioni e stato validazione. | Ogni prodotto e fingerprint cache; non solo un badge globale. |

Non sono implementati nel frontend tutti i pannelli del nuovo algoritmo. L'assenza di un bottone non autorizza a riciclare un campo con un significato diverso: le necessità scientifiche future e i consumatori UI attuali restano distinguibili. Limiti e accuratezza devono derivare dall'engine validato, non da numeri scelti per completare questa tabella.

## 5. Esportazioni e dati che restano locali

- `downloadCsv` in Report esporta `body,start_utc,end_utc,duration_h` per intervalli Sole/Terra/Both del risultato A già presente; `exportEvents` in DeepDive esporta `event,utc`. Verificare origine, range e stato coerenti prima di abilitare. Il formato futuro con cause/unknown è da concordare se si estende l'export.
- Delta è sottrazione di metriche omogenee current/previous; per frazioni visualizzate in percentuale è differenza in punti percentuali. Nessun risultato delta se baseline o denominatori non sono confrontabili.
- Testi per pubblico, nomi brevi, palette, FOV, dimensioni grafiche, cursore, velocità, tooltips, scala orbite e soglia visuale 24/72/168h restano UI.
- Nessun login, salvataggio scenario remoto, telemetria, API AI o API export è invocato dalle interazioni censite. Se introdotti in futuro richiedono un nuovo flusso documentato.
