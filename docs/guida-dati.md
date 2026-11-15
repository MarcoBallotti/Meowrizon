# Guida ai dati per Lunar Landing Site Navigator

Questa guida spiega come ricavare dalle fonti della challenge (JPL Horizons, NASA Moon Trek, LROC QuickMap) le informazioni che servono a Moonrizon: la posizione di Sole e Terra rispetto all'orizzonte **reale** di un sito lunare, e da lì potenza solare, finestre di comunicazione con la Terra e tempo rimanente a tramonto del Sole e tramonto della Terra.

Le chiamate marcate ✅ sono state provate il 2026-11-14 e hanno risposto correttamente. Le parti marcate ⚠️ vanno verificate prima di scriverci codice.

---

## 1. Il problema in una frase

Per ogni coppia **(sito, intervallo di date)** bisogna sapere, istante per istante:

1. **dove sono Sole e Terra nel cielo del sito** (azimut ed elevazione): lo dà Horizons, oppure SPICE;
2. **quanto è alto l'orizzonte del terreno in quella direzione**: lo dà il DEM LOLA di Moon Trek;
3. **se l'astro è sopra o sotto quell'orizzonte**. È un confronto tra 1 e 2, ed è il calcolo che dobbiamo fare noi.

Horizons da solo non basta. Calcola l'elevazione rispetto a una **Luna sferica liscia** e non conosce montagne e crateri. Al polo sud il Sole sta a pochi gradi sopra l'orizzonte geometrico, mentre i rilievi intorno arrivano spesso a 2–5°. Senza il terreno il risultato è sbagliato proprio dove conta.

L'obiettivo di Moonrizon va oltre: **dati una data e un'ora, trovare i luoghi migliori dove atterrare**. Lo stesso calcolo si ripete quindi su una griglia di punti, come descritto nella sezione 5 bis.

Il punto chiave per le prestazioni: **l'orizzonte del terreno di un sito non dipende dalla data**. Si calcola una sola volta per sito (la "maschera d'orizzonte") e si riusa per tutte le date. Il confronto tra date diverse, che è il cuore della challenge, diventa quindi quasi istantaneo.

---

## 2. JPL Horizons

### Com'è fatta l'API

- **Endpoint:** `GET https://ssd.jpl.nasa.gov/api/horizons.api`
- **Documentazione:** https://ssd-api.jpl.nasa.gov/doc/horizons.html
- **Autenticazione:** nessuna. Servizio pubblico "best effort", senza garanzie di disponibilità.
- **Formato:** `format=json` restituisce un JSON con il campo `result`, che contiene il testo della tabella, ed eventualmente `error`. Con `CSV_FORMAT='YES'` le righe della tabella sono separate da virgole.
- **Delimitatori:** i dati stanno tra le righe `$$SOE` (start of ephemeris) e `$$EOE`.
- **Attenzione:** se l'input è sbagliato, Horizons può rispondere comunque **HTTP 200** con un messaggio d'errore dentro `result`. Va controllato sempre che `$$SOE` sia presente.
- I valori dei parametri vanno tra apici singoli. Il `;` va codificato come `%3B` e gli spazi come `%20`.

### Parametri che ci servono

| Parametro | Valore | Significato |
|---|---|---|
| `COMMAND` | `'10'` = Sole, `'399'` = Terra | L'astro osservato |
| `CENTER` | `'coord@301'` | Osservatore su un punto della superficie della Luna (301) |
| `COORD_TYPE` | `'GEODETIC'` | Coordinate del sito come longitudine e latitudine |
| `SITE_COORD` | `'lon_est,lat,alt_km'` | Ad esempio `'0,-89.45,0'`. Longitudine **est positiva** (0–360 o ±180), altitudine in km |
| `EPHEM_TYPE` | `'OBSERVER'` | Tabella di osservazione |
| `QUANTITIES` | `'4,20'` | 4 = azimut ed elevazione apparenti; 20 = distanza e velocità radiale (facoltativo, serve per il diametro apparente) |
| `START_TIME`, `STOP_TIME` | `'2026-12-01'`, `'2026-12-31'` | Intervallo in UT |
| `STEP_SIZE` | `'30%20m'`, `'1%20h'` | Passo di campionamento |
| `CSV_FORMAT` | `'YES'` | Righe facili da leggere con un parser |
| `MAKE_EPHEM`, `OBJ_DATA` | `'YES'`, `'NO'` | Genera la tabella senza il blocco descrittivo dell'oggetto |

### Esempio verificato ✅

```bash
curl "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='10'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='0,-89.45,0'&START_TIME='2026-12-01'&STOP_TIME='2026-12-01%2006:00'&STEP_SIZE='2%20h'&QUANTITIES='4,20'&CSV_FORMAT='YES'"
```

Righe ricevute:

```text
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),             delta,     deldot,
$$SOE
 2026-Dec-01 00:00,*, , 280.049441,     1.566177,  0.98633151640990, -1.2237764,
 2026-Dec-01 02:00,*, , 279.036190,     1.556116,  0.98627261410199, -1.2238544,
$$EOE
```

Come leggerle:

- **Colonna 2:** `*` vuol dire Sole sopra l'orizzonte geometrico (giorno). Vuota vuol dire notte. Altri simboli indicano crepuscolo o eclissi.
- **Azimut:** in gradi da nord verso est.
- **Elevazione:** in gradi sopra il piano orizzontale locale della sfera.
- **Delta:** distanza in UA. Il deldot è in km/s.

Dall'intestazione si capisce come Horizons modella il sito:

- **Luna sferica:** `Center radii: 1737.4, 1737.4, 1737.4 km`, la stessa sfera di riferimento dei DEM LOLA. Questo è un vantaggio: le quote combaciano.
- **Frame:** `Center pole/equ: MEAN_ME`, il frame Mean Earth / polar axis, lo stesso dei prodotti LOLA.
- **Niente rifrazione:** `Atmos refraction: NO (AIRLESS)`, come chiede la challenge.
- **Effemeridi:** `source: DE441`. Librazione e variazioni orbitali sono già incluse, così la richiesta della challenge sulla librazione è coperta.

### Come usarlo bene

- **Due query per sito e per intervallo:** una per il Sole e una per la Terra. Al polo sud il Sole si muove in azimut di circa 0,5° all'ora, quindi un passo di **30–60 minuti** basta. Gli istanti di tramonto si ricavano poi interpolando tra due campioni.
- **Spezzare gli intervalli lunghi** in blocchi di un mese o due, per non avere risposte enormi.
- **Salvare ogni risposta su disco** in `data/cache/`, con chiave = parametri della richiesta, e non rifare mai la stessa chiamata. Horizons è un servizio condiviso: niente richieste in parallelo aggressive.
- **Non passare latitudine esattamente −90°.** Al polo l'azimut non è definito; meglio usare ad esempio −89.99°.

### Alternativa offline: SPICE con SpiceyPy (consigliata in produzione)

Lo stesso calcolo si fa in locale con SpiceyPy, già previsto in `backend/app/services/ephemerides/`. È più veloce, funziona senza rete e non ha limiti di richieste. La funzione `spiceypy.azlcpo` calcola direttamente azimut ed elevazione da un punto di superficie. In alternativa si prende il vettore Sole o Terra nel frame `MOON_ME` con `spkpos` e lo si proietta sul sistema locale, come nella sezione 5.

Kernel NAIF da scaricare da https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ e da mettere in `data/kernels/` ⚠️ (i nomi esatti dei file vanno verificati sul sito):

- **tempo:** `lsk/naif0012.tls` (secondi intercalari);
- **effemeridi:** `spk/planets/de440s.bsp` o `de440.bsp` (posizioni di Sole, Terra e Luna);
- **costanti:** `pck/pck00011.tpc` (costanti dei corpi);
- **orientamento della Luna:** `pck/moon_pa_de440_*.bpc` (orientamento preciso, frame PA);
- **definizione dei frame:** `fk/satellites/moon_de440_*.tf` (frame `MOON_ME` e `MOON_PA`).

**Strategia:** sviluppare con SPICE e confrontare qualche caso con Horizons. Se le differenze restano sotto 0,01°, l'implementazione è corretta.

---

## 3. NASA Moon Trek

Moon Trek non è solo un visualizzatore: dietro c'è un **catalogo interrogabile** e due tipi di servizi per ogni prodotto, tutti senza autenticazione.

### 3.1 Il catalogo dei prodotti

| A cosa serve | URL |
|---|---|
| Elenco prodotti, polo sud ✅ | `https://trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems?proj=urn:ogc:def:crs:IAU2000::30120&start=0&rows=2000&facetKeys=itemType&facetValues=product` |
| Elenco prodotti, globale ✅ | `https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems?proj=urn:ogc:def:crs:EPSG::104903&start=0&rows=3000&facetKeys=itemType&facetValues=product` |
| Servizi di un prodotto ✅ | `https://trek.nasa.gov/moon/TrekServices/ws/index/getLayerServices?uuid=<item_UUID>` |
| Descrizione testuale ✅ | `https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=<productLabel>` |

Le risposte sono JSON in stile Solr (`response.docs[]`), con `productLabel`, `title`, `item_UUID`, `resolution` (m/px), `fileSize`, `serviceTypes` e `projection` (WKT). Al momento il polo sud conta 396 prodotti e il globale 1256. I file vanno letti in **UTF-8**: con la codifica di default di Windows il parsing fallisce.

Le proiezioni usate:

| Codice | Significato |
|---|---|
| `EPSG::104903` | GCS_Moon_2000, latitudine e longitudine semplici (globale) |
| `IAU2000::30120` | Stereografica polare sud, metri, sfera R = 1 737 400 m |
| `IAU2000::30118` | Stereografica polare nord |

### 3.2 Servizio "raster" (ArcGIS ImageServer): i valori veri ✅

Questo è il servizio più importante per noi: restituisce **i numeri** (quote in metri) e non immagini colorate.

```text
https://trek.nasa.gov/moon/trekarcgis/rest/services/<productLabel>/ImageServer
```

- **Metadati, estensione, limiti:** `.../ImageServer?f=json`. Per il DEM a 5 m del polo sud: estensione ±75 840 m, valori float32, quote da −4382,5 a +2372,5 m, **massimo 15000 × 4100 pixel per richiesta**.
- **Ritaglio come GeoTIFF float32:**
  ```text
  .../ImageServer/exportImage?bbox=xmin,ymin,xmax,ymax&size=W,H&format=tiff&pixelType=F32&f=image
  ```
  Il `bbox` è nelle coordinate della proiezione del prodotto (metri, stereografica polare per il sud). `size` decide la risoluzione: con un bbox di 10 km e `size=2000,2000` si ottengono 5 m/px, con `size=200,200` 50 m/px.
- **Valore di un singolo punto:** `.../ImageServer/identify?geometry={"x":0,"y":0}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`.

I valori del DEM LOLA sono quote in metri **riferite a una sfera di raggio 1 737 400 m**, come dice l'abstract del prodotto. Il raggio di un punto è quindi `1737400 + valore`.

### 3.3 Servizio "Mosaic" (WMTS): immagini per la visualizzazione ✅

```text
https://trek.nasa.gov/tiles/Moon/{EQ|SP|NP}/<productLabel>/1.0.0/WMTSCapabilities.xml
https://trek.nasa.gov/tiles/Moon/EQ/<productLabel>/1.0.0/{Style}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.{png|jpg}
```

Esempio funzionante: `https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/0/0/0.jpg`.

- **Uso:** sono tile di immagini, adatte come base visiva in CesiumJS con `WebMapTileServiceImageryProvider`.
- **Parametri:** stile, TileMatrixSet, livelli ed estensione vanno letti dal `WMTSCapabilities.xml` di ciascun prodotto. Le tile mancanti vogliono dire "nessuna copertura", non errore.
- **Limite:** **non vanno usate per i calcoli**, perché i colori non sono quote.

---

## 4. LROC QuickMap

- **Indirizzo:** https://quickmap.lroc.im-ldi.com/. Il vecchio `quickmap.lroc.asu.edu`, ancora linkato dalla challenge, verrà dismesso.
- **API:** nessuna API pubblica documentata. È un'app web (React, Cesium, OpenLayers).
- **Strumenti utili:**
  - **Visibility Analysis** (il link che abbiamo ricevuto apre questo, con `earthShadowEnabled=true`): ombre e visibilità di Sole e Terra sul terreno;
  - **Create Panorama**: la vista dell'orizzonte da un punto;
  - **globo 3D con terreno**;
  - **Export Image / Download PNG+VRT**: ritagli georeferenziati.
- **Uso per noi:** **solo verifica manuale**. Dopo aver calcolato la maschera d'orizzonte di un sito, la si confronta con il Panorama di QuickMap nello stesso punto. Se profili e picchi combaciano, il calcolo è giusto. Per l'automazione si usano Moon Trek e Horizons o SPICE.

---

## 5. Come procedere: la pipeline consigliata

```text
            ┌───────────────────┐
 sito ─────►│ 1. DEM (Moon Trek)│──► ritaglio GeoTIFF multi-risoluzione (cache)
            └─────────┬─────────┘
                      ▼
            ┌───────────────────┐
            │ 2. Maschera       │──► per ogni azimut: elevazione dell'orizzonte
            │    d'orizzonte    │    (calcolata UNA volta per sito, salvata)
            └─────────┬─────────┘
                      ▼
 date ─────►┌───────────────────┐
            │ 3. Effemeridi     │──► az/el di Sole e Terra nel tempo (SPICE o Horizons, cache)
            └─────────┬─────────┘
                      ▼
            ┌───────────────────┐
            │ 4. Confronto      │──► luce/ombra, Terra visibile, istanti di alba/tramonto
            └─────────┬─────────┘
                      ▼
            ┌───────────────────┐
            │ 5. Metriche       │──► % di luce, notte più lunga, finestre DTE, tempo a sunset/Earthset
            └─────────┬─────────┘
                      ▼
               API FastAPI ──► frontend (Cesium + grafici)
```

### Passo 1: scaricare il terreno intorno al sito

La maschera d'orizzonte dipende da rilievi **anche molto lontani**. Una montagna alta 5 km a 150 km di distanza si vede ancora sopra l'orizzonte. Conviene quindi un ritaglio a **risoluzione decrescente con la distanza**:

| Anello | Prodotto | Ritaglio | Risoluzione richiesta |
|---|---|---|---|
| Vicino (0–10 km) | `LRO_LOLA_DEM_SPole875_5mp_v04` | 20 × 20 km | 5 m/px (4000 × 4000 px, ~64 MB) |
| Medio (10–75 km) | stesso prodotto | 150 × 150 km | 40–50 m/px |
| Lontano (75–300+ km) | `LRO_LOLA_DEM_SPole75_30mp_v04` (fino a 75°S, ±457 km) | 600 × 600 km | 150–250 m/px |
| Siti non polari (Apollo ecc.) | `LRO_LOLA_DEM_Global_128ppd_v04` (~237 m/px); entro ±60° anche `LRO_LOLAKaguya_DEM_60N60S_512ppd` (~59 m/px) ⚠️ verificare che abbia il servizio raster | come sopra | |

I file vanno salvati in `data/rasters/<sito>/` e mai riscaricati.

Per passare tra latitudine/longitudine e coordinate della proiezione **non vanno scritte le formule a mano**: meglio usare `pyproj`/`rasterio` con la WKT restituita dal servizio, per evitare errori sul verso degli assi.

### Passo 2: calcolare la maschera d'orizzonte (il calcolo più importante)

Per ogni sito si produce una tabella `azimut → elevazione minima visibile`, ad esempio con passo di 0,25°. Il modo più sicuro è lavorare **in 3D, in coordinate cartesiane fisse alla Luna**, così la curvatura è gestita da sola:

1. Convertire ogni pixel del DEM in un punto 3D: raggio = 1 737 400 + quota, più latitudine e longitudine del pixel.
2. Calcolare il punto dell'osservatore: quota del terreno **più l'altezza del pannello o dell'antenna** (ad esempio 1–3 m). È un parametro dell'interfaccia: pochi metri cambiano il risultato.
3. Costruire il sistema locale dell'osservatore: `up` = direzione radiale, `east` = asse polare × up normalizzato, `north` = up × east.
4. Per ogni punto del terreno, con `d` = punto − osservatore:
   - elevazione = `asin(d·up / |d|)`;
   - azimut = `atan2(d·east, d·north)`, da nord verso est come Horizons.
5. Per ogni intervallo di azimut, l'orizzonte è il **massimo** delle elevazioni. Con NumPy si vettorializza tutto. In alternativa si lanciano raggi a passo fisso di azimut, campionando il DEM a distanze crescenti.

Il risultato si salva su disco o in SQLite. È piccolo: circa 1440 numeri per sito.

### Passo 3: effemeridi

Per l'intervallo richiesto si calcolano azimut ed elevazione di Sole e Terra, con passo da 10 a 60 minuti, tramite SPICE (oppure Horizons con cache). Anche questi risultati vanno salvati: sono indipendenti dal terreno e si possono riusare per siti vicini solo se la differenza di posizione è trascurabile. Per sicurezza si ricalcolano per sito, che costa poco.

### Passo 4: confronto con l'orizzonte

Per ogni istante si confronta l'elevazione dell'astro con il valore della maschera allo stesso azimut, interpolando tra due azimut vicini.

**Sole:**
- non è un punto, ha un raggio apparente di circa 0,27°;
- la frazione di disco visibile si calcola con la differenza `elev_sole − orizzonte`, tra −0,27° e +0,27°;
- al polo sud il Sole "striscia" lungo l'orizzonte per giorni, quindi la luce parziale conta molto.

**Terra:**
- raggio apparente di circa 0,95°, perché è grande vista dalla Luna;
- è visibile se `elev_terra − orizzonte > −0,95°`;
- per un margine di comunicazione realistico si può chiedere un'elevazione minima configurabile, ad esempio 2–5°.

**Istanti di alba e tramonto (Sole e Terra):** si cercano i punti in cui la differenza cambia segno e si interpola linearmente tra due campioni.

### Passo 5: metriche da mostrare

| Metrica | Perché conta |
|---|---|
| Elevazione solare attuale e nel tempo | Efficienza dei pannelli |
| % di tempo illuminato nell'intervallo | Energia totale disponibile |
| **Notte più lunga** (ore consecutive senza Sole) | Dimensiona le batterie: al polo è spesso il vero fattore limitante |
| Tempo rimanente al prossimo tramonto e alla prossima alba | Richiesto esplicitamente dalla challenge |
| % di tempo con la Terra visibile, finestre DTE | Comunicazione diretta senza satelliti relè |
| Tempo rimanente al prossimo tramonto della Terra | Richiesto esplicitamente dalla challenge |
| Finestre con **Sole e Terra insieme** | Le ore davvero operative |
| Punteggio sintetico sito/data | Confronto rapido tra scenari |

### Passo 6: validazione

- **Effemeridi:** SPICE contro Horizons in alcuni istanti, con differenza attesa sotto 0,01°.
- **Maschera d'orizzonte:** confronto con il **Panorama di QuickMap** nello stesso punto.
- **Statistiche:** le % calcolate su lunghi periodi vanno confrontate con i prodotti già pronti di Moon Trek:
  - `AVGVISIB_85S_060M_201608_EARTH_SP` (visibilità media della Terra, 60 m/px);
  - `WAC_POLE_ILL_PCT_SOUTH_100M` (illuminazione percentuale);
  - `PSR_SP` (regioni in ombra permanente: lì la luce dovrebbe risultare sempre zero).

  Se siamo nello stesso ordine di grandezza il calcolo è credibile. Non devono coincidere: le loro medie riguardano periodi diversi.

---

## 5 bis. Obiettivo principale: dati data e ora, trovare i luoghi migliori

L'obiettivo di Moonrizon è rispondere a una domanda: **"atterro il giorno X all'ora Y: dove conviene farlo?"**. Non si tratta quindi solo di valutare siti scelti dall'utente, ma di dare un **punteggio a ogni punto di una regione** e restituire una mappa e una classifica. La pipeline della sezione 5 resta valida; cambia la scala: da un sito a una griglia di punti.

### Cosa rende "buono" un luogo in un certo istante

| Criterio | Come si calcola | Tipo |
|---|---|---|
| Sole visibile all'atterraggio | elevazione del Sole − orizzonte > 0 (vedi passo 4) | Vincolo |
| **Tempo di luce rimanente** dopo l'atterraggio | ore fino al prossimo tramonto, sul profilo d'orizzonte del punto | Punteggio (più è lungo, meglio è) |
| Terra visibile all'atterraggio (DTE) | elevazione della Terra − orizzonte > margine | Vincolo o punteggio |
| **Tempo di Terra visibile rimanente** | ore fino al prossimo tramonto della Terra | Punteggio |
| Elevazione solare media nella missione | dalla serie temporale | Punteggio (energia) |
| Pendenza del terreno | da DEM (`Slope_LRO_LOLA_DEM_SPole875_5mp_v04` o calcolata) | Vincolo, ad esempio < 8–10° |
| Fuori dalle ombre permanenti | `PSR_SP` | Vincolo |
| Durata della missione | parametro dell'utente (ad esempio 10 giorni terrestri) | Definisce la finestra in cui valutare luce e Terra |

Il punteggio finale combina questi criteri con **pesi regolabili** dall'interfaccia. Una missione solare con relè non ha bisogno della Terra; una missione con comunicazione diretta sì. I vincoli escludono i punti, i punteggi li ordinano.

### Il problema di calcolo e come risolverlo

Calcolare la maschera d'orizzonte (passo 2) per **ogni pixel** di una regione è costoso, ma va fatto **una volta sola, offline**, perché non dipende dalla data:

- **Griglia di pre-calcolo:** ad esempio la regione entro 87,5°S (150 × 150 km) a 100–200 m di passo, cioè da 0,5 a 2,2 milioni di punti, con 360 direzioni ciascuno (1° di passo) salvate come interi a 16 bit (centesimi di grado). Occupa circa 0,4–1,6 GB su disco, generati una volta da uno script batch e caricati in memoria dal backend. Per regioni più grandi si usa un passo più largo.
- **Una sola direzione del Sole e della Terra per tutta la regione:** la regione è piccola rispetto alla distanza di Sole e Terra (300 km contro 384 000 km per la Terra), quindi in un dato istante la direzione nel sistema fisso alla Luna è praticamente la stessa per tutti i punti. Serve una sola chiamata alle effemeridi per istante, non una per pixel. Per ogni pixel cambia solo il riferimento locale (verticale e nord), un calcolo vettoriale immediato in NumPy.
- **Risposta interattiva:** per una data e ora richieste il backend:
  1. calcola i vettori di Sole e Terra per l'istante e per la finestra di missione successiva;
  2. confronta in blocco, con NumPy, ogni pixel con la propria maschera;
  3. applica pendenza e ombre permanenti;
  4. restituisce una **mappa di punteggio** (un raster o delle tile per Cesium) e la **classifica dei migliori N punti**, raggruppati per non avere 50 pixel vicini nello stesso cratere.

Per il pubblico la mappa si legge a colpo d'occhio: zone verdi dove si può atterrare in quel momento, rosse dove no. Animando la data si vede la luce "ruotare" intorno al polo, che è anche l'aspetto più educativo.

### Ambito consigliato

Conviene partire dalla **regione del polo sud** (entro 87,5°S con il DEM a 5 m, poi fino a 80–75°S con quello a 30 m): è dove la challenge si concentra e dove la scelta di luogo e data conta davvero. Alle latitudini equatoriali (siti Apollo) il Sole sorge e tramonta regolarmente ogni ~29,5 giorni e la Terra, sul lato visibile, è sempre in cielo. Lì la mappa sarebbe quasi uniforme: utile come confronto educativo, non come ricerca.

---

## 6. Cosa è importante, cosa è superfluo

### Importante, da usare

**Effemeridi**
- Horizons API: `EPHEM_TYPE=OBSERVER`, `CENTER=coord@301`, `COMMAND` 10 e 399, `QUANTITIES=4` (più 20 se si vuole il diametro apparente esatto).
- SpiceyPy con i kernel NAIF elencati sopra: motore di calcolo in produzione.

**Terreno, servizio raster di Moon Trek**
- `LRO_LOLA_DEM_SPole875_5mp_v04`: DEM a 5 m entro circa 87,5°S, per l'orizzonte vicino e la visualizzazione 3D dei siti polari.
- `LRO_LOLA_DEM_SPole75_30mp_v04`: DEM a 30 m fino a 75°S, per l'orizzonte lontano.
- `LRO_LOLA_DEM_Global_128ppd_v04`: siti non polari (Apollo, Chang'e 4, Chandrayaan-3…).
- `SiteNN_final_adj_5mpp_surf` (Connecting Ridge, Shackleton Rim, Nobile Rim, Malapert, de Gerlache…), `Haworth_…`, `Shoemaker_…`, `DM2_…`: DEM a 5 m già ritagliati sulle regioni candidate di Artemis. Sono comodi per una lista curata di siti polari.

**Validazione (Moon Trek)**
- `AVGVISIB_*_EARTH_SP`: visibilità media della Terra.
- `WAC_POLE_ILL_PCT_SOUTH_100M`: illuminazione percentuale.
- `PSR_SP`: regioni in ombra permanente.

**Visualizzazione (Moon Trek WMTS)**
- `LRO_WAC_Mosaic_Global_303ppd_v02`: base globale.
- `LRO_WAC_Mosaic_SPole60_100m_v02`: base del polo sud.
- `LRO_LOLA_Shade_SPole875_5mp_v04`: ombreggiatura del rilievo, molto leggibile.
- I layer di pendenza (`Slope_LRO_LOLA_DEM_SPole875_5mp_v04`, `ColorSlope_*below*`) servono come informazione extra di sicurezza dell'atterraggio, se resta tempo.

**QuickMap**
- Visibility Analysis e Create Panorama, solo per la verifica manuale.

**Dati da raccogliere a parte (lista curata)**
- Coordinate ufficiali dei siti: Apollo 11–17, missioni CLPS (ad esempio IM-1 vicino a Malapert A), le 9 regioni candidate di Artemis III, Chang'e 4, Chandrayaan-3. ⚠️ Vanno prese da fonti ufficiali NASA, ISRO e CNSA, non a memoria.

### Superfluo, da ignorare

**Horizons**
- Elementi orbitali, close approach, file SPK, asteroidi e comete.
- Accesso via telnet o email.
- La maggior parte delle quantità: RA/Dec, magnitudine, airmass, fasi…

**Moon Trek**
- Mosaici di altre missioni o strumenti: Clementine, Lunar Orbiter, Mini-SAR, Mini-RF, Chang'e-2 (il DEM CE-2 a 20 m pesa 35 GB e il LOLA ci basta).
- Prodotti Count, Coverage, NoDataMask, Error. Sono metadati sulla qualità dei dati; casomai i layer Error tornano utili per mostrare l'incertezza, ma non subito.
- Varianti colorate o grayscale dei DEM: sono solo immagini, e l'ombreggiatura si può calcolare da soli.
- Il mosaico NAC del polo sud a 1 m (`LRO_NAC_AvgMosaic_SPole855_1mp`, 34 GB). Se serve dettaglio visivo si usa il suo WMTS, mai il download.
- I percorsi di concetto "Endurance-A", tutto ciò che riguarda il polo nord, gli altri corpi celesti.

**QuickMap**
- Quasi tutti i layer scientifici (spettrali, footprint delle immagini…) e il download di immagini a scopo di calcolo.

**Portale CSA "Moon Exploration"**
- Solo contenuti divulgativi. Al massimo per testi educativi.

---

## 7. Come può servirci il modello 3D della Luna in CAD

Il modello CAD è utile, ma soprattutto per **mostrare** e meno per **calcolare**. Il motivo è la scala:

- la Luna ha un raggio di 1737 km;
- l'orizzonte di un sito polare dipende da dettagli di 5–50 m;
- un unico modello globale con quel dettaglio sarebbe di miliardi di triangoli;
- un modello CAD fatto a mano o semplificato non ha la precisione dei dati LOLA.

I calcoli vanno quindi fatti sempre sul DEM. Il CAD dà valore in questi modi:

1. **Scena 3D dell'app.** Un modello globale leggero, esportato in **glTF/GLB**, si carica in CesiumJS come contesto di sfondo. Sopra si mostrano i siti, le direzioni del Sole e della Terra e i coni di luce. Per il dettaglio del terreno vicino ai siti è meglio generare la mesh **direttamente dal DEM**, a più livelli di dettaglio (LOD).
2. **Mesh locali dei siti generate dal DEM.** Se il flusso CAD sa importare un GeoTIFF e convertirlo in superficie (heightmap → mesh), il team può produrre modelli 3D accurati dei 10–20 siti della lista curata. Si usano per:
   - le viste "dal punto del lander": un panorama a 360° con il profilo dell'orizzonte e la traiettoria del Sole sovrapposti. È la visualizzazione più chiara per il pubblico e risponde direttamente alla richiesta della challenge;
   - il controllo incrociato della maschera d'orizzonte: un raycast sulla mesh deve dare lo stesso profilo del calcolo NumPy.
3. **Rendering delle ombre.** Con una luce direzionale orientata come il vettore del Sole (calcolato da noi), il motore 3D mostra ombre realistiche sul terreno, ad esempio in un'animazione su un giorno lunare. È un'ottima verifica visiva e un ottimo materiale da demo.
4. **Hardware del lander.** Si può modellare il lander con pannelli e antenna all'altezza giusta. L'altezza dell'osservatore usata nel passo 2 viene da lì, e nella scena si vede se un pannello verticale è illuminato.
5. **Divulgazione.** Stampa 3D o render di una regione polare con esagerazione verticale, per spiegare perché pochi chilometri o pochi giorni cambiano tutto (obiettivo "accessibilità" della challenge).

Perché il CAD combaci con i dati, servono quattro accorgimenti:

- **Stesso riferimento:** sfera di 1 737 400 m e frame **Mean Earth (ME)**, come Horizons e LOLA. Origine nel centro della Luna, asse Z sul polo nord, asse X verso longitudine 0 (direzione media della Terra).
- **Unità in metri**, senza scalature arbitrarie, oppure con un fattore di scala documentato.
- **Formati:** esportare in glTF/GLB per il web. In Cesium si usa l'ellissoide lunare (`Cesium.Ellipsoid.MOON`) invece di quello terrestre ⚠️ da verificare nella versione di CesiumJS installata.
- **Livelli di dettaglio:** un modello globale leggero più modelli locali dettagliati, invece di un unico modello enorme.

---

## 8. Ordine di lavoro suggerito

1. **Effemeridi:** modulo con SpiceyPy più una verifica contro Horizons, per un sito di prova (ad esempio Shackleton Rim).
2. **Terreno:** download di DEM multi-risoluzione e cache da Moon Trek per lo stesso sito.
3. **Orizzonte:** calcolo della maschera e confronto con il Panorama di QuickMap.
4. **Confronto e metriche** su un mese.
5. **Pre-calcolo su griglia:** maschere d'orizzonte per tutta la regione del polo sud (script batch), più pendenze e ombre permanenti.
6. **Endpoint FastAPI "data e ora → mappa di punteggio + classifica"**, con pesi e durata della missione come parametri.
7. **Frontend:** CesiumJS con le basi WMTS di Moon Trek e la mappa di punteggio sovrapposta, selettore di data e ora con animazione, classifica cliccabile. Ogni punto apre il dettaglio con orizzonte, traiettorie di Sole e Terra e tempo al tramonto.
8. **Lista curata** di siti e confronto side-by-side tra siti e date.
9. **Integrazione del modello CAD** per le viste 3D e la demo.
