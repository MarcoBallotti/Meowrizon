# Frontend

React 19 + TypeScript + Vite + CesiumJS. Tre viste sincronizzate:

- **Globo lunare**: scelta del punto.
- **Orizzonte locale**: profilo del terreno, Sole e Terra.
- **Timeline**: finestre di illuminazione e visibilità terrestre.

## Avvio

Con Docker, dalla radice del repository: `npm start` avvia frontend (http://localhost:5173) e backend insieme; `npm run prod` avvia la versione compilata servita da nginx su http://localhost:8080. In Docker Vite inoltra `/api` al servizio `backend` e controlla i file a intervalli, così il ricaricamento funziona anche su Windows. Dettagli e altri comandi nel [README principale](../README.md).

Senza Docker, dalla radice del repository, con Node indicato in `.nvmrc`:

```sh
nvm use
npm install
npm run dev
```

Altri comandi: `npm run build` (type-check + build), `npm run lint`, `npm run preview`. Da `frontend/`, `npm test` verifica adapter dei cataloghi, identità, rifiuto di payload invalidi e assenza di fallback per copertura sconosciuta.

## Fonte dei dati

| `VITE_DATA_SOURCE` | Comportamento |
|---|---|
| `demo` (opzionale) | `DemoProvider`: esempi, ranking e analisi sintetici, con badge dimostrativo. |
| `api` (predefinito) | Cataloghi regioni/siti e copertura dal backend tramite `VITE_API_BASE_URL` (predefinito `/api`). In sviluppo Vite inoltra `/api` a `MEOWRIZON_API_ORIGIN`, predefinito `http://localhost:8000` (in Docker `http://backend:8000`). In produzione lo stesso inoltro lo fa nginx (`nginx.conf`). |

Vedere [`.env.example`](.env.example) e il [contratto corrente](../docs/api-contract.md), con [mappa delle interazioni e righe di codice](../docs/api-integration-map.md), [dizionario JSON e visualizzazioni](../docs/api-data-dictionary.md) e [piano TanStack Query](../docs/api-query-plan.md). TanStack non è ancora installato. Verifica delle ancore: `python3 scripts/verify_api_integration.py` dalla radice.

In modalità `api`, picker, ricerca, marker e selettore B usano i siti reali di `/api/sites`. I cataloghi non forniscono punteggi: nella pagina risultati vengono valutati i siti e i centri delle regioni per il periodo scelto. I centri sono stime puntuali, non valutazioni dell'intera regione. Gli ID dei siti e delle regioni sono distinti; i metadati e le geometrie originali sono conservati dagli adapter. Errori di caricamento hanno messaggi e retry senza fallback demo.

### Valutazione di missione e soglia solare

La pagina risultati offre **Mission requirements**: limiti modificabili per visibilità solare, terrestre e simultanea, interruzioni massime, finestra congiunta minima, pendenza locale, residuo RMS del terreno e risoluzione DEM. Data e durata scelte definiscono la finestra di missione; i limiti vuoti sono disattivati. Il filtro solare iniziale è **45% incluso**, una scelta del progetto, non un requisito NASA. I profili vengono validati e salvati localmente.

Prima si verificano i requisiti: un limite violato esclude il candidato; una misura obbligatoria mancante produce **Insufficient data**. Solo i candidati ammissibili entrano nei fronti di Pareto. Il gruppo 1 contiene i compromessi non dominati; i gruppi successivi sono dominati dai precedenti. Si confrontano visibilità, interruzioni e durata congiunta; terreno ed energia partecipano quando abilitati. Un obiettivo opzionale è usato solo quando noto per tutti i candidati ammissibili. Un errore di calcolo rimane distinto da un'esclusione. Le schede mostrano verifiche, limiti e provenienza.

L'indice di visibilità rimane secondario, per ordinare all'interno dello stesso fronte: `300 / (1/S + 1/E + 1/B) * sqrt((1 - N/T) * (1 - R/T))`. `S`, `E`, `B` sono frazioni; `N`, `R`, `T` sono interruzioni massime solari/radio e durata nella stessa unità. Zero visibilità dà zero indice. La demo dispone solo di `N` e usa `1 - N/T`; requisiti sulle misure assenti non vengono considerati soddisfatti. Questo indice non prevale sui requisiti e non è una probabilità di successo. Il margine temporale impostabile estende le interruzioni e riduce le finestre di due margini, uno per bordo; non è una stima statistica d'errore.

Il controllo energetico opzionale usa frazioni visibili del disco solare, distanze Sole-osservatore e timestamp. Assume un pannello idealmente orientato al Sole, potenza netta nominale a 1 AU, carico costante, capacità e carica iniziale della batteria, riserva ed efficienze configurabili. La generazione scala con la frazione visibile e l'inverso del quadrato della distanza. L'integrazione lineare divide ogni intervallo ai cambi di segno del bilancio, gestisce saturazione, domanda non servita e prima violazione della riserva. I valori iniziali sono esempi disabilitati finché l'utente attiva il modello; non descrivono un veicolo reale. Modificare questi parametri o gli altri limiti non richiede nuove effemeridi. Cambiare il filtro solare riesamina i siti saltati.

Le richieste terreno per il confronto includono `includeLocalTerrain: true`. Il backend riusa il DEM nativo PGDA LOLA già caricato: fit planare su un supporto circolare di diametro 100 m, correzione della scala stereografica, almeno 16 pixel validi, pendenza e residuo RMS con prodotto/hash di origine. Il DEM globale ricampionato non risolve questo supporto e restituisce misure sconosciute, mai terreno piano. Non si deducono ostacoli sotto-pixel o sicurezza di un'ellisse di atterraggio.

Metodo ispirato alla separazione tra requisiti obbligatori e confronti descritta da [NASA, Decision Analysis](https://www.nasa.gov/reference/6-8-decision-analysis/) e alla selezione dipendente da architettura e date in [NASA, Lunar Site Selection](https://ntrs.nasa.gov/citations/20250011660). Implementazione indipendente, non validata o approvata da NASA. Traiettorie, obiettivi scientifici, sicurezza dell'intera impronta, modello termico, prestazioni RF, variazioni delle date e incertezza del terreno richiedono ulteriori dati/modelli. Le durate ai bordi sono troncate alla finestra scelta; eventi brevi fra campioni possono sfuggire.

Le richieste di confronto inviano `minSunFraction: 0.45` a `/api/scenario-evaluations`. Dopo il terreno, il backend calcola prima il Sole: se anche la stima superiore della visibilità, senza eclissi e includendo interamente gli intervalli campionati che toccano un estremo visibile, è sotto soglia, non richiede le effemeridi terrestri. I casi al limite proseguono. Il controllo successivo include le eclissi e precede il calcolo della visibilità terrestre e delle finestre congiunte. Un risultato `{ skipped: true, sunFractionUpperBound, ... }` è distinto da una valutazione completa o fallita, e ha una cache separata dalle richieste senza soglia. Il limite riguarda il modello campionato: eventi brevi fra campioni possono sfuggire. Il costo del terreno e del primo controllo solare resta necessario.

La copertura DEM usa solo prodotti dichiarati disponibili da `/api/coverage`: con catalogo vuoto non disegna fasce. Le analisi partono sulla pagina sito: `POST /api/terrain-analyses` e polling `GET /api/terrain-analyses/{jobId}` restituiscono un profilo PGDA reale. `TerrainPanorama` disegna i suoi angoli in SVG, con rotazione e zoom, senza terreno procedurale. Il profilo diventa visibile prima del job scenario: un errore di quest'ultimo non nasconde il terreno. Timeline e statistiche attendono una valutazione disponibile. Eclissi, luce del globo e orbite restano anteprime locali approssimate. I nuovi DTO scientifici richiedono ancora le decisioni U01–U09 del contratto.

Per l'avvio locale: da `backend/`, `.venv/bin/python -m uvicorn app:app --port 8000`, e inizializzare i cataloghi con `.venv/bin/python -m app.cli init-regions`. Da `frontend/`, `npm run dev` usa API per default; `VITE_DATA_SOURCE=demo npm run dev` abilita la demo. Eventuali `.env` locali con `VITE_DATA_SOURCE=demo` vanno cambiati o sovrascritti con `VITE_DATA_SOURCE=api`. Dopo cambi di ambiente riavviare Vite; per produzione ricompilare il bundle.

La mappa statica e gli hash dell'audit precedente non descrivono questa integrazione: `verify_api_integration.py` segnala i sorgenti modificati e richiede una nuova revisione della mappa, non solo nuovi hash.

## Struttura

```text
src/
  api/          types.ts (contratto), httpProvider, demoProvider, jobs (polling)
  domain/       siti di esempio, formattazione, lettura di campioni e intervalli
  state/        store esterno (useSyncExternalStore) e runner dei lavori
  screens/      Home/Explore (MoonScreen), SiteScreen, Brand kit
  features/     globo, panorama, timeline, report, eclissi, orbite e grafici
  ui/           componenti condivisi, controlli e DateDial
```

## Scelte implementative

- **Cesium** viene caricato in modo differito, in un chunk separato da circa 1,1 MB gzip. Il plugin in `vite.config.ts` serve `Workers`, `Assets`, `Widgets` e `ThirdParty` dal pacchetto installato in sviluppo e li copia in `dist/cesium` durante la build. Non serve un token Cesium ion.
- **Globo**: ellissoide `Ellipsoid.MOON` (sfera da 1737,4 km), senza atmosfera né nebbia. Immagini LRO WAC (NASA/GSFC/ASU) via WMTS Moon Trek, schema geografico 2×1. Il globo serve solo alla visualizzazione: non c’è terreno 3D e nessuna classificazione deriva dal rendering.
- **Cursore temporale**: aggiorna le viste interpolando i campioni già caricati e leggendo la visibilità dagli intervalli forniti dal motore. Non genera richieste.
- **Richieste**: partono 350 ms dopo l'ultima modifica di uno scenario. Una richiesta superata viene annullata nel client; il nuovo run cancella i risultati precedenti per non associare il terreno vecchio al nuovo punto. Il job backend può terminare e conservare il risultato in cache.
- **Confronto A/B**: durata e passo sono condivisi. L’asse della timeline è il tempo trascorso dall’inizio di ciascuno scenario e la scala verticale dell’orizzonte è comune.

## Limiti noti

- Orizzonte PGDA disponibile per siti polari a sud di 80°S (polo esatto escluso), con DEM a 20 m entro 5 km e 240 m oltre. È un profilo campionato, non terreno 3D né una certificazione scientifica. Sole/Terra, statistiche di illuminazione e valutazione delle regioni restano da implementare; con `demo` i numeri sono sintetici.
- Le immagini equirettangolari si deformano vicino ai poli. Un mosaico polare stereografico richiederebbe tessere preparate apposta.
- Le coperture DEM mostrate sul globo sono le fasce dei prodotti disponibili dichiarate dal backend: non certificano il cerchio di una singola analisi.
