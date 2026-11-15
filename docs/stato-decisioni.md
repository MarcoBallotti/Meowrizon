# Stato del progetto: cosa è deciso e cosa manca

Aggiornato al **15/11/2026**, dopo l'approvazione della revisione scientifica. La specifica normativa è `docs/criteri-algoritmo.md`; il piano di implementazione e validazione è `docs/piano-logica.md`. Questo aggiornamento riguarda solo la documentazione: **engine e frontend non vengono implementati in questa fase**.

La domanda del progetto è:

> **Data una data e un'ora, come si confrontano le regioni del polo sud per luce, visibilità geometrica della Terra e terreno?**

Il programma produce misure e confronti espliciti. Non certifica la sicurezza di un atterraggio né individua una regione migliore per qualsiasi veicolo.

## 1. Decisioni confermate

### 1.1 Architettura e fonti

| Decisione | Dettaglio |
|---|---|
| Ripartizione | Calcoli e gestione dei dati in Python; frontend separato, da affrontare dopo l'algoritmo |
| Backend | FastAPI, applicazione in `backend/app/main.py` |
| Archiviazione | File GeoJSON, JSON, NumPy, Parquet e GeoTIFF; nessun database |
| Effemeridi | **JPL Horizons API** per Sole e Terra. Percorso globale previsto con quantità **14, 15, 19 e 20**, da validare rispetto alle richieste topocentriche per epoche, correzioni e parallasse. Se insufficiente, richieste topocentriche o vettori Horizons validati. Header e unità conservati. SpiceyPy non è necessario alla pipeline scelta |
| Regioni e prodotti cartografici | **NASA Moon Trek** per poligoni, catalogo, ImageServer e mappe |
| Terreno numerico | Dati NASA LRO-LOLA da Moon Trek o direttamente dagli archivi **NASA PDS / PGDA**, identificati per prodotto e versione |
| QuickMap | Consultazione e confronto manuale di panorami e visibilità; non fonte di acquisizione dell'engine |
| Riproducibilità | Risposte originali, parametri, hash, versione, coordinate, unità, copertura e qualità conservati insieme ai risultati |
| Implementazione esistente | Connettori di acquisizione e cataloghi già presenti; la validazione numerica completa dell'engine deve ancora essere prodotta |

### 1.2 Regioni, celle e siti

| Decisione | Dettaglio |
|---|---|
| Catalogo regionale | **13 regioni del catalogo storico NASA 2022**, con poligoni Moon Trek. Non si presenta come elenco completo aggiornato delle missioni attuali |
| Settore | A sud di 84°S per le regioni, mantenendo interi i poligoni che intersecano il settore. È il perimetro scelto dal team sulla base degli studi storici Artemis |
| Avvio della pipeline | de Gerlache Rim 2 e Malapert Massif; altre regioni da estendere dopo la validazione |
| Griglia | Celle di **100 × 100 m** per aggregare le misure. La griglia non esprime precisione di atterraggio né uniformità del terreno dentro la cella |
| Pendenza | Piano adattato su una finestra **circolare di diametro 100 m** centrata nel punto di campionamento; supporto distinto dalla cella quadrata e coerente con il benchmark PGDA scelto |
| Siti | I 16 siti del catalogo restano separati dal confronto regionale. Una coordinata documentata non implica accuratezza di 100 m |
| Coordinate incerte | Luna 9 e i centri nominali delle formazioni bersaglio vanno qualificati come incerti o illustrativi; non validano il terreno del punto effettivo di atterraggio |

Il catalogo resta in `backend/catalog/`; questa revisione non aggiunge poligoni o coordinate. Le corrispondenze fra nomi storici e successivi, per esempio Leibnitz Beta Plateau / Mons Mouton, richiedono verifica della geometria e non autorizzano a inventare nuovi contorni.

### 1.3 Misure e soglie approvate

| Decisione | Dettaglio |
|---|---|
| Indipendenza dal mezzo | Misure ambientali e scale descrittive; nessuna categoria universale di sicurezza o percorribilità |
| Pendenza | Fasce **0 ≤ s < 5°**, **5 ≤ s < 10°**, **10 ≤ s < 15°**, **s ≥ 15°**. Confini scelti dal team per rappresentare il valore continuo, uguali per tutte le regioni |
| Filtro a 10° | **Eliminato dal comportamento automatico.** Nessuna regione viene esclusa per pendenza ≥10° |
| Visibilità C3 | Sole e Terra contano come visibili quando la frazione di disco è **≥0,5**; convenzione geometrica del team. La frazione viene conservata |
| Sole ed eclissi | La frazione solare disponibile considera terreno e occultazione da parte della Terra; cause distinte. Non si moltiplicano occultazioni sovrapposte come se fossero indipendenti |
| Altezza | Riferimento geometrico di **2 m sopra il terreno**, dichiarato nei risultati e nei confronti; non rappresenta automaticamente un particolare veicolo |
| Elevazione | Elevazione rispetto all'orizzontale e margine sopra il profilo del terreno sono restituiti separatamente |
| Luce continua | Da T fino alla prima discesa della frazione solare sotto C3; durata distinta da quella del buio completo |
| Terra | **Visibilità geometrica continua della Terra**, senza promessa di collegamento radio con una stazione |
| Buio | **Buio completo: frazione solare =0**. Separato dagli intervalli sotto il 50%, che possono ancora ricevere luce |
| Riferimento VIPER | Le 50 ore in ibernazione sono una nota documentata; **nessun allarme universale, filtro o punteggio** deriva da quel numero |
| Termica ed energia | Esclusi modelli di temperatura, sopravvivenza e autonomia. I dati NASA Diviner esistono, ma servirebbero parametri dell'hardware non richiesti dall'engine generale |
| Illuminazione annua C6 | Percentuale di durata nell'anno UTC con frazione solare ≥0,5, su **365 o 366 giorni**. L'80% è un'evidenziazione del team, non un requisito NASA |
| Benchmark 92,27% | Risultato dello studio Gläser con altro periodo e definizione; non massimo universale né confronto diretto con P50 annuale (C6) |
| Ombre permanenti C1 | Informazione di contesto e benchmark; nessun filtro automatico aggiuntivo |
| Campionamento | 1 ora e 360 direzioni sono configurazioni iniziali da sottoporre a convergenza, con raffinamento degli eventi e ricerca di interruzioni brevi |
| Copertura temporale | Ricerca degli eventi estesa finché possibile; **nessun limite fisico di un mese lunare**. Eventi incompleti o non trovati entro i dati sono dichiarati, non trasformati in zero o infinito |
| Dati insufficienti | Stato `unknown` per la misura interessata o copertura parziale esplicita. Interpolare un DEM grossolano non crea informazione alla scala di 100 m |

### 1.4 Aggregazione e confronto approvati

Si definisce **B(T)** come l'insieme delle celle con Sole e Terra geometricamente visibili a T secondo C3. La pendenza non appartiene alla definizione di B.

| Misura | Regola |
|---|---|
| Area con visibilità congiunta | Somma delle aree delle celle di B(T), riportata in km² e in percentuale dell'area regionale |
| Aree cumulative per pendenza | **A5, A10, A15**: aree di B(T) con pendenza rispettivamente <5°, <10°, <15°. Non sono classi disgiunte: A5 è contenuta in A10, che è contenuta in A15 |
| Continuità spaziale | Area della maggiore componente connessa di B e delle tre aree cumulative; vicinato di **4 celle**, con lato condiviso, non solo un vertice |
| Qualità | Copertura valida distinta per geometria e pendenza. Le celle sconosciute non sono trattate come false; con copertura incompleta la somma delle celle favorevoli note è un limite inferiore dell'area campionata, non la sua misura completa |
| Confronto C5 | Metriche confrontabili e ordinabili esplicitamente; **nessun punteggio o ordinamento lessicografico universale**, nessun vincitore assoluto |
| Punto rappresentativo | Identificatore e coordinate conservati; tutte le sue prestazioni appartengono allo stesso punto. Massimi di punti diversi non vengono combinati |
| Robustezza C7 | Valori a T e T±1, ±2, ±3 giorni: distinguere alternative presenti nella regione e **intersezione delle stesse celle** favorevoli alle date considerate, anche per A5/A10/A15 |
| Anticipi e ritardi | Riportati separatamente. Un buco a +1 non cancella il risultato a +2; campioni giornalieri non dimostrano continuità fra le date |
| Nessuna concomitanza | Se i dati completi non contengono celle con entrambe le visibilità, lo si dichiara senza giudicare la regione inabitabile o inadatta a ogni missione |

Le aree sono stime alla risoluzione della griglia e del DEM, non superfici certificate per il touchdown. Percentuali e copertura devono indicare il denominatore usato.

## 2. Cosa resta da definire e verificare

### 2.1 Dettagli tecnici e validazione

Le scelte scientifiche e descrittive sopra sono **approvate**. Restano da documentare attraverso l'implementazione e i confronti numerici:

- prodotto DEM e versione per ogni regione, risoluzione effettiva e gestione dell'incertezza;
- copertura del terreno lontano e criteri di sufficienza dei dati per ogni misura;
- anni di effemeridi in cache e strategia di estensione della ricerca degli eventi;
- tolleranze di verifica, fissate prima di misurare gli errori, e configurazione numerica finale dopo la convergenza;
- riproduzione delle verifiche dichiarate dal prototipo esterno, con artefatti e risultati consultabili;
- tempi di elaborazione sulle due regioni di sviluppo e storage effettivo;
- estensione ai siti non polari e trattamento della loro incertezza di posizione.

Una griglia più larga per motivi prestazionali non può essere introdotta senza misurarne e dichiararne gli effetti sulle aree e sulle finestre. Il confronto manuale con QuickMap affianca, ma non sostituisce, le verifiche numeriche e osservative.

### 2.2 Attività successive all'algoritmo

Frontend e integrazione sono **rimandati per decisione dell'utente**. Dopo la disponibilità dell'algoritmo si allineeranno contratti API, rappresentazione delle celle, formati di siti e regioni e strumenti dell'agente AI. Le interfacce esistenti non modificano le decisioni scientifiche approvate.

### 2.3 Manutenzione dei dati

- Unificare, quando si implementerà la pipeline, i percorsi `data/` e `backend/data/` e i sistemi di manifest.
- Ricontrollare stato e bersagli delle missioni del catalogo prima della consegna; conservare la data delle fonti.
- Misurare le prestazioni di lettura dei DEM nei volumi Docker.

## 3. Ordine di lavoro

1. **Documentazione:** allineare criteri, piano e guide alle decisioni approvate; nessuna implementazione in questo intervento.
2. **Dati:** scegliere i prodotti delle due regioni di sviluppo e fissare metadati, controlli di qualità e tolleranze.
3. **Geometria:** implementare successivamente effemeridi Horizons, orizzonti e occultazione dei dischi, con verifiche riproducibili.
4. **Metriche:** calcolare pendenza, intervalli, percentuali annuali, aree e robustezza senza filtro automatico a 10° o punteggio universale.
5. **Validazione:** confrontare casi analitici, Horizons topocentrico, prodotti NASA compatibili e osservazioni LROC; verificare convergenza e incertezza.
6. **Estensione:** ampliare regioni e siti quando le misure hanno copertura e qualità adeguate.
7. **Frontend:** affrontare soltanto dopo l'algoritmo l'integrazione e la presentazione dei risultati.
