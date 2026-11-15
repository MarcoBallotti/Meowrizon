# Piano di integrazione con TanStack Query

Revisione 3.0. **Proposta per una futura adozione di React Query v5**, verificata sulla documentazione ufficiale il 15/11/2026. Non è una dipendenza del progetto; versione, cache di produzione, persistenza e offline sono U08. Nessun hook o componente dell'app è stato modificato. Il [contratto](api-contract.md) e la [mappa](api-integration-map.md) distinguono gli endpoint disponibili dalle proposte.

## 1. Separare input, dati server e presentazione

Proposta applicativa: mantenere nello store input A/B, route, audience, cursore, playback, camera e filtri. Spostare in query cataloghi, coverage, manifest, job e risultati. Non mantenere contemporaneamente `scenarios.*.run.evaluation` e una query come due copie autorevoli dello stesso risultato. Inserire un QueryClient stabile sopra App in [main.tsx](../frontend/src/main.tsx#L1-L13).

La chiave è un array serializzabile e deve comprendere tutte le variabili usate per ottenere il dato. L'ordine delle proprietà di un oggetto non cambia la sua identità logica; l'ordine degli elementi dell'array sì. [Documentazione Query Keys](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys).

### Chiavi proposte

`N` è un namespace client composto da modalità demo/api, base URL e versione del contratto; aggiungere revisioni effettive di fonti/configurazione quando il backend le espone. Non inventare un `datasetVersion` disponibile oggi. Una revisione sconosciuta non rende un risultato immutabile per sempre.

| Prodotto | Chiave logica | Dipendenze escluse |
|---|---|---|
| REGIONS | `[N,'regions',{active:null\|boolean}]` | T, sito, audience. `null` significa filtro assente. |
| SITES / COVERAGE / VIS_CONFIG | `[N,'sites'\|'coverage'\|'visualization-config']` + revisione se disponibile | Cursore, camera, selezione. |
| Richiesta terreno | `[N,'terrain-request',{site,observerHeightM,config}]` | T, D, stepMinutes, nome, lettera A/B. |
| Stato job terreno | `[N,'terrain-job',jobId]` | Nessun input scientifico aggiuntivo: la richiesta precedente ha già fissato i parametri. |
| Richiesta scenario | `[N,'scenario-request',{terrainAnalysisId,startUtc,stopUtc,stepMinutes}]` | Audience, nome, cursore, route. |
| Stato job scenario | `[N,'scenario-job',jobId]` | PREVIOUS non è un endpoint diverso: il range della richiesta lo distingue. |
| GLOBE | `[N,'globe-state',{utc:ISO(T_A)}]` | Site A/B, altezza, D. |
| ECLIPSES | `[N,'eclipse-request',{terrainAnalysisId,startUtc,stopUtc}]` → job | Range ancorato al giorno UTC nel codice attuale. Non dipende dall'ora se resta nello stesso giorno. |
| SYSTEM | `[N,'system-request',{startUtc,stopUtc,stepMinutes,framePolicy}]` → job | Coord/h del sito e audience. FramePolicy è una decisione U09, non un campo HTTP già supportato. |
| Confronto regionale | `[N,'region-comparison',inputConcordato]` | Non definire inputConcordato prima di U01/U02/U03; nome del controllo “Overall” non basta. |

Canonicalizzare ISO, longitudine e numeri validi prima di costruire chiavi e payload; non arrotondare scientificamente le coordinate per aumentare i cache hit. Le coordinate cliccate sul globo oggi vengono già arrotondate a 4 decimali dal controllo: documentare l'input realmente applicato, senza introdurre altra quantizzazione nascosta. Se gli ID di una richiesta sono un insieme senza ordine, ordinarli per la chiave; mantenere separato l'ordine di presentazione.

## 2. Attivazione e dipendenze

Le query dipendenti possono essere abilitate quando il dato prerequisito è disponibile con `enabled`; gruppi indipendenti possono essere osservati in parallelo con `useQueries`. [Dependent Queries](https://tanstack.com/query/latest/docs/framework/react/guides/dependent-queries).

Grafo applicativo proposto:

1. Cataloghi/coverage/manifest indipendenti secondo necessità della route.
2. Punto e h validi → terreno. Terreno completato → scenario corrente; baseline quando letta dalle schede. Corrente e baseline possono procedere in parallelo dopo il terreno, senza bloccare il corrente per la baseline.
3. Stesso terreno → ECLIPSES se le schede sono necessarie, senza aspettare la valutazione del periodo.
4. SYSTEM e GLOBE sono globali e non aspettano il terreno del sito. Miniatura e pannello grande condividono SYSTEM; NextEclipse e Strip condividono ECLIPSES.
5. B attivo → stessa pipeline con input B e D/step globali. A/B con payload uguali condividono le chiavi, senza includere la lettera.
6. Candidati confronto → pipeline o prodotto regionale concordato; errori per candidato. Non usare “top three” come algoritmo approvato prima di U01.

Abilitazione per route/audience nel [contratto, sezione 4](api-contract.md#4-attivazione-target-per-pagina-e-pubblico). Il click cambia input o stato UI; le query attive risolvono i dati necessari. Non aggiungere `fetch` a Button, Toggle o DateDial.

### Matrice di riuso

| Cambiamento | Terreno | Current/previous | Eclissi locali | Globo | SYSTEM | Confronto regionale |
|---|---|---|---|---|---|---|
| Punto A | Nuova chiave | Nuova dipendenza | Nuova dipendenza | Riuso | Riuso | Nuovo contesto/candidati solo dopo U01/U03 |
| h A | Nuova chiave | Nuova dipendenza | Nuova dipendenza | Riuso | Riuso | Altezza omogenea, politica da concordare |
| T_A | Riuso | Nuovi range | Riuso se stessa finestra UTC | Nuovo T se attivo | Riuso se copertura sufficiente | Nuovo T |
| D | Riuso | Nuovi range A/B attivi | Riuso | Riuso | Estendere se necessario | Nessuna modifica ai criteri fisici; cambiano solo eventuali statistiche sul periodo |
| stepMinutes | Riuso | Nuove serie A/B attivi | Riuso | Riuso | Passo indipendente | Nessun cambio implicito alla precisione scientifica |
| Raggio/passo azimutale | Nuova chiave | Nuova dipendenza | Nuova dipendenza | Riuso | Riuso | Dipende dal modello/config reale |
| T_B / punto B | Solo B | Solo B | A riusa | Riuso | A riusa | Non automaticamente collegato a CompareCard |
| Pubblico / route | Nessun parametro nuovo | Abilitare prodotti letti dalle nuove schede | Cache condivisa | Abilitazione | Abilitazione | Abilitazione |
| Cursore/camera/playback/tooltip | Riuso | Riuso | Riuso | Riuso | Riuso; estensione solo fuori copertura | Riuso |
| Revisione DEM/algoritmo/fonti | Cambia namespace/dipendenze coinvolte | Ricostruire risultati dipendenti | Idem | Solo fonte coinvolta | Solo fonte coinvolta | Idem |

Non invalidare tutta la cache a ogni cambio input: la chiave nuova seleziona il prodotto corretto. Conservare quella vecchia per un ritorno ai medesimi input entro la retention decisa. Un catalogo refreshato può richiedere ricalcolo dei prodotti dipendenti solo se la sua revisione scientifica è cambiata.

## 3. POST e polling: una sola autorità

Le mutation non ritentano per default; la loro chiave non è una cache condivisa di risultati equivalente alle query. Una mutation per ogni scheda non risolve la deduplicazione dei calcoli. [Mutations](https://tanstack.com/query/latest/docs/framework/react/guides/mutations).

**Proposta preferita, subordinata al protocollo U04:** due livelli di query: (a) submit POST per payload canonico → jobId; (b) GET del job per jobId finché terminale. Una POST deve essere intesa dal server come richiesta dello stesso prodotto, con politica di dedup esplicita; TanStack non garantisce exactly-once dopo abort, reload o eviction. In alternativa usare una mutation nel singolo orchestratore di input, distribuendo poi job/risultati tramite query condivise. Non scegliere i retry del POST finché il server non ne definisce la sicurezza.

Nel modello a due livelli `refetchInterval` può dipendere dallo stato della query e restituire `false` a completamento/fallimento. L'API v5 passa la query alla funzione, non direttamente i dati. [Riferimento useQuery](https://tanstack.com/query/latest/docs/framework/react/reference/functions/useQuery).

Esempio **di integrazione futura** sul tipo terreno legacy; endpoint scientifici server ancora assenti. Il codice usa i metodi esistenti, non presume campi nuovi. `pollEveryMs` è una scelta applicativa da passare, non un valore di produzione inventato. Il namespace deve isolare le sorgenti e la sessione/revisione appropriata.

```ts
import { useQuery } from '@tanstack/react-query'
import { provider } from '../api'
import type { JobState, TerrainAnalysis, TerrainAnalysisRequest } from '../api/types'

export function useTerrainRequest(
  namespace: string,
  req: TerrainAnalysisRequest | null,
  needed: boolean,
  pollEveryMs: number,
) {
  const submit = useQuery<JobState<TerrainAnalysis>>({
    queryKey: [namespace, 'terrain-request', req],
    enabled: needed && req !== null,
    queryFn: ({ signal }) => {
      if (!req) throw new Error('Missing terrain input')
      return provider.submitTerrainAnalysis(req, signal)
    },
    retry: false,
    staleTime: Infinity, // riuso del job assegnato, non TTL scientifico universale
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  const submitted = submit.data
  const jobId = submitted?.id ?? null
  const poll = useQuery<JobState<TerrainAnalysis>>({
    queryKey: [namespace, 'terrain-job', jobId],
    enabled: needed && jobId !== null &&
      (submitted?.status === 'queued' || submitted?.status === 'running'),
    initialData: jobId ? submitted : undefined,
    initialDataUpdatedAt: submit.dataUpdatedAt,
    queryFn: ({ signal }) => {
      if (!jobId) throw new Error('Missing terrain job')
      return provider.getTerrainAnalysis(jobId, signal)
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'queued' || status === 'running' ? pollEveryMs : false
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  })

  return { submit, poll, snapshot: poll.data ?? submitted }
}
```

L'esempio mostra meccanica e tipi, **non è l'intero adapter di produzione**: aggiungere validazione payload, stato HTTP distinto dal job, gestione di `completed` senza result, failed, job scomparsi/scaduti e revisione delle fonti. Per SCENARIO usare la stessa struttura col suo request/result, abilitata dal `terrain.result.id`. Non usare `placeholderData` del job precedente come inizializzazione di un nuovo jobId. Un completed ricevuto dalla POST non richiede polling.

Se si sceglie invece `runJob` dentro una `queryFn`, lasciare il polling esclusivamente a `runJob` e non impostare anche `refetchInterval`. È un percorso più vicino al codice attuale, ma la ripresa del job e il progresso richiedono gestione dedicata. Non eseguire contemporaneamente `useAutoRun` e le nuove query per gli stessi input.

### Retry ed errori

| Fallimento | Politica da applicare |
|---|---|
| Validazione 4xx / payload non valido | Non ritentare automaticamente identico input; mostrare il problema. |
| GET job temporaneamente non raggiungibile | Retry limitato della GET con politica applicativa esplicita; conservare jobId e terreno valido. |
| POST interrotta senza risposta | Il server potrebbe avere creato il job: risolvere U04 prima di ripetere in automatico. |
| Job failed | Polling terminale; la GET ripetuta non significa riavvio. Protocollo retry U04. |
| Job 404/scaduto | Non assumere 410, endpoint di resume o flag retry esistenti. Concordare comportamento. |
| PREVIOUS o candidato fallito | Non invalidare il corrente o tutti gli altri candidati; errore per prodotto/riga. |

## 4. Cache, refetch e annullamento

I default v5 considerano i dati stale subito, possono rifare query stale a mount/focus/reconnect, conservano normalmente query inattive per cinque minuti e ritentano query fallite tre volte nel client. Per calcoli costosi occorre configurarli consapevolmente. [Important Defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

Proposta applicativa: disabilitare retry/refetch automatici dei submit scientifici finché U04 è aperta. Cataloghi e manifest hanno una politica di aggiornamento distinta; job attivi hanno polling, risultati versionati/immutabili possono avere staleTime esteso. **Non fissare qui gcTime/TTL di produzione**, budget memoria o cache persistente. `Infinity` nell'esempio conserva l'assegnazione di quel job nel namespace corrente: non dimostra che il backend conservarà job/risultato per sempre. Dopo cambio revisione o scadenza gestire il protocollo concordato.

Consumare il `signal` fornito alla query nel trasporto fetch e nei timer permette di interrompere attese non più utili. Non equivale a un protocollo di cancellazione server. [Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

Proposta applicativa: non chiamare indiscriminatamente `cancelQueries` sul prodotto condiviso quando un solo widget si chiude. La miniatura potrebbe ancora leggere SYSTEM, o un secondo scenario lo stesso terreno. Cambiare input seleziona nuove chiavi; le risposte vecchie non devono sovrascrivere input nuovi. I prodotti validi già in cache restano disponibili per il ritorno al medesimo input.

## 5. Coerenza della UI

Una query disabilitata e senza dati può essere pending ma non stare caricando; distinguere stato e attività con `fetchStatus`/`isLoading`. Non mostrare uno spinner perpetuo su un prodotto non necessario. [Disabling Queries](https://tanstack.com/query/latest/docs/framework/react/guides/disabling-queries).

`placeholderData`/`keepPreviousData` possono mantenere visibile un risultato precedente durante il cambio chiave; `isPlaceholderData` consente di riconoscerlo. Non trasformano il vecchio dato in risultato del nuovo input. [Paginated Queries](https://tanstack.com/query/latest/docs/framework/react/guides/paginated-queries).

Regole proposte per il simulatore:

- Mostrare stato per prodotto: non richiesto, attesa dipendenza, caricamento iniziale, queued/running con progress, ready, partial/unknown, errore HTTP, failed e risultato precedente etichettato.
- Identificare il risultato visualizzato con il suo fingerprint e range, non col solo `stale:boolean` o confronto dell'oggetto input. Current/previous devono essere coerenti prima del delta.
- Non associare il nuovo T/coordinate ad az/el, percentuali, eventi o CSV del risultato precedente. Se tenuto visibile come anteprima, usare le vecchie etichette e disabilitare gli export che pretendono il nuovo input.
- Finché mancano i campi unknown nel DTO nuovo, non convertire null/gap in false/zero per soddisfare i vecchi componenti. Aggiungere prima il rendering dello stato non valutabile.
- Calcoli di presentazione con `select` o memoizzazione: intersezione di intervalli validi, aggregazione per bin, formattazione e filtri. Nessun nuovo modello astronomico nel client o ricostruzione degli eventi da booleani campionati.
- Spostare il cursore non invalida query; interpolare solo entro copertura e segmenti validi. Caricare copertura SYSTEM sufficiente prima di animare, senza richieste per frame.
- Reload oggi resetta input e cache in memoria. Una futura persistenza deve includere versione contratto/fonti, scadenza e ripresa dei job; non prometterla implicitamente con TanStack.

## 6. Ordine di migrazione e verifica

Prima chiudere i punti scientifici/HTTP aperti. Poi introdurre QueryClient e adapter tipizzati; migrare cataloghi, terreno/scenario, baseline/B/confronto, e infine i prodotti visuali ancora locali. Ogni passaggio deve disattivare il percorso imperativo equivalente e mantenere demo separato da engine.

Verificare per ciascun piano della mappa: nessun POST su hover/playback, terreno riusato al cambio T, nuove chiavi per h/raggio/passo azimutale, condivisione A/B identici e widget eclissi/orbite, errori isolati, cancellazione durante rapidi cambi input, ritorno a dati coerenti e gestione completezza. Sono criteri di integrazione futura, non test UI già effettuati. Il controllo statico `python3 scripts/verify_api_integration.py` verifica le ancore documentali e non sostituisce questi riscontri.
