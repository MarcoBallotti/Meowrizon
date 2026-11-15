# Fonti istituzionali e perimetro della challenge

Revisione del 15/11/2026. Questo documento registra la ricerca e il perimetro minimo **approvato dal team**. Le sostituzioni bibliografiche sono applicate. Le riduzioni funzionali sono ora la separazione V1/V2, formalizzata nei criteri e nel piano di lavoro. Nessun engine, catalogo runtime o frontend è implementato/modificato da questo intervento.

## 1. Obiettivo ufficiale e limiti della verifica

La [descrizione ufficiale di Lunar Landing Site Navigator](https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/) chiede uno strumento intuitivo per confrontare rapidamente siti e date, mostrando Sole e Terra rispetto all'orizzonte. L'utilità attesa riguarda il potenziale di generazione energetica e le finestre di comunicazione diretta con la Terra; i destinatari comprendono pianificatori, educatori e pubblico.

**Evidenza consultata:** descrizione della pagina ufficiale restituita dall'indice di ricerca il 15/11/2026. L'apertura diretta della pagina e delle schede dettagli/risorse ha restituito errori 502 o contenuto non accessibile. Non è stato possibile verificare integralmente quelle schede; non si attribuiscono alla challenge requisiti aggiuntivi ricavati da repository di altri partecipanti. Le priorità seguenti sono una nostra interpretazione della descrizione ufficiale, da ricontrollare rispetto al testo integrale prima della consegna.

**Nota del 15/11/2026, durante l'implementazione dell'engine V1.** Il testo completo della pagina ufficiale (descrizione, obiettivi, considerazioni e risorse) è stato letto dal contenuto servito dalla pagina stessa. Conferma le priorità indicate qui: mostrare Sole e Terra rispetto all'orizzonte del sito alla data scelta, confrontare rapidamente siti e date, tempo residuo prima di tramonto ed Earthset, elevazione solare, finestre di luce e di visibilità della Terra, topografia reale e librazione. Elenchi di siti noti (Apollo, CLPS, altri programmi) e coordinate libere compaiono fra le possibilità («you may consider»), non fra gli obblighi. Le risorse elencate sono QuickMap (Arizona State University), Moon Trek, JPL Horizons e, come partner, il portale CSA: il vincolo «solo fonti NASA o istituzionali USA» resta quindi una scelta del team più stretta della consegna. La politica delle fonti non cambia.

La conseguenza progettuale è privilegiare un confronto comprensibile e verificabile. La geometria sostiene una valutazione preliminare di luce e visibilità; watt, autonomia e collegamenti radio effettivi richiedono parametri ulteriori. Non basta una classifica numerica senza posizione degli astri e orizzonte. Il frontend rimane rinviato come lavoro, ma la visualizzazione è una parte essenziale della consegna finale della challenge.

## 2. Politica delle fonti

Per i contenuti scientifici si accettano:

- NASA/JPL, NASA NTRS, PGDA, Moon Trek e prodotti ufficiali delle missioni NASA;
- agenzie federali USA, in particolare USGS;
- istituzioni pubbliche USA per pubblicazioni di cui documentano autori e provenienza, come Arizona Board of Regents / ASU.

Il [portale Arizona Board of Regents](https://experts.azregents.edu/) dichiara di essere un servizio delle università pubbliche dell'Arizona. Questo soddisfa il criterio «istituzionale USA», ma non rende esclusivamente statunitensi gli autori di ogni studio. Se si volesse un vincolo più stretto, **solo agenzie federali**, il riferimento Gläser/ASU andrebbe escluso.

Un dominio universitario può essere un canale ufficiale NASA: per esempio il nodo PDS Geosciences e i prodotti LROC. Viceversa, un layer presente in Moon Trek non è automaticamente di origine NASA: il manifest deve conservare missione produttrice, istituzione responsabile e prodotto. Per i DEM dell'engine la scelta resta LRO-LOLA; eventuali prodotti combinati con altre missioni richiedono una nuova verifica di provenienza.

QuickMap resta uno strumento facoltativo per esplorazione e confronto manuale. I numeri usati come evidenza devono essere ricondotti ai prodotti istituzionali originali. Documentazione delle librerie, immagini Docker, contratti locali e proposte del team non sono fonti scientifiche NASA e restano etichettati separatamente. La politica non richiede di sostituire la documentazione tecnica ufficiale dei software con fonti astronomiche.

## 3. Sostituzioni e lacune

| Riferimento precedente | Fonte adottata | Equivalenza e decisione |
|---|---|---|
| collectSPACE: annuncio regioni 2022 | [NASA, annuncio originale](https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/) | Sostituzione diretta dell'annuncio; catalogo storico invariato |
| IAU B3: raggio solare | [NASA Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html) | Stesso valore numerico, 695 700 km; NASA lo tabula come raggio medio volumetrico. Il modello usa una sfera; non si attribuisce alla NASA l'origine della costante nominale IAU |
| Intuitive Machines: IM-2 a 250 m dal bersaglio | [NASA Marshall, Science Achievements 2025](https://www.nasa.gov/marshall-science-achievements/) | Il dato è riportato da NASA; resta un esito di missione, non una soglia di sicurezza |
| Gläser 2014 su DLR/editoriale | [Scheda Arizona Board of Regents / ASU](https://experts.azregents.edu/en/publications/illumination-conditions-at-the-lunar-south-pole-using-high-resolu/) | Stesso articolo e stesso abstract, inclusi 19 anni e 92,27% a 2 m. Fonte istituzionale USA, ricerca internazionale. Non prova P50 annuale né fornisce da sola tutti gli input per riprodurre il benchmark |
| Lunar-VISE su DOI editoriale | [USGS, record 70278944](https://www.usgs.gov/publications/lunar-vise-landing-site-selection-and-characterization-mons-gruithuisen-gamma) | Stesso studio. La scheda sostiene il contesto di selezione e i compromessi scientifici/operativi; non si usa l'abstract per dimostrare il dettaglio metodologico del supporto di slope a 4 m |
| Wueller 2026 | [NASA PGDA, illuminazione polare](https://pgda.gsfc.nasa.gov/products/69) e [NASA, selezione delle regioni](https://ntrs.nasa.gov/citations/20250011660) | **Non equivalenti** alle conclusioni specifiche su siti, accessibilità delle PSR o quantità di volatili. Non trovato un equivalente istituzionale verificato di quelle conclusioni; F24 rimosso dai riferimenti operativi. Le fonti NASA sostengono soltanto il contesto e i prodotti che effettivamente descrivono |
| Blue Ghost, paper LPSC 2022 | [NASA, press kit 2025](https://www.nasa.gov/wp-content/uploads/2025/01/np-2025-01-001-jsc-clps-firefly-press-kit-screen-508-1-10-25-final.pdf) | Fonte NASA per contesto e riconoscimento degli ostacoli. **Non verificata equivalenza** per i precedenti numeri ≤10° e circa <5°: numeri rimossi, nessuna soglia ricavata dal press kit |
| VIPER, abstract USRA | [NASA NTRS, specifiche VIPER 2024, slide 2](https://ntrs.nasa.gov/api/citations/20240013291/downloads/PESTO-VIPER-intro.pdf) | Conferma 50 ore in ibernazione e 9 ore di operazioni nelle PSR. Rimane una nota specifica del rover, senza effetti sulle metriche |
| George 2026, abstract USRA | [NASA NTRS 20250011660](https://ntrs.nasa.gov/citations/20250011660) | Stesso aggiornamento scientifico, disponibile nel repository NASA; requisiti contestualizzati all'architettura descritta |
| CSA, parte educativa | [NASA Science, Moon](https://science.nasa.gov/moon/) | Alternativa per la divulgazione generale, non replica di ogni contenuto CSA |
| ESA MIDAS, vecchi appunti di traiettoria | NASA GMAT già citato negli stessi appunti | Rimosso il riferimento ESA. GMAT è un possibile strumento di dinamica, non un sostituto già verificato delle stesse funzioni; nessuna traiettoria entra nel perimetro attuale |
| Gazetteer IAU | [USGS Gazetteer](https://planetarynames.wr.usgs.gov/) | Fonte istituzionale USA già presente. Si conserva l'attribuzione dei nomi IAU e l'incertezza dei centri nominali; non si rinominano i sistemi di coordinate per nasconderne l'origine |

F24 non viene riassegnato ad altro studio, così le citazioni precedenti non cambiano significato. Le fasce 0–5°, 5–10°, 10–15°, ≥15°, C3 al 50%, altezza 2 m, griglia 100 m e soglia annuale 80% restano **convenzioni del team**, non diventano prescrizioni NASA cambiando bibliografia.

## 4. Prima consegna V1 approvata

**Decisione approvata:** dimostrare bene il confronto fra 2–3 punti identificati nelle due regioni di sviluppo, su uno stesso intervallo temporale dichiarato, e confrontare date alternative. È un primo passo verso l'aggregazione regionale, non una dimostrazione che pochi punti rappresentino tutta la regione.

Per ciascun punto mantenere:

1. coordinate, quota, DEM, altezza dell'osservatore e qualità;
2. profilo dell'orizzonte reale e tracce di Sole/Terra, azimut, elevazione e margine;
3. frazioni dei dischi, eclissi, finestre visibili e interruzioni, distinguendo buio completo e luce ridotta;
4. pendenza numerica e fascia descrittiva alla scala dichiarata, se i dati consentono la misura;
5. stessa finestra di confronto, dati mancanti e risultati troncati espliciti, senza classifica universale;
6. confronto numerico con Horizons, casi analitici del terreno/disco, convergenza e almeno un riscontro osservativo compatibile.

La durata della finestra di analisi è un limite computazionale dichiarato, non una durata di missione. Una ricerca che raggiunge il limite senza trovare l'evento restituisce un intervallo troncato, come previsto dai criteri; non serve promettere una ricerca illimitata per avere un risultato utile e onesto.

## 5. Rinvii ed esclusioni approvati

| Elemento | Decisione | Motivo e conseguenza |
|---|---|---|
| Tutte le 13 regioni campionate integralmente | Rinviare l'estensione; iniziare da pochi punti nelle due regioni di sviluppo | Riduce calcolo e validazione. La prima dimostrazione non potrà dichiarare aree regionali complete |
| 16 siti globali, Apollo e bersagli CLPS futuri | Rinviare la loro analisi numerica | Richiedono DEM diversi e gestione di coordinate incerte; non aiutano a dimostrare prima la geometria del polo sud |
| P50 annuale e indicatore ≥80% | Seconda fase | Costosi su una griglia e meno immediati del confronto delle finestre. Se mostrati, richiedono anno completo; nessuna estrapolazione |
| Aree A5/A10/A15, componenti e intersezioni fra sette date | Seconda fase dopo la validazione puntuale | Utili per la ricerca regionale, ma non indispensabili al primo confronto di punti. Non calcolare aree da pochi punti scelti |
| Indicatore sintetico di robustezza | Omettere; mantenere il confronto diretto di date | Le differenze reali nelle finestre sono più trasparenti di un numero aggregato |
| Nota VIPER 50 ore e benchmark Gläser 92,27% | Spostare nella documentazione scientifica, fuori dalla risposta principale all'utente | Non sono limiti del mezzo generico né soglie di decisione del progetto |
| Termica hardware, batterie, watt, link budget, relay | Confermare l'esclusione | Richiedono un mezzo e un sistema di comunicazione definiti |
| Lancio, trasferimento, discesa e replay Blue Ghost | Fuori dal nucleo della challenge interpretato qui | Problemi diversi dalla geometria di osservazione al suolo |
| Percorsi verso PSR, stime di ghiaccio e ricerca di risorse | Fuori perimetro | Non derivano dalla sola visibilità e richiedono ulteriori modelli e validazione |
| Agente AI, CAD del veicolo, news e cataloghi educativi estesi | Rinviare | Non necessari a calcolare o spiegare correttamente le finestre; aumentano il lavoro prima della validazione |
| Visualizzazione di orizzonte, Sole/Terra e confronto delle finestre | **Non tagliare dalla consegna finale** | È parte esplicita della descrizione della challenge. Nessun lavoro frontend viene anticipato in questa revisione |
| Provenienza, unità, frame, NoData, eclissi e verifiche | **Non tagliare** | Un risultato semplice deve restare verificabile; eventuali approssimazioni vanno dichiarate e misurate |

Il perimetro minimo è adottato. `criteri-algoritmo.md` e `piano-logica.md` distinguono V1 e V2; `prompt-claude-engine-v1.md` definisce il successivo incarico di implementazione. HTTP e frontend sono fasi successive e le metriche rinviate non sono risultati disponibili.
