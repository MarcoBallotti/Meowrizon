# Rapporto di validazione dell'engine V1

> **Rapporto storico conservato.** Per gli esiti successivi e il codice consegnato vedere [revisione della validazione V1](validazione-engine-v1-revisione.md). Le tolleranze di questo rapporto sono rimaste invariate.

Eseguito il 15/11/2026 sulla demo `backend/config/analysis.demo.json`: due punti (centri dei poligoni di de Gerlache Rim 2 e Malapert Massif), T = 2026-12-01, 2026-12-04 e 2027-02-01 alle 00:00 UTC, finestra di 30 giorni.

**Esito complessivo: validazione V1 incompleta.** Il riscontro con le ortofoto LROC datate è stato eseguito dentro una regione di sviluppo ma non ha raggiunto il criterio di accordo fissato in anticipo. Un controllo di convergenza su 100 non è superato. L'engine non va dichiarato validato.

Le tolleranze sono in `backend/config/analysis.tolerances.json`, scritte prima di eseguire i confronti e mai modificate. Sono scelte numeriche del team, non limiti NASA. L'evidenza numerica completa è in `backend/data/analysis/validation/evidence.json` (configurazione finale) ed `evidence-initial-config.json` (configurazione iniziale); si rigenera con `python -m app validate-engine`.

## 1. Riepilogo

| Verifica | Fonte o caso | Metrica | Tolleranza | Scarto misurato | Esito |
|---|---|---|---|---|---|
| Test offline | 93 test sintetici in `tests/test_engine_*.py` | superati | tutti | 93 su 93 | superato |
| Suite backend | `pytest` nell'immagine del progetto | superati | — | 177 su 178; fallisce `test_second_writer_cannot_modify_the_manifest`, già fallito prima di questo lavoro | regressioni: nessuna |
| Lint | `ruff check` | errori | 0 nei file nuovi | 0 nei file nuovi; 1 preesistente in `app/api/coverage.py` | superato |
| Interpolazione | Horizons diretto a metà passo, 720 istanti × 6 scenari | direzione, raggio, separazione | 0,002° / 0,0002° / 0,002° | ≤ 1,3e-6° / 1,4e-7° / 1,6e-6° | superato |
| Allineamento DEM | blocco 16 × 16 px richiesto a doppia risoluzione, 4 prodotti | differenza massima | 0 m | 0 m | superato |
| Slope, Malapert | PGDA `LDRM_80S_50MPP_ADJ_SLP_100M`, 121 nodi | mediana / 95° percentile | 1,0° / 3,0° | 0,089° / 0,320° | superato |
| Slope, de Gerlache | idem | idem | idem | 0,754° / 2,688° | superato, ma vedi §4 |
| Orizzonte: azimut | 0,125° contro 0,0625° | RMS | 0,02° | 0,0012° e 0,0006° | superato |
| Orizzonte: passo radiale | passo dimezzato | massimo | 0,02° | 0,0046° e 0,0028° | superato |
| Orizzonte: raggio | 300 km contro 225 km | massimo | 0,02° | 0,000° | superato |
| Frazioni | 5 varianti × 6 scenari | variazione massima | 0,01 | ≤ 0,0029 | superato |
| Eventi | 5 varianti × 6 scenari | spostamento massimo | 60 s | ≤ 50,6 s in 29 casi; 337,5 s in 1 | **1 non superato** |
| Eclissi reale | 14/03/2025, due punti | coerenza geometrica | coerente | totale prevista e ottenuta | superato |
| LROC | 6 ortofoto NAC datate dentro Malapert Massif | accordo luce/ombra | ≥ 0,90 | 0,796–0,872 | **non superato** |

## 2. Configurazione iniziale e finale

La prima configurazione (azimut 0,25°, passo radiale uniforme pari al pixel) non superava 7 controlli su 88. Gli esiti restano registrati:

| Controllo | Iniziale | Finale |
|---|---|---|
| Passo radiale dimezzato, de Gerlache | 0,601° | 0,0046° |
| Passo radiale dimezzato, Malapert | 0,073° | 0,0028° |
| Eventi con azimut dimezzato, de Gerlache 2027-02-01 | 140,6 s | 22,5 s |
| Eventi con azimut dimezzato, Malapert 2027-02-01 | 118,1 s | 337,5 s |
| Frazioni con azimut dimezzato, Malapert (3 date) | 0,0101–0,0114 | 0,0015–0,0029 |

Causa: al centro di de Gerlache Rim 2, in 124 direzioni su 360 l'orizzonte è deciso da terreno a circa 20 m dall'osservatore, dove l'elevazione angolare varia di circa 0,3° al metro. La configurazione finale usa passo radiale = min(passo della fascia, 0,0005 × distanza) e azimut 0,125°. Il cambiamento non è neutro: la fine del primo buio a Malapert il 6/12/2026 passa da 01:28 a 02:32 UTC.

**Controllo ancora non superato.** A Malapert, finestra dal 2027-02-01, una transizione di buio completo si sposta di 337,5 s dimezzando ancora l'azimut. È un passaggio radente del lembo solare su una cresta. Non ho affinato oltre né cambiato la tolleranza: gli istanti delle transizioni lente vanno letti come approssimati a qualche minuto, e il risultato lo dichiara in `limitations` e in `notes`.

Nota onesta sulle `notes`: la soglia con cui lo scenario segnala le "transizioni radenti" (0,6 frazioni/h) marca quasi tutte le transizioni, perché a queste latitudini il Sole si sposta di 0,5° all'ora e ogni attraversamento è lento. L'informazione utile è il ritmo riportato per ciascun intervallo (`start_rate_per_hour`, `end_rate_per_hour`); la soglia va rivista.

## 3. Effemeridi

Query topocentriche `coord@301`, quantità 4, 13 e 20. Le intestazioni reali confermano frame `MEAN_ME`, sfera 1737,4 km, quota in km sulla sfera, geometria apparente senza rifrazione, azimut da nord verso est. Il parser rifiuta risposte con frame, raggi, sito, unità o colonne diversi.

L'interpolazione cubica dei versori dai campioni orari riproduce le query dirette a metà passo entro la precisione stampata da Horizons (1e-6°). Effetto sulle frazioni: ≤ 2,1e-6. Questo verifica acquisizione e interpolazione; non è una validazione indipendente di Horizons.

## 4. Pendenza

| Punto | DEM dell'engine | Engine nel punto | Nodo PGDA più vicino: engine / PGDA | Scarto mediano | 95° percentile | Massimo | Correlazione |
|---|---|---|---|---|---|---|---|
| malapert-center | `Site23_final_adj_5mpp_surf` | 3,71° | 4,81° / 4,77° | 0,089° | 0,320° | 0,657° | 0,996 |
| dgr2-center | `LRO_LOLA_DEM_SPole875_5mp_v04` | 9,21° | 11,01° / 10,15° | 0,754° | 2,688° | 3,197° | 0,800 |

Riferimento: NASA GSFC PGDA prodotto 90, letto a finestre solo per il confronto (ETag `W/"24edcc2e-188979eb648"`, 619 564 078 byte). A Malapert il DEM è della stessa famiglia del riferimento e l'accordo è stretto: l'algoritmo di fit è coerente con quello PGDA. A de Gerlache lo scarto è otto volte maggiore perché il DEM v04 di Moon Trek è una versione diversa (altimetria fino a settembre 2011) e nel supporto solo il 3,8% dei pixel contiene uno spot LOLA. Rientra nella tolleranza, ma la tolleranza era larga: questo scarto è soprattutto differenza fra DEM, non errore numerico.

Sensibilità numerica (supporto ±10%, centro ±1 pixel): 0,17° a de Gerlache, 0,38° a Malapert; la fascia non cambia. **L'incertezza del DEM non è quantificata**: Moon Trek non distribuisce un layer di errore per questi prodotti.

## 5. Terreno e orizzonte

- Tutte le 2880 direzioni sono complete per entrambi i punti. Il terreno più lontano che determina l'orizzonte è a 167 km e 169 km; nessuna direzione dipende da terreno oltre 225 km.
- Scarto di quota fra prodotti nelle zone di sovrapposizione: 5 m v04 contro 30 m v04, media 0,04 m, deviazione standard 0,77 m, massimo 10 m; sito 23 contro 30 m v04, media 0,04 m, deviazione standard 3,35 m, massimo 28 m; 30 m contro 100 m, deviazione standard 1,7–1,9 m.
- L'estensione del prodotto a 100 m nel catalogo Moon Trek è sbagliata (±1 095,93 km invece di ±1 440 km). Il primo tassello scaricato con quel valore era fuori griglia ed è stato scartato; ora il codice si ferma se registro e metadati del servizio non coincidono.
- Un difetto trovato e corretto durante la prima esecuzione reale: la finestra del terreno lontano non seguiva il cerchio vero sul terreno e lasciava incomplete 109 direzioni su 1440.

## 6. Eclissi su dati reali

Finestra 13–15/03/2025. Il catalogo NASA GSFC dà l'eclissi lunare totale del 14/03/2025 con massimo alle 06:59:56 TD e fase di penombra di 362,6 minuti.

| Punto | Sovrapposizione Terra–Sole (UTC) | Separazione minima | Copertura massima | Buio in quelle ore | Causa |
|---|---|---|---|---|---|
| dgr2-center | 04:21:28 – 09:26:01 | 0,072° alle 06:54 | 1,0 | già buio per il terreno | terreno |
| malapert-center | 04:22:11 – 09:26:45 | 0,071° alle 06:55 | 1,0 | 05:30:29 – 08:21:27 | terreno e Terra insieme |

La separazione minima è minore della differenza dei raggi (0,910° − 0,267°), quindi l'eclissi locale è totale, come ottenuto. A Malapert il Sole era parzialmente sopra il terreno e il buio nasce dall'unione delle due occultazioni. Nella finestra demo del 2027 non risulta alcuna sovrapposizione ai due punti: l'eclissi del 20/02/2027 è di penombra con gamma −1,048 e non raggiunge il polo sud.

## 7. Riscontro con ortofoto LROC datate

Fonte: archivio NASA PDS, volume `LRO-L-LROC-5-RDR-V1.0`, prodotti `NAC_DTM_MALAPERT02` e `NAC_DTM_MALAPERT03` (ASU, LROC), ortofoto a 4 m/px con istante nell'etichetta. I file sono serviti da `pds.mcp.nasa.gov`. I campioni stanno dentro il poligono di Malapert Massif: lat ≈ −85,8° e −86,1°, lon ≈ 359,7°E, x da −2,1 a +0,4 km, y da 111 a 132 km.

Regola fissata prima di guardare l'esito: previsione = `fSunTerrain` a quota suolo (0 m, non i 2 m del prodotto V1) all'istante medio dell'immagine; osservazione = I/F mediato su 20 m, chiaro se sopra la soglia di Otsu dell'immagine stessa; metrica = accordo sui campioni con previsione non parziale. Griglia di campioni ogni 152 m.

| Immagine | Istante (UTC) | Sole az / el | Campioni | Ombra / luce previsti | Accordo | Soglia ÷2 | Esito |
|---|---|---|---|---|---|---|---|
| `MALAPERT02_M139906018` | 2010-09-23 18:32:49 | 353,9° / 5,74° | 1023 | 1 / 1022 | 0,811 | 0,960 | non superato |
| `MALAPERT02_M139912793` | 2010-09-23 20:25:44 | 353,4° / 5,73° | 1861 | 4 / 1857 | 0,828 | 0,967 | non superato |
| `MALAPERT02_M139919591` | 2010-09-23 22:19:01 | 352,8° / 5,73° | 1012 | 3 / 1009 | 0,840 | 0,968 | non superato |
| `MALAPERT03_M141080135` | 2010-10-07 08:41:27 | 188,3° / −2,35° | 734 | 6 / 727 | 0,872 | 0,952 | non superato |
| `MALAPERT03_M141086909` | 2010-10-07 10:34:21 | 188,0° / −2,35° | 1459 | 10 / 1446 | 0,834 | 0,948 | non superato |
| `MALAPERT03_M141093708` | 2010-10-07 12:27:40 | 187,5° / −2,35° | 774 | 5 / 769 | 0,796 | 0,933 | non superato |

Lettura dello scarto:

- Le scene sono quasi interamente in luce: su 6863 campioni solo 29 sono previsti in ombra. Di questi, 21 sono scuri e 8 chiari. **Il confronto quindi verifica poco la posizione dei bordi d'ombra**, che è la prova più severa dell'orizzonte.
- Il disaccordo viene da 1161 campioni previsti in luce ma sotto soglia. Con una scena senza due popolazioni distinte, la soglia di Otsu taglia dentro il terreno illuminato: la regola scelta era inadatta a queste immagini.
- Analisi aggiunta dopo l'esito, che **non** conta come superamento: fra i campioni previsti in luce, la correlazione di rango fra I/F osservato e coseno dell'incidenza previsto (piano locale su 40 m) è 0,85–0,96; i campioni scuri hanno coseno mediano 0,09–0,21 contro 0,27–0,50 dei chiari. I pixel scuri sono quindi coerenti con pendii poco inclinati verso il Sole.
- Nelle immagini di ottobre il Sole è 2,35° sotto l'orizzontale locale e l'engine prevede comunque luce sulla sommità (4–5 km di quota): le ortofoto mostrano terreno illuminato.
- La direzione del Sole è portata da un punto d'ancoraggio agli altri campioni come vettore fisso nel riferimento lunare; una seconda query Horizons a 5–7 km di distanza differisce di ≤ 1,9e-6°.

Limiti: l'ortofoto è co-registrata a LOLA dal produttore (RMS dichiarato 1,6–2,2 m); il DEM a 5 m è in gran parte interpolato; per de Gerlache Rim 2 non ho trovato un'ortofoto datata. `NAC_DTM_MALAPERT01` copre solo una striscia di 36 m al bordo della regione e non è stata usata.

## 8. Riproducibilità e tempi

- Due esecuzioni sugli stessi file in cache producono lo stesso `result.json` byte per byte (test) .
- Un'esecuzione da zero in una cartella separata, con download indipendenti, dà gli stessi valori numerici dell'esecuzione principale: 0 differenze, esclusi hash e date di acquisizione.
- `--offline` con cache completa non fa richieste; con cache insufficiente termina con codice 2 (test).

| Condizione | Tempo misurato |
|---|---|
| Tutto da scaricare: 70 download, circa 497 MB | 339,9 s |
| Fonti in cache, terreno e serie da calcolare | 19,4 s |
| Tutto in cache, anche offline | 0,6 s |

Misure di queste esecuzioni in Docker su un MacBook, non prestazioni garantite.

## 9. Cosa resta

1. Chiudere il gate LROC con una regola adatta (per esempio soglia fisica dell'ombra o confronto dei bordi) su una scena con ombre estese dentro una regione; oggi non è superato.
2. Decidere come trattare le transizioni lente: tolleranza sugli eventi espressa rispetto al ritmo, e soglia delle note da rivedere.
3. Quantificare l'incertezza del DEM; con i soli prodotti Moon Trek non è possibile.
4. Aggiornare `backend/README.md` e `docs/stato-decisioni.md`, non toccati perché in conflitto di merge durante il lavoro.
5. I test degli strumenti LROC non sono stati rieseguiti dopo l'aggiunta dell'analisi d'incidenza; `ruff` sì.
