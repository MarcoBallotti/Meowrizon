# Engine puntuale V1

Stato al 15/11/2026. Questo documento descrive ciò che il codice fa davvero oggi. Le definizioni scientifiche sono in [criteri-algoritmo.md](../../docs/criteri-algoritmo.md); le verifiche eseguite e i loro esiti sono in [validazione-engine-v1.md](../../docs/validazione-engine-v1.md).

> **Validazione incompleta.** Il nucleo è implementato e produce risultati reali, ma il riscontro con le ortofoto LROC datate non ha raggiunto il criterio di accordo fissato in anticipo. L'engine non va presentato come validato.

## Cosa calcola

Per 1–3 punti dentro le regioni attive del catalogo (de Gerlache Rim 2, Malapert Massif) e per uno o più istanti T in UTC, su una finestra `[T, T+durata)`:

- quota del punto, pendenza su supporto circolare di 100 m con fascia descrittiva, profilo d'orizzonte H(azimut) con osservatore a 2 m;
- azimut, elevazione, margine sul terreno, raggio angolare e distanza di Sole e Terra (JPL Horizons topocentrico);
- frazioni dei dischi `fSunTerrain`, `fSun` (unione di terreno e Terra) e `fEarth`;
- finestre Sole C3, Terra C3, concomitanza, sotto C3, buio completo, sovrapposizione Terra–Sole, con causa e tipo di confine;
- confronto diretto degli stessi punti a date diverse e di punti diversi alla stessa data.

Non calcola griglie o aree regionali, P50 annuale, scansioni automatiche di date, punteggi, potenza, temperatura o qualità radio. Non espone endpoint HTTP.

## Comandi

Dalla radice del repository, con Docker Desktop avviato:

```sh
docker compose build backend
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json
docker compose run --rm --no-deps backend python -m app analyze --config config/analysis.demo.json --offline
docker compose run --rm --no-deps backend python -m app validate-engine
docker compose run --rm --no-deps backend pytest
```

- `analyze` acquisisce o riusa i dati, esegue l'analisi e scrive `backend/data/analysis/runs/<chiave>/result.json` e `manifest.json`. La chiave dipende dalla richiesta e dalla versione dell'algoritmo.
- `--offline` non fa richieste di rete. Funziona solo se tutti i dati necessari sono già in cache; altrimenti termina con codice 2 e dice che cosa manca. Non sostituisce mai un dato mancante.
- `--output` cambia la cartella (deve restare dentro `backend/`).
- `validate-engine` esegue i controlli su dati reali e scrive `backend/data/analysis/validation/evidence-<UTC>.json`. Ogni esecuzione conserva un file distinto; non sovrascrive le evidenze precedenti. Codice 4 se la validazione completa non è superata, anche per controlli omessi/incompleti; `--check` non certifica il resto. Richiede la rete. `--check` limita i controlli a `interpolation`, `slope`, `convergence`, `alignment`, `eclipse`, `lroc`.

Codici di uscita di `analyze`: 0 riuscito, 1 richiesta non valida, 2 cache insufficiente in offline, 3 errore di acquisizione.

## Uso da Python

```python
from app.services.engine.orchestrator import EnginePaths, load_request, run_analysis, write_outputs

request = load_request("config/analysis.demo.json")
result, report = run_analysis(request, offline=False)
write_outputs(result, report, EnginePaths.default())
```

`run_analysis` non avvia FastAPI. `result` è un `AnalysisResult` (pydantic); `report` contiene tempi e uso delle cache.

## Dati necessari

| Dato | Fonte | Dove finisce |
|---|---|---|
| Poligoni delle regioni | Moon Trek `A3_Named_regions_SP` | `data/sources/` (lo stesso download di `init-regions`; se manca viene acquisito) |
| Quote | Moon Trek ImageServer, tasselli di 1500 × 1500 pixel nativi | `backend/data/analysis/raw/engine-dem-*` |
| Conteggi LOLA | Moon Trek `LRO_LOLA_Count_SPole875_5mp_v04` | idem |
| Effemeridi | JPL Horizons, una risposta per corpo, punto e T | `backend/data/analysis/raw/engine-horizons-*` |

Ogni file è salvato da `Collector` con richiesta, URL, data e SHA-256. La demo usa 71 file per circa 497 MB: 52 tasselli DEM (491 MB), 1 tassello di conteggi, 12 risposte Horizons, 5 metadati dei servizi e i poligoni.

### Prodotti DEM usati dalla demo

| Fascia | de Gerlache Rim 2 | Malapert Massif | Raggio | Passo radiale massimo |
|---|---|---|---|---|
| Vicina, 5 m | `LRO_LOLA_DEM_SPole875_5mp_v04` | `Site23_final_adj_5mpp_surf` | 0–4 km | 5 m |
| Intermedia, 30 m | `LRO_LOLA_DEM_SPole75_30mp_v04` | idem | 4–40 km | 30 m |
| Lontana, 100 m | `LRO_LOLA_DEM_SPole45_100mp_v04` | idem | 40–300 km | 100 m |

Note sui prodotti, dai metadati e dagli abstract di Moon Trek:

- quote in metri rispetto alla sfera di 1 737 400 m, stereografica polare sud, senza valore NoData dichiarato;
- i DEM polari v04 usano l'altimetria fino a settembre 2011; il DEM del sito 23 è il prodotto co-registrato di Barker et al. (NASA GSFC PGDA);
- nel supporto di 100 m del punto di de Gerlache solo il 3,8% dei pixel a 5 m contiene uno spot LOLA: gli altri sono interpolati. Per il sito 23 Moon Trek non distribuisce i conteggi; l'abstract indica circa il 90% di pixel interpolati;
- il DEM polare a 5 m non copre Malapert Massif (arriva a 87,5°S);
- l'estensione reale del prodotto a 100 m è ±1 440 km: il valore ±1 095,93 km del catalogo Moon Trek è sbagliato. Il codice confronta sempre il registro locale con i metadati del servizio e si ferma se non coincidono.

I tasselli sono chiesti sulla griglia nativa con `RSP_NearestNeighbor`: nessun ricampionamento. Il controllo `alignment` lo verifica.

## Richiesta

`config/analysis.demo.json` è l'esempio completo. Schema: `schemas/analysis-request-v1.schema.json`.

| Campo | Significato |
|---|---|
| `points[]` | `id`, `region`, `lat_deg`, `lon_east_deg` planetocentriche, `selection` (come è stato scelto il punto) |
| `epochs_utc[]` | Istanti T con fuso UTC esplicito (`Z`); non vengono arrotondati |
| `duration_s` | Durata comune della finestra di analisi; 30 giorni nella demo |
| `observer_height_m` | Solo 2.0 in V1 |
| `terrain` | Fasce di terreno per regione: prodotto, raggio esterno, passo radiale |
| `numeric` | Scelte numeriche (vedi sotto) |

Una richiesta non valida viene rifiutata, non corretta: punto fuori dal poligono, regione non attiva, polo esatto, altezza diversa da 2 m, T senza fuso.

### Configurazione numerica

| Parametro | Demo | Nota |
|---|---|---|
| `azimuth_step_deg` | 0,03125 | 11520 direzioni; raffinamento verificato contro 0,015625° |
| `radial_relative_step` | 0,0005 | Passo radiale = min(passo della fascia, 0,0005 × distanza) |
| `min_distance_m` | 2,5 | Primo terreno considerato |
| `slope_diameter_m`, `slope_min_pixels` | 100, 16 | Sotto 16 pixel nel supporto la pendenza è sconosciuta |
| `disc_strips` | 64 | Strisce di integrazione del disco |
| `ephemeris_step_s` | 3600 | Campioni Horizons; il primo è esattamente T |
| `scan_step_s`, `event_tolerance_s` | 60, 1 | Scansione degli eventi e tolleranza della bisezione |
| `c3_threshold`, `zero_fraction_epsilon` | 0,5, 1e-9 | C3 e tolleranza numerica dello zero |

La configurazione iniziale (azimut 0,25°, passo radiale uniforme) e quella intermedia (0,125°) non superavano tutti i controlli. La demo ora usa 0,03125°; le tolleranze originali non sono cambiate. Il default del modello Python resta 0,125°: usare la configurazione demo esplicita per riprodurre questa verifica; non trasferire gli esiti a configurazioni diverse.

## Risultato

Schema: `schemas/analysis-result-v1.schema.json`, versione `1.0.0`. Un test verifica che il file coincida con i modelli.

- `points[]`: coordinate, quota, `slope` (valore, fascia, supporto, sensibilità numerica, frazione di pixel misurati), `horizon` (array `elevation_deg`, `complete`, `distance_m`), fasce di terreno usate e scarti di quota fra prodotti (`tier_seams`).
- `scenarios[]`: uno per punto e T. `series` con i campioni orari; `state_at_t`; `windows`; `first_dark`; `coverage`; `totals_observed_s`; `notes`.
- `comparisons[]`: righe affiancate, senza ordinamento.
- `sources[]`: provenienza di ogni file usato.

Regole:

- una misura non valutabile è `null` con `status` e `reason`; mai NaN, Infinity o zero;
- ogni intervallo ha `start_kind` e `end_kind`: `observed_transition`, `request_start`/`request_end`, `data_gap`. `total_duration_s` è valorizzato solo se entrambi i confini sono transizioni osservate; altrimenti resta `duration_lower_bound_s`;
- `remaining_*` vale 0 se a T la condizione è nota falsa, `null` se a T è sconosciuta o se la fine non è stata osservata;
- `start_rate_per_hour` e `end_rate_per_hour` dicono quanto è netta una transizione. Ritmi bassi indicano un passaggio radente: l'istante è approssimato e lo scenario lo segnala in `notes`;
- lo stesso input con le stesse versioni produce lo stesso `result.json`, byte per byte. Tempi di esecuzione e data di scrittura stanno solo in `manifest.json`.

## Cache

| Cache | Cartella | La chiave include |
|---|---|---|
| Fonti | `data/analysis/raw/` | La richiesta completa alla fonte |
| Terreno | `data/analysis/cache/terrain/` | Coordinate, altezza, prodotti e SHA-256 dei tasselli, parametri di orizzonte e pendenza, versione dell'algoritmo |
| Serie | `data/analysis/cache/series/` | Chiave del terreno, T, durata, configurazione numerica, SHA-256 delle risposte Horizons, versione del parser |

Cambiare data riusa il terreno. Cambiare un tassello DEM, il punto o il metodo invalida terreno e serie. Un calcolo interrotto da un errore di acquisizione non viene salvato.

## Tempi storici sulla demo (configurazione azimutale 0,125°)

Due punti, tre date, 30 giorni, in Docker su un MacBook. Sono misure di queste esecuzioni, non prestazioni garantite.

| Condizione | Tempo |
|---|---|
| Tutto da scaricare (70 download, circa 497 MB) | 339,9 s |
| Fonti in cache, terreno e serie da calcolare | 19,4 s |
| Tutto in cache, anche con `--offline` | 0,6 s |

## Moduli

| Modulo | Contenuto |
|---|---|
| `app/services/engine/models.py` | Richiesta e risultato versionati |
| `app/services/engine/orchestrator.py` | `run_analysis`, scrittura di risultato e manifest |
| `app/services/engine/acquisition.py` | Fonti tramite `Collector`, offline, provenienza, poligoni |
| `app/services/engine/terrain_stage.py`, `scenario_stage.py` | Terreno per punto; serie, frazioni, finestre |
| `app/services/engine/cache.py`, `compare.py` | Cache derivate; confronto diretto |
| `app/services/engine/validation.py`, `lroc_check.py` | Controlli su dati reali |
| `app/services/terrain/moontrek_dem.py`, `slope.py`, `horizon.py` | Tasselli e griglie; pendenza; orizzonte |
| `app/services/ephemerides/horizons_topo.py`, `interpolation.py` | Richiesta e parser Horizons; interpolazione |
| `app/services/visibility/discs.py`, `app/services/events/intervals.py` | Frazioni dei dischi; intervalli |

I test sono in `tests/test_engine_*.py` e non usano la rete.

## Divergenze dai documenti, da riportare

- `guida-dati.md` indica `QUANTITIES='4,20'`. Il codice usa `'4,13,20'` per avere i diametri angolari da Horizons, e `RANGE_UNITS='KM'`.
- Le sezioni progettuali storiche nei README vanno lette insieme al rapporto di validazione corrente, che descrive l’implementazione effettiva.

## Revisione di validazione del 15/11/2026

Rapporto aggiornato: [revisione V1](../../docs/validazione-engine-v1-revisione.md).
Protocollo osservativo indipendente ancora da completare: [LROC v2](../../docs/protocollo-validazione-lroc-v2.md).

Comandi riproducibili dalla radice del repository:

```sh
docker compose run --rm --no-deps backend python -m scripts.review_validation
docker compose run --rm --no-deps backend python -m scripts.review_tests_native
docker compose run --rm --no-deps backend python -m scripts.review_cache
```

Il primo comando registra le impronte del codice, della configurazione e dei pacchetti e verifica che non cambino durante l'esecuzione. Il secondo copia sorgenti e test nel filesystem nativo del container per isolare le anomalie di locking del bind mount macOS: non salta i test falliti sul mount. Questi limiti ambientali restano documentati e l'esecuzione montata non viene presentata come superata. Il terzo proibisce le richieste HTTP e confronta due risultati reali offline.

Gli script `review_convergence` e `prepare_lroc_review` riproducono rispettivamente la scala di raffinamento e il pacchetto osservativo di sviluppo. Il secondo rifiuta di sovrascrivere annotazioni esistenti. Le etichette iniziali sono tutte non annotate: non sono ground truth.
