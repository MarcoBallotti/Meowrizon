# Stato del progetto: prima versione approvata

> **Stato effettivo dopo implementazione e revisione (15/11/2026):** engine puntuale V1 implementato; validazione osservativa ancora incompleta. Il [rapporto della revisione](validazione-engine-v1-revisione.md) documenta test, convergenza, classificazione e limiti. Le affermazioni storiche di engine non implementato non descrivono lo stato corrente. In questo branch i documenti scientifici seguono il perimetro V1 approvato.

Aggiornato il 15/11/2026 dopo l'adozione del perimetro minimo. Questa revisione è documentale: **nessuna implementazione dell'engine**. Riferimenti normativi: [criteri](criteri-algoritmo.md), [piano](piano-logica.md), [fonti](fonti-e-perimetro-challenge.md). Il [prompt per Claude](prompt-claude-engine-v1.md) descrive l'incarico futuro.

## 1. Decisioni V1

| Tema | Decisione |
|---|---|
| Oggetto | 2–3 punti identificati nelle regioni de Gerlache Rim 2 e Malapert Massif; almeno uno per regione, senza inferenze sull'intera area |
| Date | Esplicite; almeno due nella demo, stessa durata di analisi. Nessuna scansione automatica ±3 giorni |
| Tempo | T esatto UTC, finestra [T,T+durata), demo 30 giorni. Durata di analisi distinta dalla durata di una missione |
| Effemeridi | JPL Horizons topocentrico diretto per Sole e Terra; quota DEM + 2 m, datum/tempi/correzioni verificati |
| Terreno | DEM numerici NASA LRO-LOLA da Moon Trek/PDS/PGDA; qualità e copertura obbligatorie |
| Altezza | 2 m sopra DEM nel profilo V1; altre altezze del vecchio client non sono automaticamente supportate |
| Orizzonte | Curvatura e terreno vicino/lontano; 360 azimut iniziali, configurazione finale da convergenza |
| Dischi | fSunTerrain, fSun dopo terreno ed eclissi, fEarth indipendente dalla fase illuminata |
| C3 | Frazione ≥0,5 per Sole e Terra, convenzione del team; nessuna garanzia radio o energetica |
| Buio | fSun=0 distinto da 0<fSun<0,5; cause eclissi/terreno conservate |
| Pendenza | Fit circolare diametro 100 m; fasce [0,5), [5,10), [10,15), ≥15°. Nessun filtro automatico a 10° |
| Eventi | Finestre Sole/Terra/concomitanza, buio e sotto soglia; confini osservati distinti da troncamento e lacune |
| Dati mancanti | Null, stato e motivo per metrica; nessun falso zero, assenza di terreno non trattata come piano |
| Confronto | Valori e finestre degli stessi punti/date, senza punteggio o vincitore universale |
| Consegna tecnica | Libreria Python, CLI, schema JSON versionato, cache, configurazioni e rapporto di validazione |
| Integrazione | HTTP e frontend dopo la verifica del nucleo; la visualizzazione resta parte della consegna finale della challenge |

## 2. Rinviato a V2

- Scansione delle 13 regioni storiche e analisi dei 16 siti globali; i cataloghi esistenti si conservano.
- Griglia regionale 100 × 100 m, B(T) regionale, A5/A10/A15, percentuali di area e componenti a 4 vicini.
- P50 annuale, indicatore ≥80% e benchmark pluriennali.
- Scansione ±1/2/3 giorni, alternative regionali e intersezioni delle stesse celle.
- Estensione automatica della ricerca degli eventi oltre la finestra richiesta.
- Ricostruzione delle effemeridi locali da tabella geocentrica globale.
- Agente AI, CAD, news e cataloghi educativi estesi.

VIPER 50 ore e Gläser 92,27% sono riferimenti documentali, non output principali o limiti del mezzo generico. Le formule V2 restano definite nei criteri, ma non sono condizioni di completamento V1.

## 3. Fuori perimetro

Modelli termici hardware, potenza/autonomia/batterie, link budget e relay, sicurezza/percorribilità universale, lancio/trasferimento/discesa, replay missioni, percorsi verso PSR e stime di ghiaccio. Nessuno score globale ora o come implicita estensione V2.

## 4. Cosa esiste e cosa manca

Sono presenti FastAPI, acquisizione/preparazione su file, cataloghi, poligoni, CLI e test infrastrutturali. Gli endpoint scientifici e il nucleo V1 non sono implementati da questa revisione. Il vecchio client ha modelli dimostrativi che non definiscono la nuova scienza.

Restano da realizzare: schema scientifico interno, configurazione dei punti/date reali, scelta dei DEM adeguati, adapter topocentrico, orizzonte/slope, dischi/eclissi, eventi, confronto, caching scientifico, CLI e rapporto. Le tolleranze si fissano prima dei confronti e si verificano con convergenza. Non serve attendere un prototipo esterno per iniziare.

## 5. Completamento e limiti

V1 richiede test analitici e d'integrazione backend, verifica parser/unità/interpolazione Horizons, confronto slope PGDA compatibile, convergenza e almeno un riscontro osservativo LROC datato. Se manca un gate, si consegna lo stato raggiunto dichiarando la validazione incompleta; non si inventano dati o test. Nessun test UI, simulatore o E2E richiesto.

La procedura CLI deve riprodurre la demo con fonti e versioni note, riusare cache valida e indicare chiaramente copertura parziale, intervalli troncati e incertezza. Non presentare metadati NASA come approvazione NASA del progetto.
