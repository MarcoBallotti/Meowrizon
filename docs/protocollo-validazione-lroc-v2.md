# Protocollo osservativo LROC v2 — non ancora superato

Registrato il 15/11/2026 prima di applicare un nuovo metodo alle scene di verifica. Il benchmark Otsu v1 resta fallito; questo protocollo non ne cambia le tolleranze né ne sostituisce retroattivamente l'esito.

## Selezione e separazione dei dati

Le sei ortofoto MALAPERT02/MALAPERT03 già esaminate sono **solo sviluppo**, anche cambiando soglia o annotatore. Nuove scene di verifica devono provenire da acquisizioni distinte, con geometria e data note, copertura del poligono V1 e presenza osservabile di luce e ombra. Non dividere pixel adiacenti della stessa scena fra sviluppo e verifica. Se si modifica il metodo dopo una verifica, quella scena diventa sviluppo.

La selezione non deve usare previsioni o scarti dell'engine. Conservare tutti i candidati, motivi di esclusione, footprint, metadati, hash e data. Prodotti shaded relief simulati non sono osservazioni. Un mosaico multitemporale non ha un unico istante solare: serve risalire ai segmenti e alle acquisizioni originali.

## Riferimento indipendente

Un annotatore competente, senza vedere le previsioni, delimita aree sicuramente illuminate, ombra proiettata e zone incerte su ortofoto radiometricamente calibrate. Un secondo revisore controlla bordi e interpretazione; i disaccordi restano incerti. Un tono scuro da solo non dimostra ombra: usare morfologia della cresta/bordo, contesto e metadati; verificare albedo, incidenza, saturazione e NoData. Non imporre una percentuale di esclusioni per migliorare l'accordo.

Il pacchetto `backend/data/analysis/validation/review-20261115/annotation/` contiene campioni delle scene di sviluppo, coordinate stereografiche in metri, I/F, campi etichetta non compilati e viste dei dati osservati **senza predizioni**. `label=-1` significa non annotato/incerto, 0 ombra, 1 luce; non è un giudizio scientifico già espresso. Registrare annotatori, motivi, revisione e hash delle etichette prima di eseguire il confronto.

Le etichette del modello non sono ground truth. Le sei scene note non possono diventare holdout mediante questa annotazione. Per la verifica sono ancora necessari nuovi dati e riferimento controllato.

## Confronto e criteri immutati

- Confrontare `fSunTerrain` a quota suolo, usando epoca per linea quando disponibile. Se si usa l'epoca media, calcolare l'effetto fra inizio e fine acquisizione: se cambia lo stato di un campione, segnalarlo come temporalmente ambiguo e riportarne il numero.
- Conservare la convenzione v1: ombra a frazione zero, luce a frazione ≥0,5, frazioni intermedie parziali; esplicitare l'epsilon numerico. Registrare separatamente unknown e parziali.
- Metrica principale: accordo sui campioni osservativi annotati e con previsione decidibile; soglia **≥0,90 invariata**. Non basta se manca una classe o il riferimento non è indipendente: in tali casi il benchmark è incompleto.
- Riportare matrice 2×2 (righe riferimento, colonne previsione), precisione e richiamo per ciascuna classe, balanced accuracy, numerosità per scena, copertura, esclusioni e classi assenti. Nessuna nuova soglia numerica per queste diagnostiche.
- Bordi: sulle maschere dense georeferenziate, estrarre solo confini luce/ombra all'interno di aree annotate (escludere bordi di NoData e incerto); calcolare distanza dal bordo più vicino in entrambe le direzioni, mediana e P95 in metri, indicando scala e incertezza di registrazione. Non stimare la distanza dei bordi dalla griglia sparsa ogni 152 m come se fosse una maschera densa. Se i bordi mancano, metrica non valutabile.
- Non attribuire indipendenza statistica a pixel adiacenti. Riportare metriche per scena, senza usare il numero di pixel come numero di osservazioni indipendenti.

## Ricerca dei candidati e limiti

Ricerca del 15/11/2026:

- [MALAPERTA01](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_MALAPERTA01): centro −80,29°, fuori dalle regioni V1; non è Malapert Massif.
- [ESALL_MP1](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_DTM_ESALL_MP1): elaborazione DLR. L'archiviazione PDS non rende statunitense il produttore; escluso da questa verifica nel perimetro restrittivo delle fonti, senza sostituirlo arbitrariamente a dati NASA/USA.
- [DEGERRIMLO1](https://data.lroc.im-ldi.com/lroc/view_rdr/NAC_ROI_DEGERRIMLO1): mosaico di 144 NAC, 656 segmenti e tre intervalli di longitudine subsolare, acquisizioni 2009–2013. È utile per individuare le immagini originali, non come immagine a epoca unica. Il catalogo elenca fra i candidati `M168932116L`, `M168938902L`, `M168945689L`; footprint e ortorettifica dei singoli segmenti restano da verificare.
- Le sei ortofoto esistenti sono dati NASA LRO, prodotti ASU, serviti dall'archivio `pds.mcp.nasa.gov`; restano ammesse e disponibili per sviluppo.

La ricerca non dimostra che altre scene adatte non esistano. Non sono stati prodotti nuovi riferimenti annotati indipendenti: il gate osservativo resta aperto. Il passo necessario è acquisire e georeferenziare almeno una nuova scena con ombre estese, completare la revisione delle etichette e applicare il protocollo congelato. Per affermare copertura di entrambe le regioni servono riscontri in entrambe.
