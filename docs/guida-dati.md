# Guida ai dati per Lunar Landing Site Navigator

**Perimetro V1 approvato il 15/11/2026:** confronto puntuale di 2–3 punti nelle due regioni di sviluppo, con date esplicite, finestra finita, Horizons topocentrico, terreno/dischi/eclissi, slope e validazione. Griglia e aree regionali, P50 annuale, robustezza aggregata e siti globali sono V2. Le sezioni che li descrivono restano specifiche future. Libreria/CLI/JSON prima; HTTP e frontend dopo. Prevalgono [criteri-algoritmo.md](criteri-algoritmo.md) e [piano-logica.md](piano-logica.md).

**Revisione fonti del 15/11/2026:** fonti scientifiche NASA o istituzionali USA, con responsabilità del prodotto dichiarata. Registro delle sostituzioni, lacune e perimetro minimo approvato in [fonti-e-perimetro-challenge.md](fonti-e-perimetro-challenge.md). La riduzione è approvata; le definizioni V2 restano documentate per gli sviluppi successivi.

**Aggiornata il 15/11/2026 alle decisioni approvate.** Questa guida descrive l'acquisizione e la verifica dei dati per misurare luce, visibilità geometrica della Terra e pendenza. Il riferimento delle definizioni è [criteri-algoritmo.md](criteri-algoritmo.md). L'aggiornamento riguarda solo la documentazione: l'engine e il frontend non vengono implementati in questa fase.

Le risposte API annotate come verificate il 14/11/2026 documentano prove di accesso già svolte. Non attestano la validazione del futuro engine. Parametri, metadati e limiti dei servizi vanno registrati a ogni acquisizione.

## 1. Fonti e problema di calcolo

Per ogni punto della griglia e istante T occorrono:

1. **Sole e Terra:** direzioni apparenti, distanze e tempo da NASA/JPL Horizons.
2. **Terreno:** quote numeriche LOLA, copertura e qualità da NASA Moon Trek e dagli archivi NASA PDS/PGDA.
3. **Geometria locale:** maschera d'orizzonte, pendenza su base dichiarata e frazioni visibili dei dischi calcolate dal progetto.
4. **Controlli:** prodotti scientifici pubblicati e osservazioni LROC; QuickMap serve come confronto manuale aggiuntivo.

Il nome del servizio NASA è **Moon Trek**. Offre cataloghi e dati numerici, oltre alla visualizzazione. **QuickMap** viene usato nel progetto per consultazione e confronto, non come dipendenza automatica dell'engine.

Horizons non include le montagne e i crateri del sito. La sua elevazione va confrontata con l'orizzonte ricostruito dal DEM. Per il Sole occorre inoltre l'occultazione da parte della Terra: la sola maschera del terreno non descrive un'eclissi.

L'output confronta condizioni ambientali tra regioni e date. Non converte la luce in potenza, la visibilità terrestre in disponibilità radio o la pendenza in sicurezza d'atterraggio. Il modello termico è escluso perché temperature dell'hardware e sopravvivenza dipendono da materiali, geometria, isolamento, dissipazione, riscaldatori ed energia del mezzo; i dati ambientali Diviner non bastano a determinarle.

La maschera d'orizzonte non dipende dalla data, ma dipende da coordinate, quota dell'osservatore, DEM e metodo. Si può riutilizzare soltanto mantenendo queste condizioni e la relativa provenienza.

## 2. JPL Horizons

### 2.1 API e risposte

- **Endpoint:** `GET https://ssd.jpl.nasa.gov/api/horizons.api`.
- **Documentazione:** [API Horizons](https://ssd-api.jpl.nasa.gov/doc/horizons.html) e [manuale Horizons](https://ssd.jpl.nasa.gov/horizons/manual.html).
- Nessuna autenticazione; le acquisizioni vanno memorizzate e il servizio condiviso va interrogato senza parallelismo aggressivo.
- `format=json` restituisce il testo della tabella in `result`, ed eventualmente un errore. `CSV_FORMAT='YES'` facilita il parsing delle righe.
- La tabella è delimitata da `$$SOE` e `$$EOE`. Un HTTP 200 non prova che la richiesta sia riuscita: controllare errori, delimitatori, intestazioni, numero di righe e copertura.
- Conservare risposta integrale e intestazioni: contengono unità, frame, scala temporale, correzioni e identificazione delle effemeridi.

### 2.2 Serie globale — ottimizzazione V2, non implementare in V1

La scelta approvata è usare **Horizons API**, senza introdurre SPICE o kernel NAIF in questo progetto.

| Parametro | Configurazione prevista |
|---|---|
| `COMMAND` | `'301'` — Luna |
| `CENTER` | `'500@399'` — centro della Terra |
| `EPHEM_TYPE` | `'OBSERVER'` |
| `QUANTITIES` | `'14,15,19,20'` |
| Quantità 14 e 15 | Coordinate sub-osservatore e sub-solari |
| Quantità 19 | Distanza Sole–Luna e relativo tasso |
| Quantità 20 | Distanza osservatore–Luna, qui Terra–Luna, e relativo tasso |
| Date | UTC, con copertura dichiarata |
| Passo iniziale | 1 ora; da verificare mediante convergenza e raffinamento degli eventi |

I precedenti esempi con `14,15,20` non includono la distanza solare. La configurazione estesa va verificata nell'implementazione, preservando i nomi delle colonne e le unità del servizio; non assegnare significati solo in base all'indice CSV.

La serie globale è un percorso V2 da validare per ricostruire la geometria di ogni cella. Le quantità apparenti 14/15/19/20 sono riferite all'osservazione dal geocentro: una semplice rotazione di frame non garantisce la geometria apparente dell'osservatore lunare. Verificare epoche, tempi di luce, correzioni, distanza finita e parallasse contro richieste topocentriche. Non assumere che azimut, elevazione o direzione topocentrica terrestre siano identici nell'intera regione. Se la ricostruzione globale non soddisfa le tolleranze dichiarate, usare richieste topocentriche o vettori Horizons con trasformazioni validate, mantenendo Horizons come fonte.

L'istante T rimane esatto, anche fra due campioni. Il metodo di interpolazione deve gestire angoli circolari e variazioni del vettore senza introdurre discontinuità artificiali. Il passo orario è un punto di partenza, non una precisione garantita.

### 2.3 Richieste topocentriche — fonte diretta V1

| Parametro | Valore e significato |
|---|---|
| `COMMAND` | `'10'` Sole oppure `'399'` Terra |
| `CENTER` | `'coord@301'` |
| `COORD_TYPE` | `'GEODETIC'` |
| `SITE_COORD` | `'lon_est,lat,alt_km'`; longitudine est positiva, quota in km rispetto al riferimento dichiarato da Horizons |
| `EPHEM_TYPE` | `'OBSERVER'` |
| `QUANTITIES` | `'4,20'`: azimut/elevazione apparenti, distanza e velocità radiale |
| `START_TIME`, `STOP_TIME` | Intervallo UTC |
| `CSV_FORMAT` | `'YES'` |

Una quota `0` in `SITE_COORD` non significa automaticamente “al suolo”. Per confrontare con il modello locale, usare la quota del DEM rispetto allo stesso riferimento più i **2 m dell'osservatore**, convertendo correttamente in km.

Esempio di accesso verificato il 14/11/2026, conservato come prova del servizio:

```bash
curl "https://ssd.jpl.nasa.gov/api/horizons.api?format=json&COMMAND='10'&OBJ_DATA='NO'&MAKE_EPHEM='YES'&EPHEM_TYPE='OBSERVER'&CENTER='coord@301'&COORD_TYPE='GEODETIC'&SITE_COORD='0,-89.45,0'&START_TIME='2026-12-01'&STOP_TIME='2026-12-01%2006:00'&STEP_SIZE='2%20h'&QUANTITIES='4,20'&CSV_FORMAT='YES'"
```

Estratto della risposta registrata:

```text
 Date__(UT)__HR:MN, , ,Azi_(a-app), Elev_(a-app),             delta,     deldot,
$$SOE
 2026-Dec-01 00:00,*, , 280.049441,     1.566177,  0.98633151640990, -1.2237764,
 2026-Dec-01 02:00,*, , 279.036190,     1.556116,  0.98627261410199, -1.2238544,
$$EOE
```

L'azimut è misurato da nord verso est; l'elevazione è rispetto all'orizzontale locale del modello di riferimento. Leggere unità di `delta` e `deldot` dall'intestazione completa. I flag del servizio seguono le definizioni del manuale e non sostituiscono il calcolo delle occultazioni da terreno e Terra.

Per i controlli, registrare raggio/datum, frame, longitudine, quota, epoca e correzioni apparenti. Il modello lunare del servizio e il frame cartografico LOLA vanno confrontati esplicitamente: la presenza di DE441 nelle effemeridi e Mean Earth DE421 nel DEM non è, da sola, prova di incompatibilità o di coincidenza perfetta.

Al polo esatto il nord locale e l'azimut richiedono una convenzione dichiarata o uno stato di singolarità. **Non spostare una coordinata da −90° a −89,99° per evitare il problema:** cambierebbe il sito analizzato.

### 2.4 Cache e intervalli

Salvare richieste e risposte in cache con chiave dei parametri, versione del parser, data di acquisizione, hash, frame, unità e copertura. Una risposta parziale o errata non diventa una cache valida.

Gli intervalli possono essere scaricati a blocchi mensili per gestire dimensioni e limiti del servizio. Il blocco di download non è un limite fisico. In V1 la ricerca termina al bordo della finestra di analisi richiesta o della copertura reale, dichiarando eventi incompleti e lacune; l’estensione automatica è V2.

## 3. NASA Moon Trek e archivi dei prodotti

### 3.1 Catalogo

Gli endpoint seguenti risultavano accessibili nella prova del 14/11/2026:

| Scopo | URL |
|---|---|
| Prodotti polo sud | `https://trek.nasa.gov/moon/TrekServices/ws/index/polar/searchItems?proj=urn:ogc:def:crs:IAU2000::30120&start=0&rows=2000&facetKeys=itemType&facetValues=product` |
| Prodotti globali | `https://trek.nasa.gov/moon/TrekServices/ws/index/eq/searchItems?proj=urn:ogc:def:crs:EPSG::104903&start=0&rows=3000&facetKeys=itemType&facetValues=product` |
| Servizi del prodotto | `https://trek.nasa.gov/moon/TrekServices/ws/index/getLayerServices?uuid=<item_UUID>` |
| Descrizione del prodotto | `https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=<productLabel>` |

Il catalogo espone documenti JSON con identificatori, titolo, risoluzione nominale, proiezione e tipi di servizio. Leggere in UTF-8 e gestire la paginazione; un conteggio storico di prodotti non è una costante dell'API. Conservare la WKT del prodotto, non dedurla soltanto dal nome o dal codice della vista.

Le proiezioni del catalogo includono `EPSG::104903` per GCS_Moon_2000, `IAU2000::30120` per la stereografica sud e `IAU2000::30118` per quella nord. Per quote LOLA riferite alla sfera di 1 737 400 m, il raggio del punto è `1737400 + quota_m`; confermare riferimento e unità nei metadati di ogni prodotto.

### 3.2 Raster numerici

```text
https://trek.nasa.gov/moon/trekarcgis/rest/services/<productLabel>/ImageServer
```

- Metadati e limiti: `.../ImageServer?f=json`.
- Ritaglio numerico: `.../ImageServer/exportImage?bbox=xmin,ymin,xmax,ymax&size=W,H&format=tiff&pixelType=F32&f=image`.
- Valore puntuale: `.../ImageServer/identify?geometry={"x":0,"y":0}&geometryType=esriGeometryPoint&returnGeometry=false&f=json`.

Dichiarare il riferimento di bbox e raster esportato. Leggere estensione, NoData, tipo, limiti dimensionali e metodo di ricampionamento dal servizio effettivamente selezionato. `size` controlla la griglia restituita, **non la risoluzione informativa originale**: esportare un DEM a 237 m su pixel da 5 m non aggiunge rilievi misurati e non lo rende adatto alla slope su 100 m.

Quando più affidabile o necessario, acquisire direttamente i prodotti dagli archivi [NASA PDS LOLA](https://pds-geosciences.wustl.edu/missions/lro/lola.htm) e [NASA PGDA](https://pgda.gsfc.nasa.gov/). Registrare sempre l'archivio originale e il prodotto; Moon Trek è un canale di accesso, non una garanzia che ogni layer visualizzato abbia la stessa origine.

### 3.3 WMTS

```text
https://trek.nasa.gov/tiles/Moon/{EQ|SP|NP}/<productLabel>/1.0.0/WMTSCapabilities.xml
```

Le tile PNG/JPG sono immagini. Servono per consultazione e, in seguito, visualizzazione; i loro colori non sono quote e non alimentano il calcolo. Parametri ed estensione si leggono dalle capabilities. Distinguere assenza di copertura da errori del servizio. L'integrazione del frontend è rimandata.

### 3.4 Qualità e provenienza obbligatorie

Per ogni raster conservare prodotto, versione, URL, acquisizione, SHA-256, unità, datum/raggio, frame, WKT, risoluzione nominale ed effettiva, NoData, maschere, conteggi e errori disponibili.

**Count, Coverage, NoDataMask ed Error non sono accessori da ignorare:** servono a decidere quali metriche sono valutabili e quanto sono stabili. Un pixel interpolato può avere una quota utilizzabile, ma non va presentato come una misura indipendente. Le caratteristiche di uno specifico DEM non vanno estese a tutti i prodotti LOLA.

## 4. LROC QuickMap

[QuickMap](https://quickmap.lroc.im-ldi.com/) offre strumenti utili come Visibility Analysis e Create Panorama. Il suo ruolo nel progetto è il **confronto manuale** di orizzonti, ombre e geometria.

Annotare coordinate, altezza, DEM/layer, istante e impostazioni del confronto. La somiglianza di due panorami è un controllo utile; non dimostra da sola la correttezza delle effemeridi, degli eventi, delle eclissi o dell'incertezza. Modelli che condividono lo stesso DEM possono condividere lo stesso errore. I dati numerici vanno acquisiti da Moon Trek o dagli archivi originali, senza dipendere dalla visualizzazione QuickMap.

## 5. Pipeline numerica prevista

### 5.1 Terreno e pendenza

Partire da due regioni del catalogo storico NASA 2022 e dall'ambito stabilito in [siti-e-regioni.md](siti-e-regioni.md). Conservare i poligoni originali, senza inventare contorni per regioni più recenti.

In V1 analizzare soltanto i 2–3 punti espliciti scelti nelle due regioni; stimare la pendenza con un piano su supporto **circolare di diametro 100 m**, centrato nel punto. Questo supporto non è un'ellisse d'atterraggio. La griglia di aggregazione **100 × 100 m** e la copertura sistematica delle regioni sono rinviate alla V2.

Classi descrittive approvate: **[0°,5°), [5°,10°), [10°,15°), ≥15°**. Sono convenzioni del team. Non applicare un filtro automatico a 10° e non tradurre le classi in capacità o sicurezza di un veicolo.

Per l'orizzonte serve terreno anche lontano. La configurazione multirisoluzione seguente è un punto di partenza da verificare, subordinato alla copertura reale dei prodotti:

| Uso | Prodotti candidati | Verifica necessaria |
|---|---|---|
| Terreno locale | `LRO_LOLA_DEM_SPole875_5mp_v04` e DEM PGDA dei singoli siti | Supporto del fit, qualità, interpolazione e bordi |
| Terreno intermedio | DEM polari a risoluzione compatibile con la distanza | Nessuna lacuna o salto spurio tra prodotti |
| Terreno lontano | `LRO_LOLA_DEM_SPole75_30mp_v04`, eventualmente aggregato | Convergenza rispetto a risoluzione e raggio esterno |
| Siti fuori copertura polare | `LRO_LOLA_DEM_Global_128ppd_v04` e prodotti locali documentati | Il globale a circa 237 m non risolve la slope su 100 m |

Il raggio esterno, le risoluzioni e l'eventuale ricampionamento si fissano mediante convergenza; nessun anello nominale garantisce da solo un orizzonte completo. Non inventare dettaglio interpolando DEM insufficienti. La metrica incompatibile con i dati è **non valutabile alla scala richiesta**.

Trasformare le coordinate con WKT e riferimenti lunari verificati, ad esempio tramite librerie geospaziali, evitando ellissoidi terrestri impliciti. Cache e maschere devono essere invalidate se cambiano i dati o la configurazione.

### 5.2 Maschera e visibilità

Calcolare l'orizzonte in geometria lunare tridimensionale, includendo curvatura e osservatore a **2 m sopra il suolo**. I 2 m sono un riferimento comune del team, non un modello di hardware. Una maschera iniziale di 360 direzioni richiede confronti a 0,5° e 0,25°, o affinamenti equivalenti, soprattutto su creste e dischi parzialmente occultati.

Per ogni corpo conservare elevazione del centro rispetto all'orizzontale, altezza del terreno nella stessa direzione e margine `e−H`. Integrare la visibilità sull'intero disco rispetto al profilo, non solo rispetto alla direzione del centro:

- `fSunTerrain`: frazione del disco solare non coperta dal terreno;
- `fSun`: frazione solare non coperta né dal terreno né dalla Terra;
- `fEarth`: frazione geometrica del disco terrestre non coperta dal terreno.

L'occultazione del Sole richiede l'**unione** delle zone coperte da terreno e Terra; moltiplicare due frazioni scalari non descrive in generale la loro sovrapposizione. Conservare le cause di interruzione. Il modello iniziale tratta la Terra come disco opaco e dichiara gli effetti atmosferici non modellati.

La convenzione C3 è **frazione ≥0,5** per entrambi i corpi, scelta del team. Non aggiungere margini radio universali di 2–5°. Il buio completo è `fSun=0`; `0<fSun<0,5` è luce ridotta e l'intero intervallo `fSun<0,5` è sotto C3. Queste definizioni restano distinte.

### 5.3 Tempo, eventi e anno

Cercare attraversamenti della soglia con raffinamento e verificare eventi brevi anche quando gli estremi del passo orario hanno lo stesso stato. Non interpolare booleani e non dichiarare precisione al minuto soltanto perché il risolutore restituisce un minuto.

In V1 fermare la ricerca al limite della finestra richiesta o della copertura reale; estensione automatica oltre la finestra solo in V2. Restituire evento completo, troncato all'inizio/alla fine o dati mancanti. Se non si osserva la fine, indicare il limite inferiore della durata verificata e il termine dei dati, non zero o infinito. Se il corpo è già sotto C3 a T, il tempo residuo della finestra attiva è 0 e si cerca la successiva; uno stato sconosciuto resta sconosciuto.

**Solo V2:** per l'illuminazione annua usare **P50**, percentuale di durata con `fSun≥0,5` dal 1° gennaio UTC al 1° gennaio successivo, **365 o 366 giorni**, includendo eclissi. L'evidenziazione ≥80% è del team. Non estrapolare un anno incompleto: riportare separatamente periodo coperto e statistica disponibile.

`Pany` (qualsiasi porzione visibile) e media temporale della frazione sono metriche diverse. Il benchmark 92,27% di Gläser riguarda un punto, un periodo pluriennale e una definizione specifici, non un massimo universale o un valore direttamente confrontabile con P50 annuale.

La nota VIPER sulle **50 ore** riguarda ibernazione di uno specifico rover e non attiva allarmi universali, filtri o ordinamenti. Nessuna durata di buio viene trasformata in autonomia o temperatura.

### 5.4 Aggregazione regionale — V2

Definire **B(T)** come celle con `fSun≥0,5` e `fEarth≥0,5`, con geometria valida. La pendenza non entra in B.

Per ogni regione calcolare area B e aree cumulative **A5, A10, A15** delle celle di B con slope rispettivamente <5°, <10°, <15°. Riportare km², percentuale dell'intera regione e copertura; le tre aree sono cumulative e non vanno sommate. Usare area sulla superficie lunare di riferimento, ritaglio del poligono e correzione della distorsione cartografica, senza moltiplicare per `1/cos(pendenza)`.

Calcolare anche la maggiore componente connessa di B e dei tre sottoinsiemi con **4 vicini**, cioè lato condiviso. Un contatto al solo angolo o una cella sconosciuta non collega le componenti. Lo stato attribuito alla cella dal suo centro è un'approssimazione da verificare mediante sottocampionamento.

Gestire validità **per metrica**: si può conoscere la visibilità senza poter misurare la slope. Con copertura incompleta la somma delle aree favorevoli note è un limite inferiore rispetto alle celle sconosciute, non il totale provato della regione. Una misura mancante usa uno stato `unknown`, mai un falso zero; segnalare anche copertura parziale e aree non valutate.

Il confronto usa metriche separate e ordinamenti espliciti, senza punteggio globale, pesi o cascata obbligatoria. Se si mostrano valori combinati di un punto rappresentativo, devono provenire dalla **stessa cella**, con ID, coordinate e criterio di selezione. Massimi di celle diverse restano statistiche distinte.

### 5.5 Scansione e persistenza fra date — V2

Valutare T e T ±1, ±2, ±3 giorni alla stessa ora UTC, distinguendo:

- **alternative regionali:** B, A5/A10/A15 e componenti a ogni data, anche se cambiano i punti;
- **persistenza della stessa zona:** intersezioni di celle alle date considerate, anche sotto ciascuna soglia di pendenza.

Calcolare separatamente anticipi e ritardi, includendo T. Mostrare tutte le date: un esito sfavorevole a +1 non elimina +2 o +3. Un buco di dati non prova assenza. Gli istanti giornalieri non garantiscono continuità nelle ore intermedie, che richiede la ricerca degli eventi.

## 6. Prodotti e validazione

### 6.1 Dati da acquisire

| Dato | Ruolo |
|---|---|
| Horizons topocentrico Sole/Terra | Effemeridi di produzione V1; tabella globale rinviata |
| Horizons topocentrico a tempi intermedi | Controllo parser e interpolazione V1, non validazione indipendente dello stesso servizio |
| LOLA numerico da Moon Trek / PDS / PGDA | Terreno e orizzonti, con metadati di qualità |
| PGDA [prodotto 90](https://pgda.gsfc.nasa.gov/products/90) | DEM e slope di confronto `LDRM_80S_50MPP_ADJ_SLP_100M.TIF`, con supporto circolare su base 100 m |
| PGDA [prodotto 78](https://pgda.gsfc.nasa.gov/products/78) | DEM locali a 5 m, errori e cloni disponibili per studiare l'incertezza |
| PGDA [prodotto 69](https://pgda.gsfc.nasa.gov/products/69), `AVGVISIB_*` | Confronto di visibilità, allineando periodo, altezza e definizione |
| LROC [WAC time-weighted](https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH) e immagini datate | Confronto con osservazioni e relativi limiti di campionamento |
| `PSR_SP` | Informazione separata sulle ombre permanenti e confronto di definizioni |

Le PSR non sono un filtro: un prodotto al suolo e un osservatore a 2 m non descrivono necessariamente la stessa visibilità. Non inferire ombra permanente da un solo mese senza luce.

I cataloghi locali delle **13 regioni storiche NASA 2022** e dei **16 siti** restano invariati in questo aggiornamento. Le coordinate di un lander non localizzato con precisione, come Luna 9, o il centro di una formazione bersaglio non garantiscono una localizzazione a 100 m: riportare qualità e carattere illustrativo, senza trasferire automaticamente il risultato al veicolo reale.

### 6.2 Evidenza richiesta

In V1 applicare i controlli ai punti e agli intervalli richiesti, includendo il confronto con un’osservazione LROC datata previsto dal piano. I controlli su P50 annuale, aree e aggregazioni regionali appartengono alla V2; non sono condizioni di completamento della V1.

1. **Geometria:** casi analitici di sfera e ostacoli, coordinate coerenti, controllo di poli e bordi.
2. **Effemeridi:** in V1 verificare parser, unità, quota, epoca e correzioni; confrontare interpolazioni con query dirette a tempi intermedi. Confronto globale/topocentrico solo in V2. Tolleranze fissate prima dell’esito.
3. **Slope:** piani di inclinazione nota e prodotto PGDA con supporto, scala e georeferenziazione compatibili; nessuna soglia d'errore inventata.
4. **Dischi ed eclissi:** occultazione nulla, parziale, totale e sovrapposta, con cause e frazioni conservate.
5. **Convergenza:** passi angolari, temporali, risoluzioni e raggi del DEM; misurare l'effetto su eventi, P50 e aree.
6. **Benchmark:** riprodurre coordinate, DEM, altezza, periodo e definizione del prodotto. La semplice somiglianza di ordini di grandezza non basta a dichiarare validato il motore.
7. **Incertezza:** usare qualità e cloni disponibili; verificare classi instabili vicino a 5°, 10°, 15° e sensibilità delle aree, senza assumere errori spaziali indipendenti.
8. **Riproducibilità:** conservare manifesti, dati, versione dell'algoritmo, risultati e rapporto degli scarti.

Il quadro metodologico può riferirsi a [NASA-STD-7009B](https://standards.nasa.gov/standard/NASA/NASA-STD-7009), senza dichiarare conformità o approvazione NASA del progetto. Fonte NASA e risultato validato sono due proprietà da dimostrare separatamente.

## 7. Modelli 3D e perimetro successivo

Un CAD o una mesh possono aiutare a controllare visivamente il terreno e le ombre. Per un confronto numerico devono derivare dagli stessi dati documentati, con unità, frame, scala e semplificazioni esplicite; una mesh semplificata non sostituisce il DEM scientifico.

La progettazione di schermate, API per il frontend, mappe e grafici è rimandata a dopo la costruzione dell'algoritmo. Non sono previsti in questa fase modelli di hardware, pannelli o antenne.

## 8. Ordine di lavoro della specifica estesa — V2; per V1 seguire il piano aggiornato

1. Verificare prodotti, coperture, qualità e manifesti sulle due regioni iniziali.
2. Acquisire la serie Horizons estesa e validare le trasformazioni topocentriche.
3. Calcolare slope e orizzonti con gestione dei dati mancanti e studi di convergenza.
4. Implementare frazioni dei dischi, eclissi, eventi e anno UTC completo.
5. Aggregare B, A5/A10/A15, componenti e date vicine, con qualità per metrica.
6. Eseguire i confronti scientifici e produrre il rapporto di validazione.
7. Definire solo in seguito l'integrazione con il frontend.

Questi sono passi futuri: il presente aggiornamento non implementa l'engine e non modifica i cataloghi.
