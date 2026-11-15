# Piano di lavoro: engine puntuale V1

**Perimetro minimo approvato il 15/11/2026.** Questo piano sostituisce l'ordine di implementazione regionale precedente. La specifica normativa è [criteri-algoritmo.md](criteri-algoritmo.md); la ricerca sulle fonti è in [fonti-e-perimetro-challenge.md](fonti-e-perimetro-challenge.md). Il prompt operativo è [prompt-claude-engine-v1.md](prompt-claude-engine-v1.md).

**Intervento corrente: solo documentazione.** Le attività di codice sotto sono per il successivo incarico di implementazione.

## 1. Risultato da consegnare

Un engine Python che confronta 2–3 punti identificati nelle regioni de Gerlache Rim 2 e Malapert Massif, a date esplicitamente richieste. Per ciascun punto produce orizzonte reale, posizione locale di Sole/Terra, frazioni dei dischi, finestre, buio, eclissi, pendenza e qualità. Stessa durata di analisi per ogni scenario; esempio dimostrativo di 30 giorni e almeno due date. Nessuna conclusione sull'intera regione ricavata da pochi punti.

La consegna comprende libreria, CLI, configurazione riproducibile, JSON versionati, cache e rapporto di validazione. Gli endpoint scientifici HTTP, gli adapter client e il frontend vengono dopo. La futura visualizzazione di orizzonte e finestre è necessaria alla challenge e deve poter usare i dati prodotti, senza essere realizzata in questo incarico.

## 2. Base esistente da riutilizzare

Verificata staticamente nel repository il 15/11/2026; non è una dichiarazione di validazione dell'engine.

| Componente | Percorso | Impiego V1 |
|---|---|---|
| FastAPI e rotte esistenti | `backend/app/main.py`, `app/routes.py`, `app/api/` | Preservare health, cataloghi, acquisizione/preparazione e job esistenti |
| Acquisizione e normalizzazione | `app/services/sources.py`, `normalization.py`, `storage.py` | Riutilizzare trasporto, risposte grezze, manifest e lettura dei dati |
| Cataloghi e poligoni Moon Trek | `app/services/regions/`, `backend/catalog/` | Selezionare e verificare l'appartenenza dei punti; niente scansione completa |
| Proiezione e riferimento lunare | `app/core/moon.py` | Riutilizzare funzioni verificate; controllare datum/unità reali di ogni prodotto |
| Terreno | `app/services/terrain/lola_products.py` | Identificazione prodotti; il calcolo scientifico non è ancora presente |
| Effemeridi | `app/services/ephemerides/` e provider esistenti | Aggiungere adapter topocentrico; non assumere già implementato il modello locale |
| CLI e configurazione | `app/cli.py`, `app/__main__.py`, `app/settings.py`, `app/core/config.py` | Estendere senza rompere `init-regions`, `fetch`, `prepare`, `data-info` |
| Ambiente e controlli | `backend/environment.yml`, `pyproject.toml`, `backend/tests/` | Python 3.12, conda-forge, pytest e ruff; niente nuovo stack |
| Audit d'integrazione | `docs/api-contract.md`, dizionario e mappa API | Consultare come contesto; DTO del vecchio client e proposte HTTP non governano l'engine V1 |

Esistono due convenzioni di storage (`data/` e `backend/data/`). Documentare quale percorso usa ogni input; non migrare o cancellare l'archivio esistente. I nuovi artefatti scientifici usano un percorso configurabile sotto `backend/data/analysis/`, ignorato da Git. Configurazioni piccole, schemi e fixture di test possono essere versionati; DEM grandi e cache reali no.

## 3. Confine V1 / V2

| V1 ora | V2 dopo la validazione puntuale |
|---|---|
| 2–3 punti nelle due regioni, ID e coordinate espliciti | Griglia regionale 100 × 100 m, 13 regioni e 16 siti globali |
| Horizons topocentrico diretto, DEM LRO-LOLA | Ottimizzazione globale `14,15,19,20` soltanto dopo verifica di tempi luce/frame |
| Finestra di analisi finita, eventi completi o troncati | Estensione automatica della ricerca oltre la finestra |
| Pendenza su supporto circolare diametro 100 m, quattro fasce | Aree B/A5/A10/A15, componenti a 4 vicini |
| Confronto diretto delle date richieste | Scansione ±1/2/3 giorni e persistenza delle stesse zone |
| Angoli, frazioni, finestre e buio | P50 annuale e indicatore ≥80%, benchmark pluriennali |
| Libreria, CLI, JSON e validazione | Integrazione HTTP/frontend, poi eventuale agente AI e strumenti educativi |

Non pianificare termica hardware, watt, batterie, radio effettiva/relay, traiettorie, sicurezza d'atterraggio, percorsi PSR o quantità di ghiaccio. Sono fuori dal modello generale. I riferimenti VIPER e Gläser rimangono bibliografia, non badge o soglie negli output V1.

## 4. Sequenza di implementazione V1

### A. Inventario, schema e criteri di accettazione

1. Leggere le istruzioni locali, controllare `git status` e preservare modifiche del team. Rileggere lo stato reale dei moduli: il presente elenco non sostituisce l'ispezione del codice.
2. Definire uno schema interno versionato per richiesta e risultato, indipendente dal DTO client. Esplicitare unità, UTC, coordinate, null, stati e motivi.
3. Preparare una configurazione di esempio con due punti, uno per regione; usare coordinate riproducibili verificate nei poligoni e nel DEM. Un terzo punto è facoltativo. Non inventare una posizione “ottimale”.
4. Definire e salvare tolleranze numeriche prima di eseguire i confronti: angoli, frazioni, slope ed eventi. Sono criteri del team da giustificare, non precisioni NASA. Conservare gli esiti falliti senza allargare tacitamente le tolleranze.

**Uscita:** schema, configurazione e piano di verifica leggibili; nessuna dipendenza da metriche V2.

### B. Dati reali e manifest

1. Selezionare DEM LRO-LOLA adeguati per terreno vicino/lontano e supporto di slope. Confrontare i prodotti PDS e PGDA già documentati; non scaricare l'intero polo per pochi punti.
2. Riutilizzare acquisizione, caching e file originali. Conservare URL, prodotto, versione, hash, frame, datum, unità, NoData, risoluzione nominale/effettiva e qualità disponibile.
3. Predisporre query Horizons topocentriche per Sole e Terra con quota reale del DEM più 2 m. Consultare il manuale per geometria apparente senza rifrazione, distanze, diametri e tempi. HTTP 200 non basta: verificare errori, header, delimitatori e copertura.
4. Acquisire in modo seriale e con cache/backoff. I tempi esatti delle osservazioni e dei campioni devono restare ricostruibili. Nessun fallback sintetico se la rete o un prodotto manca.

**Uscita:** input riproducibili; modalità offline esplicita che funziona solo se i dati richiesti sono disponibili.

### C. Terreno per punto, riutilizzabile fra date

1. Calcolare quota e piano locale sulla finestra circolare di diametro 100 m. Convertire correttamente in coordinate metriche locali; non confondere distorsione cartografica e pendenza.
2. Restituire gradi e fascia [0,5), [5,10), [10,15), ≥15°, senza filtro a 10°. Dati insufficienti danno null/stato/motivo, non una slope interpolata artificialmente.
3. Calcolare orizzonte per azimut includendo curvatura, osservatore a 2 m e terreno vicino/lontano. 360 direzioni sono solo una configurazione iniziale; distanza massima, campionamento radiale e gestione dei bordi richiedono convergenza.
4. Conservare copertura per direzione; una direzione ignota non vale orizzonte 0°. La cache include punto, quota, altezza, DEM/hash e configurazione/versione del metodo.

**Uscita:** profilo numerico, slope, copertura e provenienza per ciascun punto.

### D. Serie locali, dischi ed eclissi

1. Usare Horizons topocentrico a T esatto e nella finestra richiesta; interpolazione vettoriale/angolare verificata, senza discontinuità 359°/0° o arrotondamento di T.
2. Conservare azimut, elevazione del centro sull'orizzontale locale, H nell'azimut del centro e margine e−H separati.
3. Integrare il disco sul profilo completo: `fSunTerrain`, `fSun` dopo terreno e occultazione terrestre, `fEarth` indipendente dalla fase illuminata.
4. Calcolare l'unione delle occultazioni solari, non il prodotto di due frazioni. Conservare cause terreno/eclissi anche sovrapposte. Il modello iniziale usa la Terra opaca e dichiara l'assenza di contributi atmosferici/diffusi.
5. C3 significa frazione ≥0,5; buio completo fSun=0 è distinto da luce ridotta 0<fSun<0,5. Ogni tolleranza numerica rispetto allo zero deve essere documentata.

**Uscita:** serie coerenti, valori a T, cause e qualità; niente potenza o disponibilità radio dedotta.

### E. Eventi, confronto e JSON

1. Trovare finestre Sole C3, Terra C3 e loro intersezione, intervalli sotto C3 e buio completo. Cercare anche eventi brevi tra campioni con stato uguale; raffinare e verificare convergenza.
2. Limitare la ricerca alla finestra e ai dati disponibili. Distinguere confini fisici osservati e limiti dell'analisi; un intervallo può essere troncato sia all'inizio sia alla fine.
3. Se a T un corpo è noto sotto C3, il residuo della finestra attiva è 0; se è sconosciuto, è null. Se l'evento finale non è trovato, la durata totale è null e si espone la durata minima verificata. Non collegare finestre attraverso buchi di dati.
4. Confrontare gli stessi punti alle date richieste e i diversi punti alla stessa data; mantenere durata di analisi e parametri comuni. Nessuno score, vincitore globale o area regionale.
5. Esporre da CLI la chiamata alle funzioni Python; salvare richiesta risolta, risultati, manifest e rapporto. Riutilizzare il terreno fra date e la cache fra run uguali. Modifiche a DEM, punto o metodo devono invalidare il riuso pertinente.

**Uscita:** un comando documentato riproduce gli esempi e produce JSON validi anche con risultati parziali.

### F. Verifica e validazione V1

| Verifica | Evidenza richiesta |
|---|---|
| Parser e unità Horizons | Fixture originali, header/distanze/tempi controllati; errori applicativi e campioni mancanti gestiti |
| Interpolazione | Confronto con query Horizons dirette ad istanti intermedi non usati nell'interpolazione; non chiamarlo prova indipendente di Horizons |
| Coordinate e orizzonte | Sfera liscia, ostacoli noti, segni/azimut, distanza e curvatura; condizioni limite e NoData |
| Slope | Piani sintetici, valori sui confini delle fasce, confronto PGDA a supporto e scala compatibili |
| Dischi ed eclissi | Occultazione nulla/parziale/totale, sovrapposizioni, orizzonte irregolare e fase terrestre separata |
| Eventi | Eventi brevi, attraversamenti, lacune, intervalli troncati su entrambi i lati, inizio/fine della richiesta |
| Convergenza | Passi angolari e temporali più fitti, terreno più esteso/risolto; errori su angoli, frazioni, slope ed eventi |
| Osservazioni | Almeno un confronto con ombre LROC a epoca reale nelle regioni di sviluppo, con altezza e risoluzione compatibili; documentare scarti e limiti |
| Riproducibilità | Stesso input/versioni produce gli stessi risultati; invalidazione cache e offline senza dati inventati |

Eseguire test unitari e d'integrazione backend significativi, lint e controlli esistenti pertinenti. Nessun test UI, simulatore o E2E in questo incarico. I test di rete sono separati dai test offline e non si dichiarano passati se non eseguiti.

La dimostrazione reale deve coprire almeno due punti, due date e finestre di uguale durata. Se il riscontro osservativo o un confronto richiesto non è disponibile, l'implementazione può essere consegnata con limiti espliciti, ma **il gate di validazione V1 resta incompleto**. Non attendere un prototipo esterno per iniziare: se disponibile, è un riferimento aggiuntivo, mai una prova sostitutiva.

## 5. Definition of done

- Il comando CLI e le funzioni Python producono tutti gli output V1 con dati reali dei punti di sviluppo.
- JSON versionato con stati/null, copertura, provenienza e limiti numerici; nessun campo V2 inventato.
- Eclissi, orizzonte, eventi e slope hanno verifiche significative e risultati tracciati.
- Rapporto di validazione consultabile, con tolleranze, esiti, lacune, tempi a cache fredda/calda e configurazione finale.
- README backend aggiornato con comandi effettivi, requisiti dei dati e procedura offline; nessuna promessa di precisione non dimostrata.
- Le funzionalità esistenti non sono regredite. Nessuna modifica al frontend e nessuna nuova API HTTP scientifica richiesta.

## 6. Dopo la V1

Prima integrare e visualizzare i risultati puntuali verificati; poi scegliere l'ordine delle estensioni V2. Gli audit e contratti API esistenti restano materiale d'integrazione, non una lista di endpoint da implementare ora. Aree e robustezza regionali richiedono un nuovo gate di validazione del campionamento spaziale. Le formule V2 sono conservate nei criteri, con stato esplicito.

---

## Fonti

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview*, presentazione per la NASA 2025 International Space Apps Challenge, 4 ottobre 2025. NTRS 20250009323. Slide 19 (caratteristiche del polo sud), 21 ("Key Artemis III Landing Requirements"), 23–28. https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge*. NTRS 20210026296. Slide 4: tolleranza di pendenza dell'HLS "almeno 8 gradi", da HLS-S-R-0071 (documento HLS-RQMT-006, 2021). https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- **[F3]** NASA Moon Trek, layer *Artemis III Candidate Landing Regions, S Pole* (`A3_Named_regions_SP`) e relativo abstract (regioni annunciate il 19 agosto 2022, criteri e luce continua per 6,5 giorni). Poligoni: https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json. Abstract: https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP. Annuncio: https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/
- **[F4]** NASA, *NASA Provides Update on Artemis III Moon Landing Regions*, 28 ottobre 2024. Lista storica a nove regioni. https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/. Prodotti cartografici USGS da verificare prima dell'integrazione: https://www.usgs.gov/data/down-selected-artemis-iii-candidate-landing-site-navigational-grids
- **[F5]** JPL Horizons API: https://ssd-api.jpl.nasa.gov/doc/horizons.html. Ottimizzazione globale V2, non usata dalla V1: `COMMAND='301'`, `CENTER='500@399'`, `QUANTITIES='14,15,19,20'`; validazione topocentrica secondo [F32].
- **[F6]** LOLA GDR polari, PDS Geosciences Node: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
- **[F7]** E. Mazarico, NASA GSFC PGDA, *Lunar Polar Illumination*: https://pgda.gsfc.nasa.gov/products/69. File: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/. Da citare: Mazarico, E., et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081, doi:10.1016/j.icarus.2010.10.030.
- **[F8]** LROC, *WAC Percentage-Based Illumination 100mpp, S Pole* (`WAC_POLE_ILL_PCT_SOUTH_100M`), su Moon Trek. Riferimento: E. J. Speyerer, M. S. Robinson, *Persistently illuminated regions at the lunar poles: Ideal sites for future exploration*, Icarus 222 (2013) 122–136.
- **[F9]** NASA Moon Trek, layer *Permanently Shadowed Regions (PSRs), S Pole* (`PSR_SP`), abstract: 164 ombre permanenti, tutte > 10 km². https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=PSR_SP
- **[F10]** NASA Moon Trek, layer *LRO LOLA Slope, S Pole, 87.5 deg* (`Slope_LRO_LOLA_DEM_SPole875_5mp_v04`), per il controllo visivo della pendenza.
- **[F11]** NASA NSSDCA, *Sun Fact Sheet*: raggio medio volumetrico del Sole 695 700 km. È il valore adottato nel modello di disco sferico; non si attribuisce alla NASA la definizione della costante nominale IAU. https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html
- **[F12]** NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **[F13]** `README.md` del repository Meowrizon: criteri, riduzione dei dati, prototipo e verifiche del team.
- **[F14]** NASA Marshall, *Marshall Science Achievements 2025*, sezione IM-2: atterraggio a 250 m dal bersaglio. Distanza osservata in quella missione, non requisito generale né validazione della griglia di 100 m. https://www.nasa.gov/marshall-science-achievements/
- **[F16]** NASA Moon Trek, layer *Lunar Anthropogenic Impacts and Spacecraft Sites* (`Lunar_Landing_Impact_Sites`, 7/11/2022), dati NSSDCA: https://trek.nasa.gov/moon/trekarcgis2/rest/services/Lunar_Landing_Impact_Sites/MapServer (sottolayer 1: atterraggi morbidi, 2: con equipaggio). Fonte dei dati: https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html
- **[F17]** LROC, posizione dei lander misurata nelle immagini di LRO: Chandrayaan-3 https://www.lroc.asu.edu/images/1314, Chang'e 6 https://www.lroc.asu.edu/images/1374, Blue Ghost M1 https://www.lroc.asu.edu/images/1407
- **[F18]** USGS / IAU, *Gazetteer of Planetary Nomenclature*, centri delle formazioni lunari: https://planetarynames.wr.usgs.gov/shapefiles/MOON_nomenclature_center_pts.zip
- **[F19]** M. K. Barker, NASA GSFC PGDA, *A New View of the Lunar South Pole from LOLA* (prodotto 90): DEM, qualità e slope con supporto circolare di diametro 100 m. https://pgda.gsfc.nasa.gov/products/90. File in https://pgda.gsfc.nasa.gov/data/LOLA_20mpp/. Riferimento: https://pgda.gsfc.nasa.gov/products/90. DEM a 5 m, errori e cloni per specifici siti: https://pgda.gsfc.nasa.gov/products/78
- **[F20]** NASA, *VIPER Lunar Operations*: riferimento nominale di 15°, con capacità diverse in determinate condizioni; non limite universale di percorribilità. Per distinguere le condizioni delle 50 ore si usa [F28]. https://science.nasa.gov/mission/viper/lunar-operations/
- **[F21]** NASA, *CLPS: Firefly Blue Ghost Mission One Press Kit* (2025). Contesto della missione e rilevamento di crateri, pendenze e rocce nella discesa. Non sostituisce quantitativamente i precedenti limiti di pendenza del paper LPSC 2022, qui ritirati. https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf
- **[F22]** USGS Publications Warehouse, Williams et al., *Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma* (2026), record 70278944. Stesso studio, ora citato attraverso USGS; l'abstract istituzionale documenta il compromesso fra obiettivi scientifici e vincoli di missione. Il dettaglio del supporto di slope a 4 m non viene usato come requisito dell'engine. https://www.usgs.gov/publications/lunar-vise-landing-site-selection-and-characterization-mons-gruithuisen-gamma
- **[F23]** NASA, *Apollo Lunar Module Landing Gear*: riferimento storico sul sistema di atterraggio; non usato per stabilire soglie generali o un limite di decollo. https://www.nasa.gov/wp-content/uploads/static/history/alsj/LM_Landing%20Gear1973010151.pdf
- **[F25]** Arizona Board of Regents / Arizona State University, scheda istituzionale di Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution digital terrain models from LOLA*. Ricerca internazionale con autori NASA e ASU, non standard NASA. L'abstract conferma lo studio di 19 anni e il 92,27% a 2 m; resta distinto da P50 annuale. https://experts.azregents.edu/en/publications/illumination-conditions-at-the-lunar-south-pole-using-high-resolu/
- **[F26]** T. George, M. A. Rubio, S. J. Lawrence, P. Curell (NASA), *Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions*, 57th LPSC (2026), abstract 1901. https://ntrs.nasa.gov/citations/20250011660
- **[F27]** NASA Planetary Data System, Geosciences Node, *LRO Diviner*: osservazioni e prodotti delle temperature della superficie lunare. https://pds-geosciences.wustl.edu/missions/lro/diviner.htm
- **[F28]** NASA NTRS, *2024 Planetary Science Technology Symposium*, presentazione VIPER, documento 20240013291, slide 2: 50 ore in ibernazione a bassa potenza e 9 ore di operazioni in PSR. https://ntrs.nasa.gov/api/citations/20240013291/downloads/PESTO-VIPER-intro.pdf
- **[F29]** H. J. Fincannon, NASA Glenn, *Lunar Environment and Lunar Power Needs*: ombre topografiche ed eclissi terrestri nel contesto dell'alimentazione. https://ntrs.nasa.gov/api/citations/20205002224/downloads/Lunar%20Environment%20and%20Lunar%20Power%20Needs_2.pdf
- **[F30]** LROC, *WAC Time-Weighted South Pole Illumination Map*: osservazioni 2010–2011, copertura e pesatura temporale documentate. https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_TWI_SOUTH
- **[F31]** NASA-STD-7009B, *Standard for Models and Simulations*: riferimento metodologico per verifica, validazione e incertezza; non dichiarazione di conformità del progetto. https://standards.nasa.gov/standard/NASA/NASA-STD-7009
- **[F32]** JPL, *Horizons System Manual*: frame, quantità 14/15/19/20, tempi e geometria apparente. https://ssd.jpl.nasa.gov/horizons/manual.html
- **[F15]** Immagine Docker `mambaorg/micromamba`: https://hub.docker.com/r/mambaorg/micromamba (tag verificati il 14/11/2026).
