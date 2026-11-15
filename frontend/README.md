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

Altri comandi: `npm run build` (type-check + build), `npm run lint`, `npm run preview`.

## Fonte dei dati

| `VITE_DATA_SOURCE` | Comportamento |
|---|---|
| `demo` (predefinito) | `DemoProvider`: orizzonte procedurale ed effemeridi analitiche approssimate. Il badge «Dati dimostrativi» resta sempre visibile. |
| `api` | `HttpProvider` verso `VITE_API_BASE_URL` (predefinito `/api`). In sviluppo Vite inoltra `/api` a `MEOWRIZON_API_ORIGIN`, predefinito `http://localhost:8000` (in Docker `http://backend:8000`). In produzione lo stesso inoltro lo fa nginx (`nginx.conf`). |

Vedere [`.env.example`](.env.example) e il [contratto corrente](../docs/api-contract.md), con [mappa delle interazioni e righe di codice](../docs/api-integration-map.md), [dizionario JSON e visualizzazioni](../docs/api-data-dictionary.md) e [piano TanStack Query](../docs/api-query-plan.md). TanStack non è ancora installato. Verifica delle ancore: `python3 scripts/verify_api_integration.py` dalla radice.

La modalità `api` cambia solo i cinque metodi del provider: ranking, esempi, eclissi, luce del globo e orbite hanno ancora percorsi mock/locali censiti. Gli endpoint scientifici server non sono implementati; regioni, siti, acquisizione dati e coverage (catalogo vuoto, nessun DEM pronto) sono già presenti. I nuovi DTO scientifici richiedono ancora le decisioni U01–U09 del contratto.

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
- **Richieste**: partono 350 ms dopo l’ultima modifica di uno scenario. Una richiesta superata viene annullata e i risultati precedenti restano visibili, attenuati, finché arrivano quelli nuovi.
- **Confronto A/B**: durata e passo sono condivisi. L’asse della timeline è il tempo trascorso dall’inizio di ciascuno scenario e la scala verticale dell’orizzonte è comune.

## Limiti noti

- Backend presente per cataloghi/acquisizione, engine scientifico non ancora implementato o collegato; con `demo` i numeri non hanno valore scientifico.
- Le immagini equirettangolari si deformano vicino ai poli. Un mosaico polare stereografico richiederebbe tessere preparate apposta.
- Le coperture DEM mostrate sul globo sono fasce di latitudine dichiarate, non la disponibilità effettiva dei dati.
