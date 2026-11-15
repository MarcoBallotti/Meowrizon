# Integrazione main, frontend e backend in engine

Snapshot remoto acquisito il 15 novembre 2026:

- `main`: `c81fcca`, già antenato di engine.
- `frontend`: `edbf80e`, integrato con merge; include già backend.
- `backend`: `0edc495`, verificato come antenato del risultato.

Nei conflitti di `guida-dati.md` e `piano-logica.md` resta il perimetro scientifico V1 approvato e la politica NASA/fonti istituzionali USA. Il frontend e le sue nuove API sono integrati senza ampliare retroattivamente l'ambito della validazione scientifica.

## Due percorsi di calcolo attualmente distinti

- Libreria/CLI V1 oggetto della revisione: `app.services.engine.orchestrator`, comando `python -m app analyze --config config/analysis.demo.json`.
- Interfaccia web: `HttpProvider` → API `scientific` → `ScientificJobs` → `terrain.engine` e `ephemerides.scenario`, importati dai branch frontend/backend.

Il semplice merge **non collega la UI alla libreria V1**. I 100 controlli numerici e il rapporto di validazione V1 non certificano il percorso HTTP, il DEM globale o tutti i siti della UI. L'integrazione dei due percorsi richiede un adapter e verifiche dedicate: non è stata introdotta implicitamente in questo merge.

Due test dei branch importati descrivevano comportamenti precedenti: scenario non implementato (ora è un errore di dati per l'ID terreno inesistente della fixture) e rigetto dei siti non polari (ora indirizzati al provider globale). Sono stati aggiornati per verificare i nuovi comportamenti; il test di routing globale intercetta il provider, propaga l'errore ed evita download di rete accidentali. Nessuna tolleranza scientifica è cambiata.

Per provare il checkout integrato:

```sh
docker compose -p meowrizon-engine up --build
```

Il frontend usa di default `VITE_DATA_SOURCE=api`; file `.env` locali possono sovrascriverlo. Le cache scientifiche del checkout originale non sono copiate nel checkout separato. L'avvio dell'app non rende i prodotti DEM disponibili: le operazioni scientifiche possono richiedere acquisizione e preparazione dei dati, come descritto nei README.

## Verifiche del merge

- Backend: 197 test superati sul filesystem nativo Docker; un test di rete escluso secondo la configurazione preesistente. Restano i limiti del bind mount macOS descritti nel rapporto V1.
- Frontend: compilazione TypeScript/Vite superata nel target Docker `build`; sei test unitari dei cataloghi superati.
- Test API aggiornato anche per il default `includeContext=true`, salvato esplicitamente nei parametri normalizzati del job.
- Nessun test UI, simulatore o E2E eseguito. Non è stata ripetuta la validazione scientifica sui dati reali: il nucleo V1 non è stato modificato da questo merge e il percorso HTTP mantiene uno stato di validazione distinto.

## Confronto di tutti i punti disponibili

Il confronto HTTP ora unisce tutte le regioni restituite da `/api/regions` e tutti i siti da `/api/sites`: nel catalogo versionato sono 13 regioni e 16 siti, senza filtro sulla lista 2024 né su `active` (flag del perimetro CLI V1). Non vengono inventate regioni prive di geometria nel catalogo backend. I centri delle regioni sono esplicitamente stime puntuali.

Ogni candidato resta visibile come in attesa, valutato oppure non valutabile con motivo e possibilità di riprovare. Errori di caricamento di un catalogo sono dichiarati; l'altro può comunque essere confrontato. Non si inseriscono zeri in sostituzione dei dati mancanti. La graduatoria API usa singole metriche geometriche (Sole, Terra, concomitanza), senza raccomandazione universale o punteggio composito.

L'ammissione al confronto richiede DEM identificato, quota finita, nessun NoData dichiarato, profilo completo su 360°, serie finite Sole/Terra per tutta la finestra al passo richiesto, modello C3 coerente e intervalli temporalmente validi. Questi sono controlli di completezza del risultato HTTP, non una nuova certificazione scientifica del modello. Anche i DEM globali grossolani possono supportare il confronto geometrico alla loro risoluzione: la risoluzione e le limitazioni accompagnano ciascun risultato; non si deduce la pendenza su 100 m.

La vista iniziale dei risultati non è più forzata sul polo sud. Filtri geografici opzionali permettono di restringere la visualizzazione; il calcolo considera l'intero catalogo. I cambiamenti a data, durata, passo temporale, altezza e parametri del terreno invalidano il confronto precedente. La comparazione evita di scaricare calendario eclissi biennale/orbite per ciascun punto (`includeContext=false`).

Verifiche di questa modifica: build TypeScript/Vite e otto test unitari frontend, inclusi cataloghi storici/non polari e rifiuto di risultati incompleti. Nessun test UI/E2E o nuova validazione scientifica globale su tutti i 29 punti.
