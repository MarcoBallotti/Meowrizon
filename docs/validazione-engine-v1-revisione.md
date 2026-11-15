# Revisione della validazione V1 — 15 novembre 2026

**Esito: validazione V1 incompleta.** Le verifiche numeriche della configurazione raffinata sono superate; il riferimento osservativo indipendente luce/ombra resta da completare. Nessuna tolleranza è stata allargata e nessuna approvazione NASA è implicata.

Questo rapporto integra, senza cancellarlo, il [rapporto storico](validazione-engine-v1.md). I campioni PGDA e le sei scene LROC preesistenti sono mantenuti; non sono stati selezionati campioni in base agli errori per migliorare gli esiti.

## 1. Riproducibilità e stato del repository

Commit di base `234cd7838f069627289e05d3b7de0403ca5b6f8c`, checkout con modifiche non committate e conflitti di merge già presenti prima della revisione. Il commit da solo **non** identifica il codice eseguito: le impronte dei file sono negli artefatti della revisione.

Il file `backend/config/analysis.tolerances.json` conserva SHA-256:

```text
e1292735b88228a833b5ca4401618ae59c54e8633ab4b6ebbb719615aabe3e2a
```

Le evidenze sono sotto `backend/data/analysis/validation/`, ignorate da Git; per rigenerarle usare gli script versionati. Copie dei precedenti JSON e delle griglie LROC sono in `review-20261115/previous-*`. I nuovi rapporti JSON hanno nomi UTC distinti e non sovrascrivono quelli esistenti.

### Suite e filesystem

- Esecuzione iniziale sul bind mount macOS: **177/178** test superati, fallimento del test di lock già segnalato nel rapporto storico.
- Codice e test dello storage corrispondono a HEAD: nessuna modifica dell'engine in quei file. Il test di lock su HEAD estratto nel filesystem nativo Docker passa.
- Diagnostica del lock: sul filesystem nativo due descrittori nello stesso processo e un secondo processo vengono bloccati; sul bind mount si osservano semantiche differenti. Anche un tentativo di rendere il test esplicitamente multiprocesso non risolve uniformemente il comportamento sul mount. Quel tentativo è stato **ritirato**, conservando il test originale.
- Una corsa intermedia sul mount ha inoltre mostrato un `FileNotFoundError` leggendo un job mentre veniva aggiornato. Non viene nascosto né attribuito senza prova all'engine.
- Suite finale sul filesystem nativo del container, con sorgenti copiati e test originali invariati dove non aggiunti per questa revisione: **184/184** superati, un test di rete escluso dalla configurazione preesistente. Include **99 test dell'engine**.
- Non è dimostrata l'affidabilità della concorrenza sul bind mount macOS. Non eseguire più scrittori concorrenti su quel volume assumendo che il successo nativo certifichi il mount; un approfondimento del deployment/filesystem rimane separato dalla validazione scientifica.

Artefatti: `review-20261115/tests-native.xml`, `tests-native.txt`, `tests-final.xml` (corsa intermedia con fallimenti), `baseline-lock-test.txt`. Il lint dei file della revisione è superato; non viene dichiarato pulito l'intero repository in conflitto.

### Cache

Due esecuzioni reali offline con HTTP esplicitamente proibito producono lo stesso SHA-256 del risultato:

```text
f85cd8033f3a9292352fe801be83f8320cdd13ebe37d80ba34393e8915bee38d
```

Prima corsa: terreno già in cache, sei serie ricalcolate in circa 11,3 s. Seconda: tutte le serie in cache, circa 0,9 s. Nessun download. Sono misure locali, non una garanzia di prestazioni. I test verificano invalidazione per DEM, parametri e versione dell'algoritmo, oltre a cache mancante/corrotta e offline. Non è stata ripetuta la misura di 340 s con tutti i download da zero.

## 2. Classificazione della pendenza

Le regole restano `[0,5)`, `[5,10)`, `[10,15)`, `≥15°`, senza esclusione a 10°. Il fit sintetico e i confini esatti sono coperti dai test. Il confronto reale conserva 121 nodi PGDA per regione, scala e supporto dichiarati nel rapporto storico.

| Regione | Accordo di fascia | Errori adiacenti | Errori non adiacenti | Scarto mediano / P95 |
|---|---:|---:|---:|---:|
| de Gerlache Rim 2 | 105/121 = 86,78% | 16 | 0 | 0,754° / 2,688° |
| Malapert Massif | 118/121 = 97,52% | 3 | 0 | 0,089° / 0,320° |

Matrici: righe = fascia PGDA, colonne = fascia engine, nell'ordine 0–5 / 5–10 / 10–15 / ≥15°.

```text
de Gerlache                 Malapert
 0   0   0   0              25   2   0   0
 0  14   3   0               1  89   0   0
 0   3  86   2               0   0   4   0
 0   0   8   5               0   0   0   0
```

**Limiti rilevanti:** a de Gerlache la fascia PGDA ≥15° viene riconosciuta in soli 5/13 casi (38,46%); la fascia <5° è assente. A Malapert ≥15° è assente e 10–15° ha solo quattro campioni. Non si può estendere l'accordo globale a tutte le classi o a tutta la regione. Il vicinato spaziale non costituisce 121 osservazioni indipendenti.

Le tre discordie di Malapert sono entro 0,018° dalla soglia di 5° nel riferimento. A de Gerlache alcune discordie sono lontane oltre 2° dalla soglia: non sono tutte semplici arrotondamenti. Le distanze di ogni discordanza sono conservate nel JSON, senza introdurre una nuova soglia arbitraria di “vicinanza”.

Il gate in gradi resta superato con le tolleranze originali, ma la matrice rende visibile ciò che quel gate non dimostra. PGDA e engine usano prodotti diversi a de Gerlache e dati in parte condivisi a Malapert: questo confronto non isola l'errore dell'algoritmo e non è una verità al suolo indipendente. La sensibilità numerica dei due punti demo, già presente, non equivale all'incertezza fisica del DEM né a intervalli di confidenza delle classi.

[NASA PGDA prodotto 90](https://pgda.gsfc.nasa.gov/products/90) distribuisce layer di errore per i propri DEM adjusted e slope. Non è corretto trasferirli al DEM Moon Trek v04 usato qui o al fit su supporto 100 m senza dimostrarne la corrispondenza. L'incertezza fisica dei risultati correnti rimane non quantificata; non si conclude che NASA non offra dati di incertezza in generale.

## 3. Luce/ombra osservata

Il benchmark Otsu v1 resta **fallito in tutte e sei le scene**: accordo 79,6–87,2%, inferiore a 90%. Nuove diagnostiche sullo stesso riferimento danno balanced accuracy circa 0,503–0,519: l'accordo globale nasconde un forte sbilanciamento. Questi valori descrivono l'accordo con le etichette Otsu, **non** l'accuratezza rispetto a ombre indipendentemente accertate.

È stato redatto il [protocollo LROC v2](protocollo-validazione-lroc-v2.md), mantenendo ≥0,90 e separando sviluppo da verifica. In `review-20261115/annotation/` sono disponibili sei CSV georeferenziati e viste SVG delle sole osservazioni, senza previsioni, con tutte le etichette inizialmente non annotate. Le classi 0/1 non sono state inventate. Le griglie sparse non sono maschere dense sufficienti a misurare bordi d'ombra in metri.

La ricerca di ulteriori scene e le esclusioni sono nel protocollo. Il mosaico de Gerlache combina molte epoche e non può essere confrontato usando un solo istante; Malapert A è fuori regione; il prodotto ESALL_MP1 ha elaborazione DLR e non è stato assunto equivalente a un prodotto di fonte USA. Questi risultati non dimostrano che altri dati adatti non esistano.

**Blocco residuo concreto:** mancano una nuova scena georeferenziata idonea con ombre estese e un riferimento luce/ombra rivisto indipendentemente. Servono identificazione dei segmenti/ortorettifica e annotazione controllata prima di misurare i nuovi accordi e bordi. Le sei scene già analizzate restano sviluppo. Un risultato su una sola regione non validerebbe automaticamente l'altra. Nessun gate nuovo viene dichiarato superato.

## 4. Transizione radente e convergenza

Caso: Malapert, finestra di 30 giorni dal 1 febbraio 2027, stessa effemeride, integrazione del disco e terreno; varia solo il passo azimutale.

| Passo azimutale | Spostamento massimo rispetto al passo precedente | Numero transizioni confrontate |
|---|---:|---:|
| 0,125° | riferimento storico | 18 |
| 0,0625° | 337,500 s | 18 |
| 0,03125° | 45,937 s | 18 |
| 0,015625° | 22,500 s | 18 |

Il massimo della tabella è preso su tutte le 18 transizioni, non necessariamente sullo stesso evento. L’evento originariamente fuori tolleranza è l’inizio del sesto intervallo di buio, il **10 febbraio 2027**: 05:36:03,281 UTC a 0,125°; 05:30:25,781 UTC a 0,0625° e 0,03125°; 05:30:24,844 UTC a 0,015625°. Gli ulteriori massimi di 45,937 e 22,500 s riguardano altri confini.

La scala è in `review-20261115/azimuth-ladder.json`, con tutti gli intervalli di buio e i tempi di calcolo. Non è stato modificato il limite di **60 s**. La demo usa ora **0,03125°** e il confronto di raffinamento usa **0,015625°**. La configurazione è più precisa, non più permissiva. Il default generico del modello rimane 0,125°: questi esiti riguardano la configurazione demo esplicita.

Su sei scenari, cinque varianti per scenario (azimut, passo radiale, strisce del disco, scansione temporale, passo delle effemeridi), lo spostamento massimo riscontrato è **26,25 s**. Sono controllati anche numero e tipo dei confini degli intervalli: un numero uguale di transizioni con diversa topologia non conta come convergenza. Le frazioni restano entro 0,01. Le eclissi di marzo 2025 rimangono geometricamente coerenti ai due punti; non è una verifica indipendente completa degli orari di contatto NASA.

La convergenza rispetto a un DEM fissato non garantisce precisione fisica di 26 s. L'errore del terreno, la risoluzione effettiva e i passaggi radenti restano limiti. Il confronto del raggio esterno 300/225 km verifica solo quei raggi: non dimostra da solo l'assenza di ostacoli oltre 300 km.

## 5. Modifiche e riproduzione

- Configurazione demo: passo azimutale 0,125° → 0,03125°.
- Validazione: matrici per fascia, campioni PGDA e distanze dalle soglie, lettura mascherata dei NoData; metriche luce/ombra per classe.
- Gate completi: un controllo omesso/incompleto non è un successo, eclissi e allineamento partecipano all'esito; confronto degli eventi controlla anche i tipi di confine.
- Evidenze JSON con nomi distinti, rifiuto di sovrascrittura e rifiuto di NaN/Infinity.
- Test aggiunti per queste proprietà e per l'invalidazione delle cache al cambio di versione; nessuna modifica della soglia di classificazione o del file di tolleranze.
- Script riproducibili e pacchetto di revisione osservativa. Nessuna modifica frontend, nessun test UI/E2E, nessun commit/push.

Dalla radice del repository:

```sh
docker compose run --rm --no-deps backend python -m scripts.review_validation
docker compose run --rm --no-deps backend python -m scripts.review_tests_native
docker compose run --rm --no-deps backend python -m scripts.review_cache
```

Il primo comando registra manifest, hash del codice, configurazione e versioni dei pacchetti, e verifica l'invarianza dei sorgenti durante l'esecuzione. La CLI `validate-engine` restituisce 4 se la validazione completa non è superata, anche se un sottoinsieme richiesto con `--check` passa. Lo script di revisione salva le evidenze e il loro esito: l'assenza di eccezioni di esecuzione non è una certificazione scientifica.

## 6. Esito conclusivo e ambito

Esecuzione conclusiva: `20261115T051605-067665Z`, durata 385,5 s. Evidenza: `backend/data/analysis/validation/evidence-review-20261115T051605-067665Z.json`. `code_unchanged_during_run=true`: gli hash dei sorgenti/configurazioni/test sono identici a inizio e fine. Manifest iniziale in `review-20261115/manifest-20261115T051605-067665Z.json`; ambiente completo in `review-20261115/environment.json`.

| Gate | Esito finale | Evidenza |
|---|---|---|
| Suite backend nel filesystem nativo | superato | 184 test, di cui 99 engine |
| Suite sul bind mount macOS | non superato | anomalie di lock e, in una corsa, lettura job |
| Effemeridi/interpolazione | superato | confronto con campioni Horizons intermedi |
| Pendenza, scarti in gradi | superato | tolleranze originali; matrici e limiti per fascia conservati |
| Orizzonte e convergenza degli scenari | superato | nessuna variazione di topologia; eventi ≤26,25 s contro 60 s |
| Allineamento DEM | superato | differenze nulle nei blocchi confrontati |
| Eclissi, coerenza geometrica interna | superato | entrambi i punti; non validazione indipendente degli orari |
| LROC Otsu v1 | fallito | 0/6 scene sopra il criterio ≥0,90 |
| Nuovo benchmark LROC indipendente | incompleto | nuove scene e annotazioni controllate mancanti |
| Incertezza fisica del terreno | incompleto | non quantificata per i prodotti/metriche correnti |

Il JSON finale riporta **100 controlli numerici superati su 100**, e separatamente il fallimento LROC; `summary.status` è **incomplete**. Le diagnostiche di classificazione non introducono nuove tolleranze e non certificano tutte le fasce.


La configurazione verificata riguarda i due punti demo, tre date (1 e 4 dicembre 2026, 1 febbraio 2027), finestre di 30 giorni e i prodotti dichiarati; il confronto eclissi usa marzo 2025. Non prova una validità universale per qualsiasi punto, data o DEM.

**Formulazione sostenibile:** engine V1 implementato e riproducibile, con controlli numerici superati nella configurazione documentata e limiti di classificazione misurati. Validazione osservativa indipendente ancora incompleta; incertezza fisica del terreno non quantificata. L'origine NASA dei dati non costituisce approvazione del risultato.
