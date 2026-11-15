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
