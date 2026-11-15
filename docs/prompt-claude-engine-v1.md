# Prompt per Claude: implementazione dell'engine V1

Il testo seguente è pronto da usare in Claude Code nel repository MeowrizonProject. Autorizza l'implementazione futura; la sua redazione non ha implementato l'engine.

---

Lavora nel repository `/Users/marcoballotti/Git/Personal/MeowrizonProject`.

Implementa e verifica il **nucleo scientifico puntuale V1 di Meowrizon**, secondo il perimetro minimo approvato. Non fermarti a un piano: realizza libreria Python, CLI, configurazioni, risultati JSON e verifiche. Preserva il lavoro già presente e mantieni aggiornamenti di avanzamento chiari.

## 1. Leggi prima di modificare

Leggi le istruzioni locali applicabili e questi documenti, in ordine di precedenza:

1. `docs/criteri-algoritmo.md`: definizioni scientifiche e separazione V1/V2.
2. `docs/piano-logica.md`: ordine di lavoro e condizioni di completamento.
3. `docs/fonti-e-perimetro-challenge.md`: provenienza ammessa e limiti della ricerca sulla challenge.
4. `docs/stato-decisioni.md`, `docs/guida-dati.md`, `docs/siti-e-regioni.md`.
5. `backend/README.md`, `backend/environment.yml`, `backend/pyproject.toml`.
6. `docs/api-contract.md` e `backend/API_CONTRACT.md` soltanto per conoscere l'integrazione futura. L'archivio del contratto non è la specifica da implementare.

Controlla `git status` e ispeziona il codice corrente: ci sono modifiche del team che non devi sovrascrivere. Non fare reset, pulizie distruttive, migrazioni degli archivi o modifiche fuori scope. Se trovi divergenze, applica la specifica V1 più recente; segnala veri blocchi e continua il lavoro indipendente. Non inventare dati, accuratezza o risultati di test.

## 2. Risultato richiesto e confini

V1 confronta **2–3 punti identificati**, complessivamente distribuiti fra de Gerlache Rim 2 e Malapert Massif, e date esplicitamente richieste. La demo deve includere almeno un punto per regione e almeno due date. I punti non rappresentano statisticamente la regione né sono siti certificati di atterraggio.

Implementa soltanto:

- quota, orizzonte reale e pendenza locale per punto;
- posizioni topocentriche di Sole/Terra, angoli, frazioni dei dischi ed eclissi;
- finestre temporali e confronto diretto fra punti/date;
- provenienza, qualità, cache, JSON, CLI e validazione.

**Non implementare:** scansione di griglie o regioni, aree B/A5/A10/A15, componenti, P50 annuale/80%, robustezza aggregata o scansione automatica di sette date, catalogo globale, score/ranking, termica, watt, batterie, radio-link/relay, traiettorie, percorsi PSR, ghiaccio, AI, CAD, frontend o nuovi endpoint scientifici HTTP. Non installare librerie frontend, non collegare i mock e non fare test UI, simulatori o E2E.

La visualizzazione finale verrà dopo: ora fornisci dati numerici che consentano profilo d'orizzonte, tracce e timeline. Non generare un'immagine al posto degli array numerici.

## 3. Riusa l'architettura presente

Backend Python 3.12, conda-forge, NumPy/SciPy, Rasterio/GDAL, pyproj, FastAPI e storage su file. Nessun database e nessun nuovo servizio distribuito.

Ispeziona e riusa quando appropriato:

- `backend/app/services/sources.py`, `normalization.py`, `storage.py`, `jobs.py`;
- `backend/app/services/regions/` e `backend/catalog/`;
- `backend/app/core/moon.py`, `core/manifest.py`, `core/config.py`;
- `backend/app/services/terrain/`, `services/ephemerides/`;
- `backend/app/cli.py`, `app/__main__.py`, `app/settings.py`;
- i test esistenti in `backend/tests/`.

Crea moduli separati per modelli, terreno, effemeridi, visibilità, eventi e orchestrazione, coerenti con le cartelle esistenti. Il calcolo deve essere richiamabile da Python senza avviare FastAPI. Estendi la CLI senza rompere `init-regions`, `fetch`, `prepare`, `data-info` o le rotte esistenti.

I nuovi output scientifici stanno, per default, sotto `backend/data/analysis/`, in directory configurabili e ignorate da Git. Non spostare gli archivi `data/` e `backend/data/`; usa adapter di lettura se necessario. Versiona solo configurazioni, schemi, test e fixture piccole adeguate.

## 4. Input e schema del risultato

Definisci e documenta un modello interno versionato, indipendente dai vecchi DTO TypeScript. Puoi scegliere i nomi Python/JSON coerenti con il progetto, ma tutti questi concetti devono essere rappresentati:

**Richiesta:** punti con ID, regione e coordinate planetocentriche; uno o più T esatti in UTC; durata positiva comune; osservatore V1 fisso a 2 m sopra DEM; prodotti/versioni o regole esplicite per risolverli; configurazione numerica; modalità online/offline. Valida latitudine, longitudine, ID e appartenenza alle regioni supportate. Non sostituire silenziosamente un punto fuori copertura. La demo usa 30 giorni come finestra di analisi, non come durata di missione.

**Risultato:** versione dello schema/algoritmo; richiesta risolta; manifest delle fonti; punto e quota; profilo H(azimut) con validità; slope, fascia, supporto e qualità; serie a tempi UTC espliciti; stato a T; finestre ed eventi; diagnostica e copertura per metrica.

Ogni campione conserva azimut/elevazione del centro, margine sul terreno, dimensioni angolari/distanze necessarie e frazioni. Conserva UTC assoluto e riferimento T per confrontare anche il tempo trascorso. La finestra è [T, T+durata); un campione al bordo finale può servire al calcolo, senza aggiungere durata.

Per una misura V1 non valutabile usa `null`, stato e motivo. Non serializzare NaN/Infinity e non trasformare unknown in false/0. Una metrica V2 non è un errore di dati V1: omettila dallo schema e dichiara le capacità supportate nel manifest.

Per ogni intervallo distingui: tratto osservato nella richiesta, inizio/fine fisici se conosciuti, troncamento sinistro/destro indipendenti, lacune, durata verificata e durata totale se determinabile. Non confondere il bordo della richiesta con un'alba o un tramonto.

## 5. Dati ed effemeridi

Usa soltanto fonti scientifiche ammesse dal registro: NASA/JPL Horizons, NASA Moon Trek, prodotti NASA LRO-LOLA da PDS/PGDA, osservazioni LROC e fonti istituzionali USA indicate nei documenti. QuickMap è facoltativo per consultazione manuale, mai un backend numerico ottenuto tramite scraping. Non aggiungere SPICE/SpiceyPy.

Per V1 usa **Horizons topocentrico diretto**: Sole `COMMAND='10'`, Terra `'399'`, osservatore `CENTER='coord@301'`. La quota deve essere DEM + 2 m rispetto al riferimento corretto, non semplicemente zero. Verifica nella documentazione ufficiale i parametri per azimut/elevazione apparenti senza rifrazione, distanze, diametri e scala temporale. La tabella globale `14,15,19,20` è V2, non un prerequisito di V1.

Verifica contenuto e header, errori applicativi anche con HTTP 200, `$$SOE`/`$$EOE`, unità e copertura. Mantieni richieste/risposte originali con hash e versione del parser. Richieste seriali, cache, timeout e backoff bounded; nessun download massivo non necessario. T non si arrotonda all'ora. L'interpolazione deve gestire wrap angolari ed essere confrontata con query dirette ad istanti intermedi esclusi dall'interpolazione.

Se mancano rete o dati, produci errori/risultati parziali espliciti. I casi sintetici sono consentiti nei test, mai come sostituti silenziosi dei dati reali della demo.

## 6. Terreno e visibilità

Seleziona ritagli DEM numerici adeguati, con terreno vicino e lontano, unità/datum/CRS verificati. Conserva risoluzione effettiva, NoData e informazioni d'incertezza disponibili. Non usare WMTS come quote e non far diventare un DEM grossolano “adatto a 100 m” mediante upsampling.

Calcola la slope adattando un piano in coordinate metriche locali su **supporto circolare di diametro 100 m**. Restituisci gradi e fasce esatte [0,5), [5,10), [10,15), ≥15°. Nessuna esclusione automatica a 10°. Se il supporto è inadeguato, la slope è unknown; non invalidare automaticamente altre metriche indipendenti.

Calcola H(azimut) con curvatura lunare, osservatore 2 m e copertura vicino/lontano. Non assumere terreno assente piatto. I 360 azimut e il passo temporale di un'ora sono iniziali, non precisioni garantite. Verifica campionamento radiale, distanza massima, passo angolare e gestione dei bordi con convergenza; conserva le direzioni non valutabili.

Definisci separatamente elevazione e sull'orizzontale locale, H verso il centro e margine e−H. Integra sull'intero disco e sul profilo irregolare:

- `fSunTerrain`: parte solare non nascosta dal terreno;
- `fSun`: parte solare non nascosta né dal terreno né dalla Terra;
- `fEarth`: parte del disco terrestre non nascosta dal terreno, indipendente dalla fase illuminata.

Per fSun integra l'unione delle occultazioni, non moltiplicare frazioni scalari. Includi eclissi parziali/totali e sovrapposizione con terreno. Terra opaca nel modello iniziale; luce atmosferica/diffusa non modellata dichiarata. Mantieni cause separate e non chiamare “invisibile” un'eclissi solo perché fSun scende a zero.

C3 è frazione ≥0,5. Separa buio diretto completo fSun=0, luce ridotta 0<fSun<0,5 e stato sotto C3. Le tolleranze numeriche devono essere registrate, non mascherate come definizioni fisiche.

## 7. Eventi e confronti

Trova finestre Sole C3, Terra C3, concomitanza, buio completo e intervalli sotto C3. Cerca eventi brevi anche se gli estremi di un passo hanno lo stesso stato; raffina gli attraversamenti e confronta risoluzioni più fitte. Se la configurazione non raggiunge il criterio di convergenza, segnala il risultato come approssimato/non validato con il limite rilevante.

Ricerca limitata alla finestra richiesta e alla copertura reale: niente download automatico illimitato per chiudere ogni evento. Se a T il corpo è noto sotto soglia, il residuo della finestra attiva è 0; se ignoto, null. Se al termine non è osservata l'interruzione, durata totale null e limite inferiore esplicito. Se T è già al buio, l'inizio può restare sconosciuto. Non unire intervalli attraversando dati mancanti.

Confronta valori e finestre degli stessi punti a date diverse e dei diversi punti alla stessa data. Non combinare massimi provenienti da punti diversi. Nessun vincitore globale, punteggio o inferenza di area da punti campionati.

## 8. Cache, CLI e demo

Separa cache terreno e cache delle serie temporali. Le chiavi includono tutti gli input scientifici pertinenti: coordinate/quota/altezza, prodotto e hash DEM, geometria/raggio, intervallo UTC, parametri Horizons, configurazione e versione del calcolo. Il cambio di data riusa il terreno; il cambio di DEM invalida il terreno e i risultati dipendenti. Non riusare risultati parziali come completi.

Aggiungi un comando CLI documentato che legge la configurazione, acquisisce/riusa i dati necessari, esegue V1 e scrive JSON e manifest. Scegli il nome rispettando la CLI corrente e documenta il comando esatto realmente funzionante. Prevedi uso offline con cache completa e errore chiaro con cache insufficiente.

Prepara un esempio riproducibile di due punti e almeno due T, con finestra comune di 30 giorni, scegliendo un periodo coperto dai dati reali. I punti devono appartenere ai poligoni delle due regioni. Non modificarne la posizione per ottenere risultati favorevoli; se proponi un punto diverso per qualità/copertura, registra motivo e coordinate. Misura tempi a cache fredda/calda senza promettere prestazioni non osservate.

## 9. Verifiche obbligatorie

Prima dei confronti salva tolleranze e metriche d'errore per angoli, frazioni, slope ed eventi, giustificandole. Sono scelte numeriche del progetto; non limiti NASA. Non modificarle retroattivamente per far passare le prove senza riportare il cambiamento.

Implementa test significativi per:

- parser Horizons, unità, tempi, errori del servizio, angoli circolari e campioni mancanti;
- piani sintetici e confini esatti 5/10/15°, NoData e supporto insufficiente;
- orizzonte su sfera liscia/ostacoli noti, curvatura, azimut e bordi;
- occultazione nulla/parziale/totale, terreno irregolare e occultatori sovrapposti;
- eventi brevi, lacune, intervalli troncati a entrambi i lati, stato sconosciuto a T;
- schema JSON, determinismo, cache/invalidation e CLI offline.

Esegui i test backend esistenti pertinenti e ruff usando l'ambiente del progetto. Mantieni i test di rete separati dagli offline. Non creare test UI/E2E.

Produci inoltre evidenza su dati reali: interpolazione confrontata con Horizons diretto a tempi indipendenti; slope confrontata con PGDA sullo stesso supporto; convergenza angolare/temporale/radiale; **almeno un riscontro con un'immagine LROC datata** nelle regioni di sviluppo, documentando coordinate, epoca, altezza, risoluzione e scarti. Non trattare una media pluriennale come osservazione istantanea. Confrontare un parser con lo stesso servizio è verifica dell'acquisizione, non validazione indipendente di Horizons.

Se un confronto obbligatorio non è eseguibile, continua ciò che puoi completare e riportalo come gate incompleto. Non dichiarare l'engine interamente validato. Se esiste un prototipo esterno riutilizzabile, ispezionalo; la sua indisponibilità non blocca la costruzione del nucleo.

## 10. Consegna e risposta finale

Consegna codice, configurazioni, schema, test, comandi riproducibili e rapporto Markdown di validazione con: caso/fonte, input/versioni, metrica, tolleranza iniziale, scarto, esito, limite o lavoro restante. Separa errore numerico e incertezza del DEM; quando la seconda non è quantificabile, dichiaralo senza inventare probabilità.

Aggiorna la documentazione tecnica dello stato realmente raggiunto. Non alterare la politica delle fonti o le definizioni scientifiche per adattarle al codice. Niente commit, push o deployment salvo richiesta esplicita.

Nella risposta finale indica cosa funziona, comando demo esatto, test eseguiti con esito, artefatti prodotti e gate eventualmente incompleti. La V1 è completa solo quando tutti gli output e le verifiche obbligatorie sono disponibili; non confondere “codice scritto” con “validazione conclusa”.
