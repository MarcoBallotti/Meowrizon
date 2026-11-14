# Contratto API frontend ↔ motore

Stato: **proposta implementata solo lato client.** Il frontend la usa tramite `HttpProvider` (`VITE_DATA_SOURCE=api`), ma il backend Python non esiste ancora. I tipi di riferimento sono in [`frontend/src/api/types.ts`](../frontend/src/api/types.ts).

## Convenzioni

- Angoli in gradi. Azimut da Nord in senso orario (N 0°, E 90°, S 180°, O 270°); elevazione rispetto al piano orizzontale locale dell’osservatore.
- Longitudine planetocentrica Est, normalizzata in [−180, 180).
- Tempo UTC: stringhe ISO 8601 nelle richieste, millisecondi Unix nelle serie campionate.
- Altezze in metri.
- JSON in camelCase.
- Ogni risultato riporta `origin`: `engine` per il motore, `demo` per i dati sintetici.

## Lavori asincroni

Ogni `POST` restituisce un `JobState`:

```json
{ "id": "…", "status": "queued | running | completed | failed", "progress": 0.4, "result": {…}, "error": { "code": "…", "message": "…" } }
```

Se il risultato è già in cache, `status` vale subito `completed` e `result` è incluso. Altrimenti il client interroga `GET …/{id}` con backoff esponenziale: parte da 250 ms e arriva al massimo a 3 s. Deduplicazione e cache restano compito del motore.

## Endpoint

| Metodo | Percorso | Corpo / risposta |
|---|---|---|
| GET | `/api/coverage` | `CoverageCatalog`: prodotti DEM con fascia di latitudine, pixel dichiarato, fonte, note e disponibilità |
| POST | `/api/terrain-analyses` | `TerrainAnalysisRequest` → `JobState<TerrainAnalysis>` |
| GET | `/api/terrain-analyses/{id}` | `JobState<TerrainAnalysis>` |
| POST | `/api/scenario-evaluations` | `ScenarioEvaluationRequest` → `JobState<ScenarioEvaluation>` |
| GET | `/api/scenario-evaluations/{id}` | `JobState<ScenarioEvaluation>` |

### `TerrainAnalysis.profile`

`H(azimut)` campionato su [0, 360), più posizione dell’osservatore (quota DEM, altezza sopra il terreno, raggio di riferimento), prodotti DEM usati, pixel effettivo, frazione NoData, parametri, versione dell’algoritmo e avvisi. La data non entra in questa analisi, quindi la cache dell’orizzonte resta riutilizzabile.

### `ScenarioEvaluation`

Serie temporale (`timesMs`) con, per Sole e Terra:

- azimut;
- elevazione;
- orizzonte del terreno lungo l’azimut del corpo;
- classificazione `centerVisible`.

Contiene anche gli **intervalli raffinati** `intervals.sun | earth | both`, che la timeline disegna direttamente. Sono inclusi fonte, versione, kernel e correzioni delle effemeridi, il modello di visibilità (`body-center`) e l’elenco delle approssimazioni adottate.

## Cosa fa il frontend con i dati

- Interpola azimut ed elevazione tra campioni già caricati, solo per posizionare i simboli sotto il cursore.
- Legge lo stato visibile/nascosto dagli **intervalli del motore**; non lo ricalcola.
- Il cursore temporale e la riproduzione non producono richieste.
- Una nuova richiesta per lo stesso scenario annulla quella in corso con `AbortController`.
