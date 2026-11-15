# Stato del progetto: cosa è deciso e cosa manca

Aggiornato al **15/11/2026** (criteri ridefiniti lo stesso giorno). Questo documento riassume le decisioni prese finora e quello che resta da decidere per arrivare all'algoritmo di valutazione. I dettagli e le fonti [F1]…[F19] sono in `docs/piano-logica.md`, mentre regioni e siti sono in `docs/siti-e-regioni.md`.

La domanda a cui il programma deve rispondere:

> **Data una data, quali regioni del polo sud sono le migliori per atterrare, e perché?**

---

## 1. Cosa abbiamo definito

### 1.1 Architettura e tecnologie

| Decisione | Dettaglio | Data |
|---|---|---|
| Ripartizione del codice | Tutta la logica sta in **Python** (dati, calcoli, classifica, API, agente AI). **TypeScript** serve solo al frontend (globo, mappe, grafici, animazione) | 14/11 |
| Framework | **FastAPI**: Flask è scartato. Un'unica applicazione in `backend/app/main.py` | 14/11 |
| Archiviazione | **Nessun database**: solo file (GeoJSON, JSON, NumPy, Parquet, GeoTIFF) | 14/11 |
| Effemeridi | **Solo API JPL Horizons**, con una tabella globale (`COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,20'`). SpiceyPy e kernel SPICE sono esclusi | 14/11 |
| Ambiente | Docker (micromamba e conda-forge) per backend e frontend, avviati con `npm start` | 14/11 |
| API | Rotte sotto `/api`; contratto frontend aggiornato in `docs/api-contract.md`, schemi ed esempi in `docs/api-contract.openapi.json`. `backend/API_CONTRACT.md` rimanda alla specifica unica | 15/11 |
| Integrazione con il lavoro di Kevin | Le rotte `/api/data/...` (acquisizione, preparazione, job persistenti) sono nella stessa applicazione, con i dati in `backend/data/` | 15/11 |

### 1.2 Modello: settore, regioni, celle, siti

| Decisione | Dettaglio |
|---|---|
| Cosa si valuta | La **regione**, non un singolo punto: il programma dice *in quale regione* conviene atterrare |
| Settore | **Polo sud, a sud di 84°S**, il requisito Artemis III "entro 6° dal polo" [F1]. Vale **solo per le regioni** |
| Celle | Ogni regione si misura internamente con **celle di 100 m**, la base della pendenza NASA e la precisione di atterraggio [F1]. Le celle non vengono mostrate come punti |
| Siti | Punti valutati come **una cella di 100 × 100 m**, in una **tabella separata** dalla classifica delle regioni |

### 1.3 Punti mostrati sulla mappa all'apertura

**13 regioni Artemis III** (lista NASA 2022, poligoni da Moon Trek [F3]):

- presenti anche nella lista 2024 [F4]: de Gerlache Rim 2, Haworth, Malapert Massif, Nobile Rim 1, Nobile Rim 2;
- **attive per lo sviluppo:** de Gerlache Rim 2 e Malapert Massif;
- le **4 regioni del 2024 senza contorno** (Peak near Cabeus B, Mons Mouton Plateau, Mons Mouton, Slater Plain) **non sono considerate**: non si possono rappresentare né valutare.

**16 siti**, tutti con fonte, in `backend/catalog/sites.toml`:

- **12 atterraggi riusciti e famosi:** Apollo 11, 12, 14, 15, 16 e 17, Luna 9, Luna 17 / Lunokhod 1, Chang'e 4, Chang'e 6, Chandrayaan-3, Blue Ghost M1. Le coordinate vengono da Moon Trek / NSSDCA [F16] e da LROC [F17]. Gli atterraggi falliti o riusciti solo in parte (IM-1, IM-2, SLIM) sono esclusi;
- **4 missioni CLPS future:** Griffin-1, Blue Moon MK1 Pathfinder, IM-3, Blue Ghost M2. Il punto è il **centro della formazione bersaglio**, dal Gazetteer IAU [F18] o dalla regione Artemis;
- 2 siti stanno nel settore (Griffin-1 e Blue Moon, che cade in Connecting Ridge), gli altri 14 sono fuori (`in_sector = false`).

### 1.4 Fonti dei dati

| Dato | Fonte decisa | Stato |
|---|---|---|
| Posizione di Sole e Terra | Horizons, tabella globale oraria | Verificata, prototipo validato (scarto < 0,001°) |
| Terreno del polo sud | DEM LOLA polari della PDS (`ldem_*`, 5–240 m) [F6] | Prodotti verificati sul server |
| Terreno fuori dal polo | DEM LOLA globale da Moon Trek, via ImageServer (`LRO_LOLA_DEM_Global_128ppd_v04`, ~237 m) | Provato su Apollo 15 |
| Ombre permanenti, illuminazione media | PGDA / PDS (`lpsr_*`, `avgvisib_*`) [F7] | Da scaricare |
| Illuminazione osservata | LROC `WAC_POLE_ILL_PCT_SOUTH_100M` [F8] | Solo validazione |
| Validazione manuale | QuickMap (Panorama, Visibility Analysis): **non** come fonte di dati | — |

### 1.5 Come si accede ai dati

- **Punti predefiniti** (regioni e siti): terreno scaricato una volta, maschere d'orizzonte calcolate e salvate in locale. L'app funziona anche offline.
- **Coordinate inserite a mano:** ritagli di terreno chiesti via API (Moon Trek ImageServer o COG PGDA), calcolo asincrono (`JobState`), risultato in cache.
- **Visualizzazione della maschera:** servono solo i **360 valori salvati**, non il terreno.

### 1.6 Criteri (ridefiniti da zero il 15/11)

I criteri del 14/11 (vincoli V1–V5, metriche M1–M8, zona continua, ordinamento) sono **superati**. Quelli nuovi, con le motivazioni, sono in `docs/criteri-algoritmo.md` (e nella Fase 4 di `docs/piano-logica.md`).

| Decisione | Dettaglio |
|---|---|
| Niente profili di missione | Il programma **misura e colora**; ogni colore ha una soglia NASA di riferimento con la sua fonte |
| Linea di vista | Sole e Terra si confrontano con la **maschera d'orizzonte** nella loro direzione (360 valori, curvatura lunare, osservatore a 2 m). Il disco coperto dal terreno vuol dire ombra per il Sole, niente comunicazione diretta per la Terra |
| Niente valori fissi | Le elevazioni di Sole e Terra si calcolano ogni ora da Horizons in UTC, per ogni cella |
| Dieci criteri | **Atterraggio:** 1 Sole visibile, 2 Terra visibile, 3 elevazione del Sole, 4 elevazione della Terra · **Dopo l'atterraggio:** 5 ore di luce fino al primo tramonto, 6 ore di contatto con la Terra fino al primo Earthset, 7 prima notte (inizio e durata) · **Terreno:** 8 pendenza · **Anno:** 9 illuminazione annua e calendario · **Tenuta:** 10 ricalcolo dei criteri 1–9 a T ± 1, 2, 3 giorni |
| Nessuna durata di permanenza | Le misure vanno da T in avanti fino all'evento (tramonto, Earthset, fine della notte), come chiede la challenge |
| Scala di pendenza su 100 m | 🟢 < 8° (HLS) · 🟡 8–10° (Artemis III, CLPS) · 🟠 10–15° (rover VIPER) · 🔴 > 15° |
| Buio continuo | Avviso rosso se la prima notte supera **50 ore**, il limite del rover VIPER (NASA). Nessun modello termico |
| Visibile (C3) | Sole e Terra contano come visibili quando se ne vede **almeno metà del disco**. La frazione si salva sempre e si mostra ("Sole visibile al 70%"); la soglia resta un parametro |
| Passo temporale | 1 ora |
| Illuminazione annua (C6) | Picco se almeno l'**80%** di ore di Sole nell'anno (Scelta del team), mostrato accanto al massimo noto del polo sud: 92,27% a 2 m (Gläser et al. 2014) |
| Tenuta (C7) | Un punto regge j giorni se a T + j è ancora papabile; una regione se ha ancora punti papabili. Ritardi e anticipi separati, solo serie senza buchi, fino a ± 3 giorni. La NASA favorisce le regioni meno sensibili alle date (LPSC 2026) |
| Punti papabili (C4) | Una cella di 100 m è papabile se all'istante T vede il Sole e la Terra e ha pendenza < 10°. Restano **interni**, non si mostrano sulla mappa. Una regione senza punti papabili è scartata, con il motivo |
| Confronto tra regioni (C5) | Senza pesi: 1) tenuta ± 1–3 giorni, 2) area papabile, 3) ore di luce del punto migliore, 4) ore di contatto con la Terra. Tabelle ordinabili dall'utente |
| Ombre permanenti (C1) | **Solo un livello sulla mappa**: non entrano nella valutazione delle regioni |

---

## 2. Cosa manca da definire

In ordine di urgenza: le prime voci bloccano la scrittura del codice, le ultime si possono decidere con i risultati in mano.

### 2.1 Criteri

Tutti decisi (C1–C7, 15/11/2026). Le soglie si rivedono dopo i primi calcoli sulle 2 regioni di sviluppo.

### 2.2 Dati e calcolo

| # | Cosa | Quando |
|---|---|---|
| — | **DEM del polo sud**: PDS `ldem_*` o PGDA ADJ (più recenti, con pendenze e ombre a 20 m, leggibili a pezzi) | Con un confronto sulle 2 regioni di sviluppo |
| D8 | **Griglia delle maschere d'orizzonte**: 100 m o più larga | Dopo aver misurato i tempi |
| — | **Raggio del terreno lontano** per la maschera | Con il port del prototipo |
| — | **Anni di effemeridi** in cache | Prima del primo calcolo |
| — | **Siti fuori dal polo**: quali misure hanno senso all'equatore e sulla faccia nascosta | Con la tabella dei siti |
| D2 | **Regioni attive** a regime | Proposta: tutte le 13 |

### 2.4 Da decidere con il frontend

| # | Cosa |
|---|---|
| D12 | **Formato delle celle** per una futura mappa: da definire con il renderer; le schermate attuali consumano contorni e risultati aggregati, non una griglia di punti |
| — | **Formato di `/api/sites` definito** nel contratto v2: si preserva il GeoJSON esistente e si migra esplicitamente `apollo11` → `apollo-11`; da implementare l'adapter frontend |
| — | **API dei flussi attuali definite** nel contratto v2: `/api/ranking`, criteri del punto nello scenario, eclissi, orbite e visualizzazioni; da implementare backend e collegamento frontend |
| — | **Schemi delle risposte definiti** in `docs/api-contract.openapi.json`; da tradurre in modelli Pydantic e verificare sull'OpenAPI emesso dal server |
| — | **Strumenti dell'agente AI**, da adattare dai siti alle regioni |

### 2.5 Pulizia tecnica (non blocca l'algoritmo)

- **Due cartelle di dati:** `data/` (regioni, siti, fonti) e `backend/data/` (dati di Kevin). Da unificare.
- **Due sistemi di download e manifest**: il nostro (`app.core.manifest`) e quello di Kevin (`app.services.sources` / `storage`). Conviene usarne uno.
- ⚠️ **Stato delle missioni CLPS** (date e bersagli) da ricontrollare prima della consegna.
- ⚠️ **Lettura dei DEM da una cartella montata su Windows**: va misurata la velocità.

---

## 3. Ordine di lavoro proposto

1. **Criteri:** tutti decisi (C1–C7). Si rivedono le soglie dopo i primi calcoli.
2. **Scegliere il DEM del polo sud** (PDS o ADJ), con un confronto rapido su de Gerlache Rim 2 e Malapert Massif.
3. **Scaricare i dati** delle 2 regioni di sviluppo (DEM, `lpsr`, `avgvisib`), con il manifest.
4. **Portare il prototipo** (effemeridi e maschera d'orizzonte) in `backend/app/services/`, con i suoi test.
5. **Calcolare le 2 regioni** con i criteri 1–10, misurando i tempi, poi decidere D8.
6. **Validare** con i dati indipendenti (Fase 6 del piano).
7. **Rivedere le soglie** guardando i risultati.
8. **Estendere** a tutte le 13 regioni e ai siti.
9. **Collegare il frontend** (D12 e formati delle API).
