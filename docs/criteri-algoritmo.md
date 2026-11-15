# Criteri dell'algoritmo di valutazione

**Revisione fonti del 15/11/2026:** fonti scientifiche NASA o istituzionali USA, con responsabilità del prodotto dichiarata. Registro delle sostituzioni, lacune e perimetro minimo approvato in [fonti-e-perimetro-challenge.md](fonti-e-perimetro-challenge.md). Il perimetro minimo è ora approvato: le definizioni scientifiche restano valide, con consegna V1 e sviluppi V2 distinti qui sotto.

**Specifiche e perimetro minimo V1 approvati dal team il 15/11/2026.** Questo documento è il riferimento per i criteri dell'engine e prevale sulle precedenti proposte nei documenti collegati. Descrive il lavoro da implementare: non attesta che il motore sia già costruito o validato. In questo aggiornamento si modifica solo la documentazione; l'integrazione con il frontend viene dopo l'algoritmo.

Il programma risponde alla domanda:

> **A un istante T, quali condizioni di luce, visibilità geometrica della Terra e pendenza offrono 2–3 punti nelle regioni di sviluppo, e come cambiano scegliendo date diverse?**

Il confronto è generale e indipendente dal mezzo. Non certifica sicurezza d'atterraggio, percorribilità, autonomia o qualità radio. Le fonti scientifiche sono indicate come [F…]; le convenzioni applicative sono indicate come **Scelta del team**. Il piano di lavoro è in `docs/piano-logica.md`, il riepilogo in `docs/stato-decisioni.md`, i cataloghi in `docs/siti-e-regioni.md` e l'accesso ai dati in `docs/guida-dati.md`.

---

## 0. Perimetro di consegna approvato

**V1 = confronto puntuale**, prima dell'aggregazione regionale. I punti sono identificati all'interno di de Gerlache Rim 2 e Malapert Massif. La dimostrazione comprende almeno un punto per regione, complessivamente 2–3 punti, e almeno due date. Non si chiamano “rappresentativi” di tutta la regione né “migliori siti”. La posizione va scelta in modo riproducibile e verificata nel poligono e nel DEM; i centri geometrici sono possibili punti iniziali, non siti favorevoli per definizione.

| Prima versione V1 | Rinviato a V2 | Escluso dall'engine generale |
|---|---|---|
| Orizzonte reale, effemeridi locali Sole/Terra, angoli e frazioni dei dischi | Scansione delle 13 regioni e analisi dei 16 siti globali | Sicurezza di atterraggio e percorribilità universale |
| Finestre di luce, Terra e concomitanza, buio completo, eclissi e copertura | P50 annuale, indicatore ≥80% e benchmark pluriennali | Termica hardware, potenza, batterie, autonomia e link budget |
| Pendenza su supporto circolare 100 m e quattro fasce | B(T) come insieme regionale, A5/A10/A15, aree e componenti connesse | Traiettorie, lancio, discesa e replay di missioni |
| Confronto diretto degli stessi punti a date esplicitamente richieste | Scansione automatica ±1/2/3 giorni e intersezioni della stessa zona | Ranking globale, pesi universali, accessibilità PSR e quantità di ghiaccio |
| Provenienza, incertezza, controlli numerici e riscontro osservativo | Agente AI, CAD, news, cataloghi educativi estesi | Soglie di sopravvivenza ricavate dalla sola luce |

**Consegna tecnica V1:** libreria Python, configurazioni di esempio, CLI, risultati JSON versionati, cache e rapporto di validazione. L'integrazione HTTP e il frontend avvengono dopo la verifica del nucleo. Nessun endpoint regionale o adapter dei vecchi mock è necessario per completare questo incarico. La visualizzazione di orizzonte, astri e finestre resta necessaria alla consegna finale della challenge, non a questa fase di implementazione.

**Input V1:** lista di punti con ID, coordinate e regione; uno o più istanti T esatti in UTC; durata positiva della finestra di analisi, uguale per gli scenari confrontati. La fixture dimostrativa usa 30 giorni, scelta applicativa e non durata della missione. Si confrontano intervalli [T, T + durata), mantenendo sia UTC assoluto sia tempo trascorso da T. Le date alternative sono esplicite, senza generare automaticamente sette scenari. Non si arrotonda T all'ora.

**Osservatore V1:** 2 m sopra il DEM, dichiarati e fissi nel profilo. Le eventuali altezze diverse del client esistente non diventano richieste supportate implicitamente. La griglia regionale 100 × 100 m è rinviata; il supporto circolare di misura della pendenza di diametro 100 m rimane in V1.

**Intervallo limitato:** V1 cerca eventi soltanto nella finestra richiesta e nella copertura reale. Non scarica automaticamente mesi aggiuntivi fino a trovare un evento. La mancata osservazione di un confine produce un intervallo troncato e un limite inferiore, non una durata totale inventata. Se il punto è già al buio a T, l'inizio precedente resta sconosciuto salvo dati aggiuntivi già disponibili; non è necessario cercarlo all'indietro.

**Output rinviati:** P50, percentuali e aree regionali, componenti e robustezza aggregata non sono calcolati o riempiti con zero. Il manifest dichiara le capacità V1; il JSON V1 non promette campi V2. Un valore sconosciuto di una metrica V1 è invece `null` con stato e motivo.

## 1. Principi e fonti

| Principio | Decisione e motivazione |
|---|---|
| Nessun profilo di veicolo | Misurare condizioni geometriche e topografiche. I limiti di singoli mezzi sono riferimenti contestualizzati, non soglie universali |
| Nessun filtro automatico di pendenza | Nessun punto viene escluso perché supera 10°. Le fasce descrivono il terreno; aree regionali sotto diverse soglie solo in V2 |
| Nessun vincitore assoluto | Restituire metriche confrontabili e ordinamenti espliciti per una metrica, senza punteggio globale né cascata obbligatoria fra criteri |
| Data e ora esatte | Input T in UTC; non arrotondare l'istante scelto all'ora. Posizioni e visibilità cambiano con coordinate e tempo |
| Finestra di analisi V1 | Nessuna durata di missione richiesta. Cercare gli eventi nella finestra esplicita, dichiarando i confini non osservati; ricerca estesa automatica rinviata |
| Altezza di riferimento | Osservatore a 2 m dal terreno, **Scelta del team** geometrica comune ai confronti, non altezza universale di pannelli o antenne |
| Campionamento iniziale | 1 ora per le effemeridi e 360 direzioni per l'orizzonte sono configurazioni iniziali, da sottoporre a convergenza e raffinamento; non garantiscono precisione degli eventi |
| Riproducibilità | Cache locale dei dati reali, metadati e versioni. Mancanza di dati e risultati sintetici non devono diventare misure scientifiche |

### 1.1 Ruolo dei servizi

- **NASA/JPL Horizons [F5, F32]**: unica fonte scelta per le effemeridi di Sole e Terra. **V1 usa query topocentriche dirette** con `COMMAND='10'` e `'399'`, `CENTER='coord@301'`, coordinate del punto e quota del DEM più 2 m, riferita al datum del servizio. Registrare configurazione, tempi, correzioni apparenti senza rifrazione atmosferica lunare, distanze e dimensioni angolari. Verificare nel manuale i parametri e le intestazioni prima di implementare il parser. La ricostruzione da quantità geocentriche `14,15,19,20` è un'ottimizzazione V2: richiederebbe riconciliazione di epoche e tempi luce, non una semplice rotazione del frame. Nessuna dipendenza SPICE/SpiceyPy in V1.
- **NASA Moon Trek [F3]**: poligoni delle regioni, cataloghi, layer e prodotti numerici disponibili tramite API/ImageServer. Il nome del servizio è Moon Trek.
- **NASA PDS / NASA PGDA, dati LRO-LOLA [F19]**: DEM numerici, conteggi, risoluzione effettiva, errori, pendenze e prodotti di riferimento, acquisibili direttamente dagli archivi. Le immagini di sfondo non sostituiscono le quote.
- **LROC [F30]**: osservazioni per il confronto delle ombre e dell'illuminazione. Identificare strumento, prodotto e istante delle immagini.
- **QuickMap (LROC)**: consultazione e confronto manuale di panorami e visibilità; non è una dipendenza di acquisizione dell'engine. I dataset visualizzati si acquisiscono dai loro archivi originali.

Per ogni sorgente conservare URL, prodotto, versione, data di acquisizione, SHA-256, unità, frame, proiezione, raggio/datum, NoData, risoluzione nominale ed effettiva e informazioni di qualità. Per Horizons conservare richiesta e risposta originali, copertura, scala temporale e correzioni apparenti. DE441 nelle effemeridi e Mean Earth DE421 nei DEM non implicano da soli incompatibilità: il manuale Horizons documenta il frame cartografico lunare [F32]. Coerenza di frame, epoca, quota e longitudine va comunque verificata.

### 1.2 Catalogo e scala dell'analisi

Il catalogo conserva 13 regioni del **catalogo storico NASA 2022** disponibili in Moon Trek e 16 siti locali. V1 analizza soltanto i 2–3 punti di sviluppo; la scansione delle regioni e l’analisi dei 16 siti sono V2. La lista non va presentata come catalogo operativo attuale completo. I siti possono essere esterni al settore polare e vengono confrontati separatamente dalle regioni.

**In V2**, la griglia di aggregazione ha celle di **100 × 100 m**. La pendenza è stimata con un piano su una **finestra circolare di diametro 100 m**, centrata nel punto di campionamento della cella, coerentemente con il supporto del prodotto di confronto PGDA [F19]. Griglia, supporto della misura e dispersione d'atterraggio sono grandezze distinte. Le celle sono unità di campionamento, non piazzole certificate.

Per coordinate storiche incerte o centri di formazioni bersaglio, il risultato descrive la coordinata analizzata: non attribuirlo automaticamente al vero lander. Precisione della posizione e risoluzione del DEM devono essere compatibili con la metrica richiesta; in caso contrario quella metrica è **non valutabile alla scala richiesta**. Ricampionare un DEM grossolano non crea dettaglio nuovo.

---

## 2. Geometria di Sole e Terra

Per ogni punto di campionamento:

1. calcolare dal DEM la maschera d'orizzonte H(azimut), includendo curvatura lunare, terreno vicino/lontano e osservatore a 2 m;
2. ricavare azimut ed elevazione apparente di Sole e Terra da Horizons, con distanza finita e parallasse, nel frame coerente con il terreno;
3. confrontare il profilo del terreno con l'intera estensione angolare del disco, non soltanto con il centro;
4. per il Sole includere anche l'occultazione da parte della Terra (eclissi) [F29];
5. conservare frazioni visibili, angoli, margini, copertura e incertezza.

### 2.1 Elevazione e margine sul terreno sono due valori

- **Elevazione e**: angolo del centro del corpo rispetto al piano orizzontale locale dell'osservatore.
- **Orizzonte H**: elevazione del terreno nella direzione del centro del corpo.
- **Margine m = e − H**: separazione angolare fra il centro e il profilo in quella direzione.

Per esempio e = 2° e H = 1,4° danno m = 0,6°. Il margine non sostituisce il calcolo della frazione del disco su un profilo irregolare e non include l'effetto di un'eclissi.

### 2.2 Frazioni e convenzione di visibilità (C3)

- `fSunTerrain`: frazione del disco solare non occultata dal terreno.
- `fSun`: frazione del disco solare non occultata **né dal terreno né dalla Terra**.
- `fEarth`: frazione geometrica del disco terrestre non occultata dal terreno, indipendentemente dalla sua fase illuminata.

Tutte le frazioni sono in [0, 1]. Per il Sole bisogna considerare l'unione delle occultazioni: moltiplicare due frazioni scalari non descrive in generale la loro sovrapposizione. Distinguere le cause terreno/eclissi, anche quando agiscono insieme. Il modello iniziale dell'eclissi considera un disco terrestre opaco; eventuali effetti atmosferici e luce diffusa non modellati vanno dichiarati.

**Visibile secondo C3 = frazione ≥ 0,5**, per `fSun` e `fEarth`. Il 50% è una **Scelta del team**, non una soglia NASA di ricarica o qualità radio. La frazione calcolata resta disponibile. Il centro sull'orizzonte corrisponde a metà disco soltanto nel caso ideale di un orizzonte uniforme sul disco e senza altre occultazioni.

### 2.3 Luce ridotta e buio completo

| Stato del Sole | Definizione |
|---|---|
| Visibile secondo C3 | `fSun ≥ 0,5` |
| Luce diretta ridotta | `0 < fSun < 0,5` |
| Buio completo rispetto alla luce solare diretta | `fSun = 0` |
| Sotto soglia C3 | `fSun < 0,5`: comprende luce ridotta e buio completo |

Il buio completo non implica assenza di luce riflessa o una specifica temperatura. Eventuali tolleranze numeriche per distinguere zero da frazioni molto piccole devono essere dichiarate e validate, senza sostituirle tacitamente alla definizione fisica.

---

## 3. Criteri e versione di consegna

| # | Criterio | Cosa si misura | Versione |
|---|---|---|---|
| 1 | Sole visibile a T | Stato C3, `fSunTerrain`, `fSun`, eventuale eclissi | V1 |
| 2 | Terra visibile a T | Stato C3 e `fEarth`; non disponibilità radio | V1 |
| 3 | Elevazione del Sole a T | Elevazione rispetto all'orizzontale e margine sul terreno, separati | V1 |
| 4 | Elevazione della Terra a T | Elevazione rispetto all'orizzontale e margine sul terreno, separati | V1 |
| 5 | Luce continua secondo C3 | Tempo residuo da T alla prima discesa di `fSun` sotto 0,5, con causa dell'interruzione | V1 |
| 6 | Visibilità geometrica continua della Terra | Tempo residuo da T alla prima discesa di `fEarth` sotto 0,5 | V1 |
| 7 | Buio e luce ridotta | Inizio, fine e durata del primo intervallo di buio completo; separatamente intervalli sotto C3 | V1 |
| 8 | Pendenza | Valore in gradi, base di 100 m, fascia descrittiva e qualità/incertezza | V1 |
| 9 | Illuminazione annua | Percentuale del tempo dell'anno UTC con `fSun ≥ 0,5`, copertura, calendario; evidenziazione ≥80% | V2 |
| 10 | Sensibilità alle date | V1: metriche alle date esplicite; V2: ±1/2/3 giorni, alternative regionali e persistenza della stessa zona | V1/V2 |

V1 conserva le finestre di Sole, Terra e concomitanza osservate nella finestra richiesta. La fine della finestra non rappresenta un evento fisico.

### 3.1 Eventi e copertura temporale

- Se il corpo è già sotto C3 a T, il tempo residuo della finestra attiva è **0** e si cerca la prossima finestra; una misura sconosciuta non vale 0.
- Se T cade già nel buio, riportare la notte in corso e il tempo residuo. Una durata totale richiede anche l'inizio dell'evento; se non è coperto, segnalarlo come incompleto.
- In V1 cercare gli eventi entro la finestra richiesta e la copertura disponibile. La fine della finestra o della cache non è un tramonto. L’estensione automatica è rinviata.
- Se l'evento finale non è osservato, restituire fine sconosciuta, limite temporale esaminato e limite inferiore della durata verificata. Non assegnare una durata conclusa, zero o infinito.
- Distinguere intervalli **completi**, **troncati all'inizio**, **troncati alla fine**, e **dati mancanti**. Un buco di dati interrompe la continuità verificabile.
- Conservare tolleranza numerica degli eventi ed errore fisico stimato: una radice calcolata al minuto non implica conoscenza del terreno al minuto.

---

## 4. Pendenza, buio e illuminazione annua

### 4.1 Fasce di pendenza approvate

| Fascia | Intervallo esatto | Significato |
|---|---|---|
| 1 | `0° ≤ p < 5°` | Classe descrittiva 0–5° |
| 2 | `5° ≤ p < 10°` | Classe descrittiva 5–10° |
| 3 | `10° ≤ p < 15°` | Classe descrittiva 10–15° |
| 4 | `p ≥ 15°` | Classe descrittiva ≥15° |

I confini sono **Scelta del team**, uguali per tutte le regioni e date. Mostrare sempre il valore e la scala della misura. Non usare etichette di idoneità dei mezzi o classi derivate dai percentili di ciascuna regione. I riferimenti storici di missione [F1, F2, F20–F22] non definiscono queste fasce.

**Rimosso il filtro automatico a 10°.** Pendenza ≥10° non esclude celle o regioni. Le soglie 5°, 10° e 15° servono alle statistiche cumulative del terreno, non a un passaggio automatico fra adatto e inadatto. Un eventuale filtro esplicitamente scelto in futuro deve essere tracciato come filtro dell'utente, mai applicato di nascosto.

Il piano va adattato in coordinate metriche locali coerenti con il terreno; metodo, supporto, gestione NoData e incertezza devono essere registrati. Non trasferire l'errore di una slope a scala pixel a quella su 100 m. Se l'incertezza attraversa una soglia, segnalare l'instabilità della classe. La slope media non rileva necessariamente piccoli crateri o massi.

### 4.2 Durata del buio V1 e riferimenti documentali

**Nessun avviso universale rosso a 50 ore e nessun effetto sulla classifica.** Restano le durate degli eventi definite in 2.3 e 3.1.

Le **50 ore** restano nella bibliografia e non negli output principali V1. Sono soltanto una nota di confronto con VIPER: le specifiche NASA distinguono la sopravvivenza in ibernazione a bassa potenza dalle circa 9 ore di operazioni nelle PSR [F28]. Il riferimento non riguarda automaticamente ogni intervallo sotto il 50% del Sole, non garantisce sopravvivenza entro la soglia e non rappresenta un limite per un mezzo generico.

**Modello termico escluso:** esistono dati ambientali NASA LRO Diviner sulle temperature della superficie [F27]. Per ricavare quelle dell'hardware servono geometria, materiali, isolamento, proprietà radiative, contatti con il suolo, dissipazione, riscaldatori e condizioni energetiche. L'engine generale non riceve questi parametri e non stima temperatura, autonomia o sopravvivenza. Anche potenza e ricarica richiederebbero un modello energetico specifico.

### 4.3 Illuminazione annua (C6) — V2, non calcolare in V1

La metrica principale è **P50**, la percentuale del tempo con `fSun ≥ 0,5` dal 1° gennaio 00:00 UTC al 1° gennaio successivo: 365 o 366 giorni. Si integra la durata degli intervalli, includendo eclissi e raffinamento degli eventi; non si assume che ogni campione rappresenti sempre un'ora intera.

**P50 ≥80%** identifica un'alta disponibilità di luce secondo una **Scelta del team**. Non è uno standard NASA o una garanzia di energia stabile. Si riporta sempre il valore continuo e la copertura. Con anno incompleto, non estrapolare una percentuale annuale: riportare separatamente la statistica del periodo coperto, la sua durata e il periodo mancante.

Le metriche `Pany` (tempo con `fSun >0`) e media temporale di `fSun` sono distinte da P50. I prodotti PGDA `AVGVISIB` usano la presenza di qualsiasi porzione del disco; il confronto richiede anche stesso periodo, altezza e trattamento delle occultazioni [F7]. Il **92,27%** di Gläser [F25] è un risultato pluriennale per uno specifico punto a 2 m e una diversa definizione: è un benchmark contestualizzato, non un massimo universale o un confronto diretto con P50 annuale.

### 4.4 Ombre permanenti (C1)

Le PSR sono informazione scientifica separata, non un filtro o un peso. Non classificare come ombra permanente un punto soltanto perché non vede il Sole nel periodo richiesto. L'assenza di luce al suolo in un prodotto PSR non impone automaticamente la stessa condizione a un osservatore a 2 m: confrontare altezze, terreno e definizioni [F7].

---

## 5. Dalle celle alla regione (C4) — V2, non implementare in V1

### 5.1 Insiemi geometrici e qualità

Sia `B(T)` l'insieme delle celle con **Sole e Terra entrambi visibili secondo C3 a T**, con dati geometrici validi. La pendenza non entra nella definizione. L'espressione precedente “punti papabili” è sostituita da **celle con visibilità congiunta**; non sono certificazioni di atterrabilità.

La validità è per metrica: una cella può avere visibilità nota e slope non valutabile, o viceversa. Dati mancanti non equivalgono a condizioni sfavorevoli. Si riportano copertura e aree note; con copertura parziale la somma delle aree favorevoli note è soltanto una stima parziale (limite inferiore rispetto alle celle sconosciute), non il totale dimostrato della regione.

Nessuna regione viene rimossa dal confronto perché ha pendenze elevate o non presenta concomitanza a T. Gli esiti descrivono **concomitanza presente/assente sui dati validi**, **copertura parziale** o **non valutabile**. Dichiarare assenza sull'intera regione soltanto se la copertura necessaria è completa.

Per spiegare gli esiti, riportare conteggi di Sole, Terra, intersezione e dati mancanti. Se l'intersezione è vuota, scrivere “nessuna cella soddisfa contemporaneamente le due condizioni”; non dedurne che tutte le celle nascondano uno specifico corpo.

### 5.2 Aree e fasce

Per ogni regione restituire:

- area di `B(T)`, senza filtro di pendenza;
- `A5(T)`, `A10(T)`, `A15(T)`: area delle celle di B con slope valida rispettivamente **<5°, <10°, <15°**;
- area e percentuale delle quattro classi di pendenza sul terreno valutabile, anche indipendentemente da T;
- copertura geometrica e topografica, aree sconosciute e incertezza rilevante.

A5/A10/A15 sono **cumulative**, non si sommano fra loro. I valori si riportano in km² e percentuale dell'area totale della regione, con il denominatore esplicito e la copertura a fianco; eventuali percentuali sul solo sottoinsieme valido devono essere etichettate diversamente.

Usare l'area della cella sulla sfera lunare, ritagliata al poligono della regione, correggendo la distorsione della proiezione. Non moltiplicare per `1/cos(pendenza)`: qui interessa l'estensione planimetrica sulla superficie di riferimento, non l'area tridimensionale del pendio. L'attribuzione dello stato del centro a tutta la cella è un'approssimazione di campionamento da verificare con sotto-campionamento, in particolare sulle creste strette.

Le vecchie stime di area sotto 10° non rappresentano più “area papabile”; vanno ricalcolate e accompagnate da metadati e qualità prima di usarle come risultati della nuova specifica.

### 5.3 Maggiore area continua

Calcolare la maggiore componente connessa di B e, separatamente, dei sottoinsiemi A5/A10/A15, usando **4 vicini** (lati condivisi; contatto al solo angolo insufficiente), **Scelta del team**. Le celle sconosciute non possono collegare due componenti note.

Affiancare area totale e area della maggiore componente; non imporre un'area minima universale. La connessione sulla griglia non dimostra accessibilità, sicurezza o sufficienza per l'ellisse di un veicolo.

---

## 6. Confronto per metriche: punti V1, regioni V2

**V1 confronta solo risultati puntuali alla stessa durata di analisi; non produce statistiche o ordinamenti regionali.** Le regole sulle aree sotto si applicano a V2.

**Adottato il confronto per metriche esplicite. Superata la cascata tenuta > area > luce > Terra.** Nessun punteggio composito, peso o vincitore assoluto viene prodotto come risultato scientifico.

Le metriche sono ordinabili separatamente: per esempio A5, maggiore componente di A10, finestra luminosa o persistenza della stessa zona. Ogni ordinamento riporta metrica, verso, soglia, data e copertura. In assenza di una scelta, l'ordine di catalogo non esprime preferenza. Non confrontare come equivalenti un totale completo e una stima parziale senza segnalarlo.

Si possono evidenziare risultati per obiettivo, come “maggiore area sotto 5°” o “finestra di luce più lunga”, nominando esattamente la metrica. Non inventare soglie di equivalenza: eventuali tolleranze devono derivare dalla precisione dichiarata e dagli studi di sensibilità.

**Punto rappresentativo:** se si presentano insieme luce, Terra, slope e altri valori di un punto, devono provenire dalla **stessa cella**, identificata da ID e coordinate, con criterio di selezione dichiarato. Massimi raggiunti in celle differenti restano statistiche distinte, ciascuna con il proprio punto; non costituiscono le prestazioni combinate di un sito inesistente. La scelta del bersaglio operativo resta esterna all'engine.

---

## 7. Sensibilità alle date (C7): confronto diretto V1, aggregazione V2

**V1:** ricalcolare i medesimi punti alle date esplicitamente richieste, con la stessa durata di analisi. Confrontare le serie e le finestre senza un indicatore sintetico di robustezza.

**V2:** valutare T e T ±1, ±2, ±3 giorni alla stessa ora UTC. L'estensione è una **Scelta del team**, non una finestra NASA universale. Restituire metriche per tutte le date, mantenendo espliciti eventuali buchi o date non valutabili.

Distinguere:

1. **Alternative regionali:** area B(T+j), A5/A10/A15 e componenti continue a ogni data. I punti possono cambiare tra una data e l'altra.
2. **Persistenza della stessa zona:** intersezione delle celle di B alle date considerate, e delle corrispondenti aree sotto ciascuna soglia descrittiva. Riportare aree e maggiore componente; dati mancanti non attestano assenza di persistenza.

Per ritardi e anticipi, calcolare separatamente le intersezioni `{T,T+1,…,T+k}` e `{T,T−1,…,T−k}` per k=1,2,3. Un'intersezione su tutte le sette date può essere una statistica aggiuntiva, senza diventare un punteggio globale.

Questi sono confronti fra **istanti campionati**, non garanzie di continuità nelle 24 ore intermedie. Le vere finestre continue richiedono le serie temporali e la ricerca degli eventi. Se +1 è sfavorevole e +2 favorevole, mostrare entrambi: nessuna legge fisica impone di cancellare +2. Non comprimere i due versi nel minimo per ordinare automaticamente le regioni.

La slope resta costante; la percentuale annua cambia se una data vicina attraversa il confine dell'anno UTC. Gli eventi di luce e buio vengono ricalcolati per ogni data con copertura dichiarata.

---

## 8. Precisione e validazione prima della consegna V1

| Controllo | Metodo ed evidenza richiesta |
|---|---|
| Effemeridi e frame | Confronto con Horizons topocentrico su siti, stagioni e attraversamenti; errori medi/massimi, epoca, unità, altezza e correzioni documentati |
| Slope | Piani sintetici di inclinazione nota e confronto con `LDRM_80S_50MPP_ADJ_SLP_100M.TIF` [F19], usando supporto, scala e georeferenziazione coerenti |
| Orizzonte | Sfera liscia e ostacoli noti, poi profili reali; verificare terreno lontano e gestione dei bordi/NoData |
| Disco ed eclissi | Casi di occultazione nulla/parziale/totale e sovrapposta, con confronto indipendente; causa e frazione conservate |
| Convergenza | Confrontare 1° → 0,5° → 0,25°, passi temporali più fitti, risoluzioni e raggi del terreno; misurare in V1 cambiamenti in angoli, frazioni, slope ed eventi; aree e percentuali annue in V2 |
| Eventi | Raffinare gli attraversamenti e controllare intervalli brevi anche quando gli estremi del passo orario hanno lo stesso stato; nessuna interpolazione di booleani |
| Benchmark pubblicati | In V1 confronto slope PGDA e riscontro osservativo LROC; riproduzione pluriennale Gläser/AVGVISIB rinviata a V2 [F7, F25] |
| Osservazioni LROC | Confrontare ombre alle epoche reali; per medie temporali considerare anche WAC time-weighted e relativo campionamento [F30] |
| Incertezza | Usare errori, risoluzione effettiva e cloni DEM disponibili [F19]; studiare in V1 stabilità della slope, delle classi, delle frazioni e degli eventi; aree in V2 senza trattare ogni errore come indipendente |
| Riproducibilità | Rapporto con casi, versione, scarti, tolleranze definite prima dell'esito e stato della verifica [F31] |

Le tolleranze numeriche finali e la configurazione del terreno vicino/lontano sono da fissare e verificare nell'implementazione; non sono nuove soglie di idoneità. Una concordanza fra modelli che condividono lo stesso DEM non sostituisce il confronto con osservazioni. I controlli descritti nel prototipo esterno devono essere riproducibili nel progetto prima di dichiarare validato l'engine.

---

## 9. Perimetro e limiti

- Nessuna stima di sicurezza al touchdown o percorribilità: mancano piccoli ostacoli e parametri del veicolo.
- Nessuna potenza, autonomia o temperatura dell'hardware; luce geometrica e buio sono misure ambientali.
- Nessuna garanzia radio: si misura il disco terrestre, non disponibilità delle stazioni, bilancio del collegamento o relay.
- Nessuna traiettoria di avvicinamento, finestra di lancio o valutazione della missione completa.
- PSR come informazione separata, senza esclusione o peso.
- I DEM a 5 m di specifici siti PGDA hanno circa il 90% di pixel interpolati [F19]; non estendere questa percentuale a tutti i prodotti o confonderla con l'errore della slope su 100 m.
- Griglia, altezza a 2 m, soglie descrittive, C3 e ±3 giorni sono convenzioni esplicite, con sensibilità da misurare.
- Fonte NASA del dato non implica validazione o approvazione NASA dei risultati del progetto.

---

## 10. Condizioni di completamento V1

- Libreria Python e CLI con schema JSON versionato, nessuna dipendenza dalla UI o da dati mock.
- Configurazione dimostrativa di 2–3 punti identificati nelle due regioni, almeno due date e uguale finestra di 30 giorni; risultati reali con fonti tracciate.
- Terreno riutilizzabile per punto; effemeridi topocentriche Horizons; profili, serie, frazioni, eclissi, finestre e pendenza conformi a questa specifica.
- Copertura parziale, unknown e intervalli troncati espliciti. Controlli della qualità per metrica, senza dati sintetici usati per completare una demo reale.
- Verifiche analitiche, unità/frame/parser Horizons, convergenza, confronto slope PGDA compatibile e almeno un riscontro osservativo LROC datato; rapporto con scarti e tolleranze fissate prima dei risultati.
- Confrontare il parser con dati Horizons controllati verifica l'acquisizione: non è una validazione astronomica indipendente di Horizons. Validare separatamente geometria locale, dischi e terreno.
- Accuratezza numerica e incertezza del terreno separate; nessuna promessa di continuità fra campioni senza verifica degli eventi brevi e convergenza.
- Se una verifica richiesta non è eseguibile, consegnare quanto implementato e dichiarare il gate non completato; non chiamare validata l'intera V1.
- Nessun calcolo annuale o regionale, frontend, nuovo endpoint scientifico HTTP, agente AI o modello di veicolo in questo incarico.

Piano eseguibile: `docs/piano-logica.md`. Prompt di implementazione: `docs/prompt-claude-engine-v1.md`.

---

## Fonti

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview*, Space Apps 2025, NTRS 20250009323. Requisiti della configurazione studiata nel 2025, fra cui pendenza <10° su 100 m; non limiti universali. https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge*, 2021. Tolleranza HLS di almeno 8°, non massimo universale. https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- **[F3]** NASA Moon Trek, *Artemis III Candidate Landing Regions*, catalogo 2022 (`A3_Named_regions_SP`). https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP
- **[F5]** JPL Horizons API. https://ssd-api.jpl.nasa.gov/doc/horizons.html
- **[F7]** E. Mazarico et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081. https://ntrs.nasa.gov/citations/20120010094 ; prodotti aggiornati: https://pgda.gsfc.nasa.gov/products/69 ; definizione AVGVISIB: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/avgvisib_75s_120m_201608.lbl
- **[F12]** NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*. https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **[F19]** M. K. Barker, NASA PGDA, *A New View of the Lunar South Pole from LOLA*: DEM, qualità e slope con supporto circolare su base 100 m. https://pgda.gsfc.nasa.gov/products/90 ; prodotti a 5 m, errori e cloni per specifici siti: https://pgda.gsfc.nasa.gov/products/78
- **[F20]** NASA, *VIPER Lunar Operations*. 15° come riferimento nominale, con capacità di affrontare anche 25–30° in determinate condizioni; non limite di ogni rover. https://science.nasa.gov/mission/viper/lunar-operations/
- **[F21]** NASA, *CLPS: Firefly Blue Ghost Mission One Press Kit* (2025). Contesto della missione e rilevamento di crateri, pendenze e rocce nella discesa. Non sostituisce quantitativamente i precedenti limiti di pendenza del paper LPSC 2022, qui ritirati. https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf
- **[F22]** USGS Publications Warehouse, Williams et al., *Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma* (2026), record 70278944. Stesso studio, ora citato attraverso USGS; l'abstract istituzionale documenta il compromesso fra obiettivi scientifici e vincoli di missione. Il dettaglio del supporto di slope a 4 m non viene usato come requisito dell'engine. https://www.usgs.gov/publications/lunar-vise-landing-site-selection-and-characterization-mons-gruithuisen-gamma
- **[F25]** Arizona Board of Regents / Arizona State University, scheda istituzionale di Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution digital terrain models from LOLA*. Ricerca internazionale con autori NASA e ASU, non standard NASA. L'abstract conferma lo studio di 19 anni e il 92,27% a 2 m; resta distinto da P50 annuale. https://experts.azregents.edu/en/publications/illumination-conditions-at-the-lunar-south-pole-using-high-resolu/
- **[F26]** T. George et al. (NASA), *Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions*, LPSC 2026, abstract 1901. Analisi dipendente dall'architettura studiata, non prescrizione dell'ordinamento dell'engine. https://ntrs.nasa.gov/citations/20250011660
- **[F27]** NASA PDS Geosciences Node, *LRO Diviner Data and Services*. https://pds-geosciences.wustl.edu/missions/lro/diviner.htm
- **[F28]** NASA NTRS, *2024 Planetary Science Technology Symposium*, presentazione VIPER, documento 20240013291, slide 2: 50 ore in ibernazione a bassa potenza e 9 ore di operazioni in PSR. https://ntrs.nasa.gov/api/citations/20240013291/downloads/PESTO-VIPER-intro.pdf
- **[F29]** H. J. Fincannon, NASA Glenn, *Lunar Environment and Lunar Power Needs*: ombre topografiche ed eclissi terrestri nel contesto dell'alimentazione. https://ntrs.nasa.gov/api/citations/20205002224/downloads/Lunar%20Environment%20and%20Lunar%20Power%20Needs_2.pdf
- **[F30]** LROC, *WAC Time-Weighted South Pole Illumination Map*. Osservazioni 2010–2011, copertura e pesatura temporale documentate. https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH
- **[F31]** NASA-STD-7009B, *Standard for Models and Simulations*: riferimento metodologico per verifica, validazione e incertezza, non dichiarazione di conformità del progetto. https://standards.nasa.gov/standard/NASA/NASA-STD-7009
- **[F32]** JPL, *Horizons System Manual*: frame lunare Mean Earth, quantità 14/15/19/20, tempi e geometria apparente. https://ssd.jpl.nasa.gov/horizons/manual.html
