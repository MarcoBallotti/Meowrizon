# Regioni di atterraggio in Moonrizon

**Perimetro V1 approvato il 15/11/2026:** confronto puntuale di 2–3 punti nelle due regioni di sviluppo, con date esplicite, finestra finita, Horizons topocentrico, terreno/dischi/eclissi, slope e validazione. Griglia e aree regionali, P50 annuale, robustezza aggregata e siti globali sono V2. Le sezioni che li descrivono restano specifiche future. Libreria/CLI/JSON prima; HTTP e frontend dopo. Prevalgono [criteri-algoritmo.md](criteri-algoritmo.md) e [piano-logica.md](piano-logica.md).

**Revisione fonti del 15/11/2026:** fonti scientifiche NASA o istituzionali USA, con responsabilità del prodotto dichiarata. Registro delle sostituzioni, lacune e perimetro minimo approvato in [fonti-e-perimetro-challenge.md](fonti-e-perimetro-challenge.md). La riduzione è approvata; le definizioni V2 restano documentate per gli sviluppi successivi.

**Perimetro V1 approvato il 15/11/2026:** confronto puntuale di 2–3 punti nelle due regioni di sviluppo, con date esplicite, finestra finita, Horizons topocentrico, terreno/dischi/eclissi, slope e validazione. Griglia e aree regionali, P50 annuale, robustezza aggregata e siti globali sono V2. Le sezioni che li descrivono restano specifiche future. Libreria/CLI/JSON prima; HTTP e frontend dopo. Prevalgono [criteri-algoritmo.md](criteri-algoritmo.md) e [piano-logica.md](piano-logica.md).

**Revisione fonti del 15/11/2026:** fonti scientifiche NASA o istituzionali USA, con responsabilità del prodotto dichiarata. Registro delle sostituzioni, lacune e perimetro minimo approvato in [fonti-e-perimetro-challenge.md](fonti-e-perimetro-challenge.md). La riduzione è approvata; le definizioni V2 restano documentate per gli sviluppi successivi.

Questo documento descrive come confrontare **le condizioni geometriche e topografiche delle regioni lunari** a una data e un'ora. È allineato alle decisioni approvate il **15/11/2026** in `docs/criteri-algoritmo.md`; il piano operativo è in `docs/piano-logica.md` e la guida alle fonti in `docs/guida-dati.md`.

L'elenco usato dal progetto resta nel catalogo `backend/catalog/` (`regions.toml` e `sites.toml`). Il comando esistente `python -m app.cli init-regions` acquisisce i contorni e crea i GeoJSON. Questa revisione aggiorna solo la specifica: non modifica cataloghi, engine o frontend.

## 1. La domanda e la risposta

L'input scientifico è l'istante **T in UTC**. Non si richiedono tipo di veicolo o durata di permanenza. I risultati comprendono:

1. condizioni di Sole e Terra a T, finestre successive e durata del buio;
2. distribuzione della pendenza e aree con visibilità congiunta, complessive e sotto più soglie descrittive;
3. continuità spaziale, sensibilità alle date vicine e qualità dei dati.

Il confronto non produce un vincitore assoluto: le regioni possono offrire vantaggi diversi. L'ordinamento deve specificare la metrica scelta. Nessuna regione viene dichiarata sicura o inadatta per qualsiasi mezzo.

I siti sono punti nominali analizzati separatamente dalle regioni, con fonte e incertezza. La precisione delle loro coordinate può essere molto diversa dalla dimensione della griglia.

## 2. Settore, regioni e siti

| Livello | Definizione | Provenienza |
|---|---|---|
| Settore | Polo sud, a sud di 84°S; si tengono interi i poligoni che intersecano il settore | Scelta del team basata sugli studi storici Artemis |
| Regione | Poligono entro cui aggregare le misure | Catalogo NASA 2022 distribuito da Moon Trek |
| Cella | Elemento quadrato di 100 × 100 m per il campionamento e la stima delle aree | Griglia del progetto |
| Sito | Coordinata documentata, precisa oppure nominale/illustrativa a seconda della fonte | Catalogo locale con fonte obbligatoria |

La **cella di 100 m**, la **finestra di misura della pendenza** e la **dispersione di un atterraggio** sono concetti distinti. La griglia non rappresenta un requisito universale dei lander.

## 3. Perché si campiona la regione

Una regione può contenere creste illuminate, pendii temporaneamente in ombra e fondi di crateri senza luce solare diretta. Il centro geografico non rappresenta necessariamente queste condizioni.

Si misura quindi ogni cella, mantenendo il punto di campionamento e la qualità dei dati. Le misure puntuali campionate sostengono una stima regionale alla scala dichiarata: non provano che tutti i metri quadrati della cella siano uniformi.

Una cella non valutabile per mancanza di terreno o effemeridi resta **sconosciuta**, non viene classificata come sfavorevole. La copertura va riportata per ogni metrica.

## 4. Come si misura il terreno

### 4.1 Pendenza

La pendenza è l'inclinazione di un piano adattato al DEM su una finestra **circolare di diametro 100 m** centrata nel punto. Il supporto circolare consente un confronto metodologicamente coerente con il prodotto NASA PGDA su base 100 m; un fit quadrato richiederebbe un confronto separato.

| Fascia descrittiva | Intervallo |
|---|---|
| 1 | 0 ≤ s < 5° |
| 2 | 5 ≤ s < 10° |
| 3 | 10 ≤ s < 15° |
| 4 | s ≥ 15° |

Le fasce sono **scelte del team**, uguali per tutte le regioni. Si conserva il valore continuo, il supporto, il DEM e l'incertezza. Non rappresentano capacità dei mezzi; **il filtro automatico a 10° è eliminato**.

Un DEM troppo grossolano o con qualità insufficiente non diventa adeguato interpolandolo. In quel caso la pendenza a questa scala è non valutabile; altre misure con dati sufficienti possono restare disponibili.

### 4.2 Orizzonte e frazioni visibili

La maschera d'orizzonte usa il terreno reale, la curvatura lunare e un osservatore di riferimento a **2 m sopra il suolo**. Il campionamento iniziale di 360 direzioni è da verificare con risoluzioni più fitte e propagazione dell'incertezza.

Le effemeridi provengono da **JPL Horizons**. Si calcolano per ogni punto azimut ed elevazione rispetto all'orizzontale; il margine sopra il terreno è una misura separata. La frazione del disco usa il profilo sulla sua intera estensione, con approssimazioni dichiarate e verificate.

La frazione solare disponibile considera anche le eclissi causate dalla Terra, distinguendole dalle occultazioni del terreno. La convenzione di visibilità del progetto è **frazione ≥0,5** per entrambi i corpi. La visibilità terrestre è geometrica, non una garanzia di comunicazione.

## 5. Specifica estesa: aggregazioni V2 e finestre puntuali V1

### 5.1 Visibilità congiunta e aree cumulative — V2

**B(T)** è l'insieme delle celle con Sole e Terra visibili a T. Non contiene un vincolo di pendenza.

Per ogni regione si restituiscono:

| Misura | Definizione |
|---|---|
| Area congiunta | Area delle celle di B(T) |
| A5 | Area di B(T) con pendenza <5° |
| A10 | Area di B(T) con pendenza <10° |
| A15 | Area di B(T) con pendenza <15° |
| Distribuzione della pendenza | Area nelle quattro fasce descrittive, con copertura valida |
| Maggiore area continua | Area della maggiore componente connessa di B(T) e, separatamente, di A5, A10 e A15 |

A5, A10 e A15 sono **cumulative**, non fasce da sommare. La connettività considera le **quattro celle che condividono un lato**; il contatto in un solo vertice non forma una zona continua.

Le aree sono espresse in km² e in percentuale dell'area regionale, con correzione della proiezione e clipping dei bordi. Sono aree sulla superficie di riferimento, non superfici aumentate dalla pendenza mediante un fattore `1/cos(s)`. La copertura geometrica e quella della pendenza sono riportate separatamente.

Se la copertura è incompleta, la somma delle celle note favorevoli è un **limite inferiore dell'area campionata** e viene marcata parziale. Uno zero con dati mancanti non dimostra l'assenza di zone congiuntamente visibili.

### 5.2 Finestre e anno

- **Luce continua:** durata da T fino alla prima discesa della frazione solare sotto 0,5.
- **Visibilità geometrica continua della Terra:** stessa regola per il disco terrestre.
- **Buio completo:** intervalli con frazione solare pari a zero, distinti dagli intervalli sotto 0,5.
- **Anno (solo V2):** percentuale di durata con frazione solare ≥0,5 nell'anno UTC della data, di 365 o 366 giorni. L'80% evidenzia alta disponibilità secondo la scelta del team; non certifica energia sufficiente.
- **Eventi non chiusi:** in V1 la ricerca si arresta al limite della finestra richiesta o dei dati disponibili; l’estensione automatica è V2. Si espongono limiti temporali e stati di censura; non si inventano albe o tramonti.
- **Riferimento VIPER:** 50 ore in ibernazione solo come nota storica specifica, senza allarme generale o effetto sul confronto.

La frazione media del disco visibile, il tempo con qualsiasi luce e il tempo sopra il 50% sono metriche differenti. Il 92,27% dello studio Gläser non è un massimo universale direttamente confrontabile con la percentuale annuale del progetto.

### 5.3 Robustezza regionale rispetto alle date — V2

Si ripetono le misure a T e a T±1, ±2, ±3 giorni. Si distinguono:

1. **alternative nella regione:** area di B a ciascuna data;
2. **tenuta della stessa zona:** area dell'intersezione delle celle di B alle date considerate.

Le stesse misure si calcolano per le aree sotto 5°, 10° e 15°. Le intersezioni includono sempre T e sono distinte per anticipi e ritardi: {T,T−1,…,T−k} e {T,T+1,…,T+k}, con k da 1 a 3. Un risultato sfavorevole a +1 giorno non cancella quello a +2. Le date sono campioni discreti: per affermare continuità durante l'intero intervallo occorrono serie temporali e ricerca degli eventi.

### 5.4 Confronto senza idoneità universale

Si confrontano le colonne esplicitamente; non esistono punteggio complessivo, pesi o ordine lessicografico automatico. La regione con più area poco inclinata può non essere quella con la finestra solare più lunga.

Quando si riportano più prestazioni di un **punto rappresentativo**, si conserva lo stesso identificatore e tutte le misure appartengono a quel punto. I massimi ottenuti in celle diverse restano risultati distinti.

Se nessuna cella soddisfa la concomitanza e la copertura della regione è completa, il risultato è “nessuna cella con Sole e Terra visibili contemporaneamente a T”. Con copertura parziale questa affermazione vale soltanto per il sottoinsieme noto. Non si attribuisce falsamente l'assenza a un singolo astro se in realtà le aree dei due non si sovrappongono.

## 6. Crateri e ombre permanenti

La topografia dei crateri è già nel DEM e influisce su pendenza e orizzonte. I nomi delle formazioni aiutano a identificare i luoghi; non definiscono automaticamente una zona favorevole.

Le ombre permanenti sono un livello informativo e un riferimento di validazione, **senza filtro o peso aggiuntivo**. Per la validazione occorrono condizioni coerenti: una mappa della superficie non prova che anche un punto a 2 m sia sempre in ombra. Il modello non stima temperatura o presenza certa di ghiaccio.

## 7. Output scientifico e attività successive

L'engine dovrà fornire misure, identificatori, unità, copertura, incertezza, cause delle occultazioni e provenienza. Non usa una durata di missione predefinita e non simula un veicolo.

La realizzazione e l'integrazione del frontend saranno affrontate **dopo l'algoritmo**, come richiesto dall'utente. Le vecchie proposte di punteggi, colori di sicurezza e classifica unica sono sostituite dalle regole di questo documento.

## 8. Le regioni

### 8.1 Da dove vengono

Le geometrie delle regioni provengono dal **catalogo storico NASA 2022 delle candidate Artemis III**, distribuito da Moon Trek. Non sono un elenco aggiornato o una certificazione dei siti delle missioni attuali. I poligoni si acquisiscono dal servizio:

```text
https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json
```

- La risposta (circa 4 KB) contiene, per ogni regione, il nome (`label`) e i vertici del poligono.
- I vertici sono in **metri, nella proiezione stereografica polare sud** (`Moon2000_spole`, sfera di raggio 1 737 400 m). Ogni regione è un **quadrato con gli angoli su multipli di 100 m**.
- Si convertono in latitudine e longitudine con `pyproj`: verificato contro la formula della stereografica scritta a mano.
- Con `f=geojson` il servizio rifiuta il sistema di riferimento lunare: va usato `f=json` e convertito noi.
- Su Moon Trek una regione si chiama "Peak Near Shakleton" (senza la "c"): il catalogo tiene separati il nome corretto e l'etichetta esatta.
- Il layer contiene **13 regioni, la lista NASA del 2022**. Nel 2024 la NASA ha ridotto la lista a **9 regioni**: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2 e Slater Plain. Il catalogo locale conserva i 13 poligoni del 2022: non si aggiungono confini privi di una geometria verificata. La corrispondenza dei nomi richiede attenzione agli alias: Mons Mouton è associato al precedente nome Leibnitz Beta Plateau, ma il nome non dimostra l'identità dei contorni. I campi di appartenenza alle liste nella tabella seguente riproducono il catalogo del 14/11 e vanno verificati con questa distinzione prima di aggiornarli.

### 8.2 Le 13 regioni candidate di Artemis III (dal layer di Moon Trek)

Valori prodotti da `init-regions` il 14/11/2026.

- **Centro:** centro geometrico del quadrato calcolato in metri e poi convertito. Una versione precedente di questa tabella faceva la media di latitudini e longitudini dei vertici, che vicino al polo sposta il risultato fino a quasi 8° di longitudine (Connecting Ridge).
- **Area:** misurata sulla sfera, perché la stereografica non conserva le aree.
- **DEM:** il DEM LOLA polare della PDS più fine che copre per intero la regione. La copertura è ricavata dalle etichette PDS: ±75,84 km dal polo per `ldem_875s_5m`, ±151,68 km per `ldem_85s_10m`, ±304 km per `ldem_80s_20m`.

| Regione | Liste | Centro (lat, lon E) | Lato | Area | Celle da 100 m | DEM |
|---|---|---|---|---|---|---|
| Connecting Ridge | 2022 | −89,46°, 222,51° | 16 km | 256,0 km² | 160 × 160 | `ldem_875s_5m` |
| Connecting Ridge Extension | 2022 | −89,03°, 258,00° | 20 km | 399,9 km² | 200 × 200 | `ldem_875s_5m` |
| Peak Near Shackleton | 2022 | −88,81°, 123,69° | 16 km | 255,9 km² | 160 × 160 | `ldem_875s_5m` |
| de Gerlache Rim 1 | 2022 | −88,68°, 292,07° | 16 km | 255,9 km² | 160 × 160 | `ldem_875s_5m` |
| **de Gerlache Rim 2** | 2022, 2024 | −88,23°, 295,37° | 20 km | 399,8 km² | 200 × 200 | `ldem_875s_5m` |
| Faustini Rim A | 2022 | −87,89°, 90,00° | 20 km | 399,7 km² | 200 × 200 | `ldem_875s_5m` |
| **Haworth** | 2022, 2024 | −86,76°, 337,22° | 29,8 km | 886,6 km² | 298 × 298 | `ldem_85s_10m` |
| **Malapert Massif** | 2022, 2024 | −85,99°, 359,76° | 21 km | 439,9 km² | 210 × 210 | `ldem_85s_10m` |
| de Gerlache-Kocher Massif | 2022 | −85,83°, 243,68° | 20 km | 398,9 km² | 200 × 200 | `ldem_85s_10m` |
| **Nobile Rim 1** | 2022, 2024 | −85,44°, 37,37° | 20 km | 398,7 km² | 200 × 200 | `ldem_85s_10m` |
| Leibnitz Beta Plateau | 2022 | −85,43°, 31,74° | 16 km | 255,2 km² | 160 × 160 | `ldem_85s_10m` |
| Amundsen Rim | 2022 | −84,23°, 69,44° | 20 km | 398,0 km² | 200 × 200 | `ldem_80s_20m` |
| **Nobile Rim 2** | 2022, 2024 | −83,95°, 58,82° | 20 km | 397,8 km² | 200 × 200 | `ldem_80s_20m` |

In grassetto le corrispondenze letterali con la lista 2024 registrate nel catalogo locale; l'alias Leibnitz Beta Plateau / Mons Mouton resta da riconciliare geometricamente. Nobile Rim 2 ha il centro poco a nord di 84°S, ma una parte sta nel settore: si tiene intera.

### 8.3 Regioni consigliate per partire

Nel catalogo sono attive (`active = true`) due regioni presenti in entrambe le liste NASA:

- **de Gerlache Rim 2** (88,2°S): coperta per intero dal DEM a 5 m del polo; la sua parte a sud di 88°S è dentro la mappa di illuminazione LROC, quindi validabile con immagini reali;
- **Malapert Massif** (86,0°S): rilievo esteso, condizioni di luce e di Terra diverse dalla prima.

Connecting Ridge, proposta in una prima versione, non è più nella lista 2024. Due regioni con comportamenti diversi consentono di verificare come cambiano le misure e i confronti con la data. Le altre si attivano nel catalogo quando la pipeline funziona.

### 8.4 Siti

**Catalogo del team (14/11/2026), interpretazione aggiornata il 15/11.** Il catalogo contiene **9 siti**. Le misure valutabili dipendono dalla qualità delle coordinate e del terreno; la presenza nel catalogo non garantisce una valutazione locale a 100 m:

- **12 atterraggi riusciti tra i più conosciuti dal pubblico**: tutti quelli con equipaggio, più le missioni robotiche con un primato storico. Niente atterraggi falliti né riusciti solo in parte: IM-1, IM-2 e SLIM si sono rovesciati;
- **4 missioni CLPS future**. Non hanno ancora un punto di atterraggio pubblicato, quindi il punto è il **centro della formazione bersaglio**: indica la zona, non il punto in cui atterreranno.

I siti possono stare ovunque sulla Luna: **il limite di 84°S vale solo per le regioni**. Un sito fuori dal settore ha `in_sector = false` e il suo terreno verrà da un DEM globale, ancora da scegliere (⚠️).

Ogni sito sta in `backend/catalog/sites.toml` con nome, coordinate planetocentriche (sistema Mean Earth, sfera di 1737,4 km), tipo (`atterrato`, `previsto`, `personalizzato`), data di atterraggio e **fonte obbligatoria**. Il comando `init-regions`:

- rifiuta un sito senza fonte, con coordinate fuori intervallo o con data non valida;
- per i siti nel settore calcola la posizione in metri, la cella di 100 m, la regione Artemis in cui cadono e il DEM polare che li copre.

| Sito | Data | Lat | Lon E | Fonte delle coordinate | Perché |
|---|---|---|---|---|---|
| Apollo 11 | 1969-07-20 | 0,67416 | 23,47314 | Moon Trek / NSSDCA | Primi esseri umani sulla Luna |
| Apollo 12 | 1969-11-19 | −3,0128 | −23,4219 | Moon Trek / NSSDCA | Atterraggio di precisione accanto a Surveyor 3 |
| Apollo 14 | 1971-02-05 | −3,64589 | −17,47194 | Moon Trek / NSSDCA | Missione con equipaggio |
| Luna 9 | 1966-02-03 | 7,13 | −64,37 | Moon Trek / NSSDCA | Primo atterraggio morbido |
| Chang'e 6 | 2024-06-01 | −41,6385 | 206,0148 | LROC 1374 (±30 m) | Primi campioni dalla faccia nascosta |
| Griffin-1 *(previsto)* | — | −84,6 | 31,0 | USGS Gazetteer (nomi IAU), centro di Mons Mouton | CLPS, polo sud. **Nel settore** |
| Blue Moon MK1 Pathfinder *(previsto)* | — | −89,4632 | −137,4896 | Centro della regione Artemis Connecting Ridge | CLPS, polo sud. **Nel settore**, dentro Connecting Ridge |
| IM-3 *(previsto)* | — | 7,3853 | 301,0417 | USGS Gazetteer (nomi IAU), centro di Reiner Gamma | CLPS, vortice lunare |
| Blue Ghost M2 *(previsto)* | — | −24,9137 | 177,337 | IAU, centro del cratere Nassau | CLPS, faccia nascosta |

Note:

- "Moon Trek / NSSDCA" è il layer *Lunar Anthropogenic Impacts and Spacecraft Sites* (`Lunar_Landing_Impact_Sites`), del novembre 2022. Le missioni successive vengono dalle pagine LROC, con la posizione del lander misurata nelle immagini di LRO.
- **Luna 9:** NASA NSSDCA segnala l'incertezza delle coordinate storiche e una possibile distanza di almeno 10 km dal punto reale. La coordinata può essere analizzata come punto nominale, ma non usata per validare pendenza o orizzonte del lander alla scala di 100 m.
- **Centri di formazioni bersaglio:** i risultati descrivono il centro nominale analizzato, non il futuro atterraggio. Fonte, tipo di coordinata e incertezza devono accompagnare le misure.
- **Siti sulla faccia nascosta:** assenza di visibilità geometrica della Terra non implica impossibilità di una missione con relay. Restano nel confronto con questa proprietà esplicita.
- Per Griffin-1 il punto è Mons Mouton e non il cratere Nobile, perché il centro di Nobile cade sul fondo del cratere, probabilmente in ombra permanente.
- ⚠️ Lo stato delle missioni CLPS va ricontrollato: al 14/11/2026 Griffin-1 è previsto non prima di novembre 2026, le altre nel 2027.
- Possibili aggiunte con lo stesso criterio: CP-12 (bacino di Schrödinger) e Blue Ghost M3 (Gruithuisen Domes).

---

## 9. Estensioni regionali/globali V2 da definire e verificare

Il confine a 84°S è confermato nel catalogo sulla base degli studi storici Artemis. Vale solo per le regioni: i siti possono stare ovunque.

- **Regioni attive.** Quali delle 13 con contorno attivare oltre alle due di sviluppo.
- **DEM globale** per valutare i siti fuori dal settore.
- **Prestazioni e campionamento.** Le celle sono da 100 m. Eventuali approssimazioni per accelerare le maschere richiedono una prova di convergenza e una misura degli effetti su finestre e aree.
- **Validazione.** I criteri sono approvati nella revisione del 15/11/2026; restano prodotti, tolleranze numeriche e risultati di verifica da documentare in `docs/stato-decisioni.md`.

---

## Fonti

- NASA Space Apps Challenge 2026, Lunar Landing Site Navigator: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- Moon Trek, layer "Artemis III Candidate Landing Regions" (`A3_Named_regions_SP`) e catalogo dei prodotti: https://trek.nasa.gov/moon/
- NASA, annuncio delle 13 regioni (2022): https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- NASA, aggiornamento a 9 regioni (28 ottobre 2024): https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/
- Requisiti di atterraggio Artemis III (6° dal polo, pendenza su 100 m, precisione 100 m): L. Ortiz, NASA, *Artemis Human Landing System Overview*, Space Apps Challenge 2025, NTRS 20250009323
- DEM LOLA polari ed etichette PDS: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/

- NASA NSSDCA, coordinate e avvertenze dei siti storici (nota su Luna 9): https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
- NASA PGDA, terreno e pendenze a supporto dichiarato: https://pgda.gsfc.nasa.gov/products/90
