# Regioni di atterraggio in Meowrizon

Questo documento spiega come Meowrizon sceglie **la regione dove atterrare** al polo sud lunare per una data e un'ora, e propone l'elenco di regioni da usare nel programma.

Le parti marcate ⚠️ vanno verificate prima di scriverci codice. La guida tecnica ai dati e alle API è in `docs/guida-dati.md`; criteri, soglie e fonti sono in `docs/piano-logica.md`.

**Aggiornamento del 14/11/2026.** L'elenco usato davvero dal programma è nel catalogo `backend/catalog/` (`regions.toml` e `sites.toml`); il comando `python -m app.cli init-regions` scarica i contorni e crea `data/regions/regions.geojson` e `sites.geojson`. I valori delle sezioni 2, 4.1 e 8 sono allineati a quei file.

---

## 1. In breve

L'utente inserisce **data e ora di atterraggio** (e la durata della missione, di base 6,5 giorni, quella prevista per Artemis III). Il programma risponde con:

1. **le regioni del polo sud ordinate** dalla migliore alla peggiore per quella data;
2. per ogni regione, **quanto spazio buono c'è e per quanto tempo resta buono**;
3. **i motivi**, visibili a schermo, per cui una regione è peggiore o scartata.

Il programma dice **in quale regione conviene atterrare**, non in quale punto preciso dentro la regione: la scelta del punto esatto resta alla missione.

Oltre alle regioni, il programma valuta anche dei **siti di atterraggio**: punti con coordinate precise e una fonte, ognuno valutato come una cella di 100 × 100 m (la precisione di atterraggio richiesta da Artemis III) con gli stessi criteri delle regioni. I siti compaiono in una tabella separata dalla classifica delle regioni, perché un punto e un'area di 400 km² non si confrontano. L'elenco dei siti è ancora da definire.

---

## 2. Settore, regioni e siti

| Livello | Cos'è | Da dove viene | Esempio |
|---|---|---|---|
| **Settore** | La grande area della Luna su cui lavoriamo | Definito da noi sulla base del requisito Artemis III "entro 6° dal polo sud" | Polo sud: a sud di 84°S (`lat_limit` in `regions.toml`) |
| **Regione** | Zona di atterraggio di 16–30 km di lato: è l'oggetto che il programma valuta e ordina | Solo regioni candidate di Artemis III, con il contorno scaricato da Moon Trek | Malapert Massif, de Gerlache Rim 2… |
| **Sito** | Punto preciso, valutato come una cella di 100 × 100 m | Coordinate scritte da noi in `sites.toml`, sempre con una fonte | Da definire |

Per ora c'è **un solo settore**: il polo sud, dove la challenge si concentra e dove scelta del luogo e della data contano davvero. Il programma va però pensato con un elenco di settori, per poterne aggiungere altri in futuro.

---

## 3. Perché una regione non si valuta "in blocco"

Una regione è larga 16–30 km. Al polo sud, in quello spazio convivono:

- creste illuminate per giorni;
- pendii in ombra;
- fondi di piccoli crateri che non vedono mai il Sole.

Frasi come "la regione è illuminata" o "da qui si vede la Terra" sono quindi vere solo per una parte della regione. Per lo stesso motivo **non si usa il centro della regione**: è un punto qualsiasi, che può cadere in un piccolo cratere in ombra e far sembrare pessima una regione con ottime zone a 2 km di distanza.

Per questo, **dietro le quinte**, la regione si divide in celle. Le celle servono solo a misurare: non vengono mostrate come punti e non diventano siti.

---

## 4. Come si valuta una regione

### 4.1 La griglia interna (nascosta)

1. La regione si copre con **celle di 100 m**, la base su cui la NASA misura la pendenza di atterraggio e la precisione di atterraggio richiesta. Le regioni sono quadrati con gli angoli su multipli di 100 m, quindi la griglia combacia con i bordi: 160 × 160 celle per una regione di 16 km, 298 × 298 per Haworth, **circa 515.000 per tutte e 13**.
2. Per ogni cella si calcola **una volta sola** la maschera d'orizzonte: per ogni direzione, quanto è alto il terreno visto da lì. Il terreno non cambia, quindi la maschera vale per qualsiasi data, passata o futura.
3. Per la data scelta si prendono le posizioni di Sole e Terra durante la missione e si confrontano con le maschere: per ogni cella si sa quando vede il Sole e quando vede la Terra.
4. Ogni cella riceve un punteggio interno (vedi sezione 5). L'utente non lo vede cella per cella: lo vede come **colore sulla regione**.

### 4.2 Cosa si mostra della regione

| Valore | Come si calcola | Cosa dice |
|---|---|---|
| **Area buona** (km²) | Somma delle celle che rispettano i vincoli e hanno un punteggio alto (ad esempio sopra 70) | Quanto spazio adatto c'è in tutta la regione |
| **Zona continua più grande** (km²) | La più grande macchia di celle buone attaccate tra loro | **Il valore più importante.** 3 km² sparsi in tanti pezzetti non sono un posto dove atterrare; 1 km² tutto in un pezzo sì |
| **Qualità della zona** | Valori tipici delle celle della zona più grande: giorni di luce, % di tempo con la Terra visibile, pendenza | Quanto si sta bene, non solo quanto spazio c'è |
| **Durata** | Per quanto tempo, da quella data, la zona più grande resta sopra una soglia (ad esempio 1 km²) | Quanto vale la finestra: ore o giorni |
| **Tolleranza ai ritardi** | Quanta area buona resta spostando la data di ±1, 2, 3 giorni | Se la regione regge uno slittamento del lancio |

Un lander non atterra mai esattamente nel punto previsto: c'è sempre un margine d'errore di decine o centinaia di metri. IM-2, ad esempio, ha toccato il suolo a circa 250 m dal punto previsto ed è finito inclinato. Per questo conta la zona continua, non la somma.

### 4.3 La classifica

Le regioni si ordinano combinando, in quest'ordine di importanza:

1. **zona continua più grande**;
2. **qualità della zona**;
3. **tolleranza ai ritardi**.

Una regione è **scartata** se la zona continua più grande è sotto una soglia minima (ad esempio 0,5 km²). I pesi esatti si regolano provando il programma.

### 4.4 Cosa si calcola prima e cosa al momento

| Quando | Cosa | Perché |
|---|---|---|
| **Una volta, prima della demo** (script offline) | Terreno scaricato e **maschera d'orizzonte di ogni cella** | È il calcolo più pesante. ⚠️ Il tempo va misurato: se è troppo, si parte con poche regioni |
| **A ogni richiesta** (pochi secondi) | Posizioni di Sole e Terra nella finestra di missione, confronto con tutte le maschere, valori della sezione 4.2, classifica | Sono confronti numerici semplici su dati già pronti |

Sole e Terra sono così lontani che, a un dato istante, la loro **direzione** è quasi la stessa in tutta la regione: basta una riga della tabella di Horizons per regione e per istante. Va però corretta l'**elevazione** cella per cella: 20 km sulla Luna valgono circa 0,7° di curvatura, e al polo il Sole sta spesso a 1–2° sopra l'orizzonte.

---

## 5. I criteri, in sintesi

Missione generica: lander solare che comunica direttamente con la Terra, per una durata di default di 6,5 giorni dopo l'atterraggio (durata prevista di Artemis III, modificabile). Soglie e fonti sono in `docs/piano-logica.md`, sezione 4; questa sezione è un riassunto della prima proposta.

**Vincoli per ogni cella** (una cella che non li rispetta non è "buona"):

- Sole visibile sopra l'orizzonte reale al momento dell'atterraggio;
- Terra visibile sopra l'orizzonte reale, con un margine di circa 2°;
- fuori dalle zone sempre in ombra (layer `PSR_SP` di Moon Trek);
- pendenza sotto una soglia, ad esempio 10°.

**Punteggio interno della cella** (0–100, pesi di partenza da regolare):

| Gruppo | Peso | Criteri |
|---|---|---|
| Energia | 45 | Tempo al tramonto del Sole, % di luce, notte più lunga |
| Comunicazione | 35 | Tempo al tramonto della Terra, % di tempo con la Terra visibile |
| Terreno | 20 | Pendenza, margine del Sole sopra le creste |

La tolleranza ai ritardi non è più nel punteggio della cella: si misura a livello di regione (sezione 4.2).

**Esempi di motivi di scarto da mostrare per una regione:**

- "Terra sotto l'orizzonte in tutta la regione all'atterraggio";
- "Sole e Terra insieme solo su 0,3 km²";
- "Area buona per sole 6 ore";
- "Con 2 giorni di ritardo l'area buona scende da 8 a 1 km²";
- "Zona buona frammentata: il pezzo più grande è 0,2 km²".

**Limite da dichiarare:** il terreno a 5 m non vede massi e piccoli crateri. "Migliore" vuol dire migliore per luce, comunicazione e pendenza, non sicura al 100%.

---

## 6. Il ruolo dei crateri

Con questo modello **non serve definire la forma dei crateri**. Le regioni Artemis sono già bordi e creste di crateri (Shackleton, de Gerlache, Faustini, Haworth, Nobile, Amundsen). I crateri servono a due cose:

- **nomi sulla mappa**, per orientarsi e riconoscere le regioni;
- **esclusione dei fondi in ombra permanente**, già coperta dal layer `PSR_SP` di Moon Trek.

Servirebbe definire i crateri solo se si volessero regioni diverse da quelle Artemis, per esempio un anello attorno al bordo di un cratere preso dall'elenco ufficiale dei nomi lunari della IAU (centro e diametro). Per ora non serve: le regioni Artemis sono ufficiali e i poligoni si scaricano già pronti.

---

## 7. Come lo usa una persona: uno scenario

**Chi:** un'ingegnera che prepara un lander robotico per il polo sud.

**Situazione:** l'atterraggio era previsto per il 12 marzo, ma un ritardo lo sposta al 26 marzo. Deve capire in fretta in quale regione conviene atterrare nella nuova data.

1. **Vista della Luna.** Globo 3D con il settore del polo sud evidenziato. Data e ora sono in alto, sempre visibili: inserisce 26 marzo, 14:00 UTC, missione di 6,5 giorni.
2. **Vista del settore.** Clicca sul polo sud e la vista si avvicina. Le regioni sono colorate per punteggio (verde buona, giallo accettabile, grigio scartata); a fianco c'è la classifica (numeri inventati, solo per mostrare il formato):
   - 1° **Malapert Massif**: zona continua di 6 km², 9 giorni di luce, Terra visibile per il 90% del tempo, regge ±3 giorni;
   - 2° **Connecting Ridge**: zona continua di 4 km², 11 giorni di luce, Terra visibile per il 70%, con 3 giorni di ritardo scende a 0,5 km²;
   - scartata **Haworth**: il 26 marzo la Terra è sotto l'orizzonte in tutta la regione al momento dell'atterraggio.
3. **Vista della regione.** Clicca su Malapert Massif e vede:
   - la regione colorata, con le zone buone in verde e quelle scartate in grigio, ognuna con il motivo (ombra, Terra nascosta, pendenza);
   - un grafico dell'area buona ora per ora durante la missione;
   - Sole e Terra in cielo nel tempo;
   - contatori "l'area buona si dimezza tra…" e "la Terra tramonta su metà regione tra…".
4. **Prova di un altro ritardo.** Sposta la data di 3 giorni: Connecting Ridge crolla (il Sole va dietro una cresta), Malapert regge. Sceglie Malapert Massif.

Facoltativo, per la demo: una vista a 360° dell'orizzonte presa al centro della zona più grande, segnata come "illustrativa". Mostra bene Sole e Terra rispetto al terreno, che è il cuore della challenge, senza trasformare quel punto in un sito consigliato.

Senza il programma avrebbe dovuto interrogare Horizons punto per punto e incrociare a mano i dati di QuickMap e Moon Trek: giorni di lavoro invece di minuti.

---

## 8. Le regioni

### 8.1 Da dove vengono

Le regioni **non si calcolano**: sono le **regioni candidate di Artemis III** che la NASA ha indicato per il primo atterraggio con equipaggio. Moon Trek le fornisce come poligoni:

```text
https://trek.nasa.gov/moon/trekarcgis2/rest/services/A3_Named_regions_SP/MapServer/0/query?where=1%3D1&outFields=label&returnGeometry=true&f=json
```

- La risposta (circa 4 KB) contiene, per ogni regione, il nome (`label`) e i vertici del poligono.
- I vertici sono in **metri, nella proiezione stereografica polare sud** (`Moon2000_spole`, sfera di raggio 1 737 400 m). Ogni regione è un **quadrato con gli angoli su multipli di 100 m**.
- Si convertono in latitudine e longitudine con `pyproj`: verificato contro la formula della stereografica scritta a mano.
- Con `f=geojson` il servizio rifiuta il sistema di riferimento lunare: va usato `f=json` e convertito noi.
- Su Moon Trek una regione si chiama "Peak Near Shakleton" (senza la "c"): il catalogo tiene separati il nome corretto e l'etichetta esatta.
- Il layer contiene **13 regioni, la lista NASA del 2022**. Nel 2024 la NASA ha ridotto la lista a **9 regioni**: Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1, Nobile Rim 2, de Gerlache Rim 2 e Slater Plain. Cinque sono anche nella lista 2022; per le altre quattro la NASA non ha pubblicato i contorni, quindi restano nel catalogo come "senza poligono" e non si possono valutare.

### 8.2 Le 13 regioni candidate di Artemis III (dal layer di Moon Trek)

Valori prodotti da `init-regions` il 14/11/2026.

- **Centro:** centro geometrico del quadrato calcolato in metri e poi convertito. Una versione precedente di questa tabella faceva la media di latitudini e longitudini dei vertici, che vicino al polo sposta il risultato fino a quasi 8° di longitudine (Connecting Ridge).
- **Area:** misurata sulla sfera, perché la stereografica non conserva le aree.
- **DEM:** il DEM LOLA polare della PDS più fine che copre per intero la regione. La copertura è ricavata dalle etichette PDS: ±75,84 km dal polo per `ldem_875s_5m`, ±151,68 km per `ldem_85s_10m`, ±304 km per `ldem_80s_20m`.

| Regione | Liste | Centro (lat, lon E) | Lato | Area | Celle da 100 m | DEM |
|---|---|---|---|---|---|---|
| Connecting Ridge | 2022 | −89,46°, 222,51° | 16 km | 256,0 km² | 160 × 160 | `ldem_875s_5m` |
| Connecting Ridge Extension | 2022 | −89,03°, 258,00° | 20 km | 399,9 km² | 200 × 200 | `ldem_875s_5m` |
| Peak Near Shackleton | 2022 | −88,81°, 123,69° | 16 km | 255,9 km² | 160 × 160 | `ldem_875s_5m` |
| de Gerlache Rim 1 | 2022 | −88,68°, 292,07° | 16 km | 255,9 km² | 160 × 160 | `ldem_875s_5m` |
| **de Gerlache Rim 2** | 2022, 2024 | −88,23°, 295,37° | 20 km | 399,8 km² | 200 × 200 | `ldem_875s_5m` |
| Faustini Rim A | 2022 | −87,89°, 90,00° | 20 km | 399,7 km² | 200 × 200 | `ldem_875s_5m` |
| **Haworth** | 2022, 2024 | −86,76°, 337,22° | 29,8 km | 886,6 km² | 298 × 298 | `ldem_85s_10m` |
| **Malapert Massif** | 2022, 2024 | −85,99°, 359,76° | 21 km | 439,9 km² | 210 × 210 | `ldem_85s_10m` |
| de Gerlache-Kocher Massif | 2022 | −85,83°, 243,68° | 20 km | 398,9 km² | 200 × 200 | `ldem_85s_10m` |
| **Nobile Rim 1** | 2022, 2024 | −85,44°, 37,37° | 20 km | 398,7 km² | 200 × 200 | `ldem_85s_10m` |
| Leibnitz Beta Plateau | 2022 | −85,43°, 31,74° | 16 km | 255,2 km² | 160 × 160 | `ldem_85s_10m` |
| Amundsen Rim | 2022 | −84,23°, 69,44° | 20 km | 398,0 km² | 200 × 200 | `ldem_80s_20m` |
| **Nobile Rim 2** | 2022, 2024 | −83,95°, 58,82° | 20 km | 397,8 km² | 200 × 200 | `ldem_80s_20m` |

In grassetto le regioni presenti anche nella lista 2024. Nobile Rim 2 ha il centro poco a nord di 84°S, ma una parte sta nel settore: si tiene intera.

### 8.3 Regioni consigliate per partire

Nel catalogo sono attive (`active = true`) due regioni presenti in entrambe le liste NASA:

- **de Gerlache Rim 2** (88,2°S): coperta per intero dal DEM a 5 m del polo; la sua parte a sud di 88°S è dentro la mappa di illuminazione LROC, quindi validabile con immagini reali;
- **Malapert Massif** (86,0°S): rilievo esteso, condizioni di luce e di Terra diverse dalla prima.

Connecting Ridge, proposta in una prima versione, non è più nella lista 2024. Due regioni con comportamenti diversi bastano a far vedere che la classifica cambia con la data. Le altre si attivano nel catalogo quando la pipeline funziona.

### 8.4 Siti di atterraggio (da definire)

Ogni sito si aggiunge a `backend/catalog/sites.toml` con:

- nome e coordinate planetocentriche in gradi decimali, nel sistema Mean Earth;
- tipo: atterrato, previsto o personalizzato;
- **fonte obbligatoria**.

Il comando `init-regions`:

- rifiuta un sito senza fonte o fuori dal settore;
- lo converte in metri;
- dice in quale regione Artemis cade (se cade in una);
- sceglie il DEM che lo copre.

Candidati possibili, da confermare:

| Sito | Coordinate | Fonte | Nota |
|---|---|---|---|
| IM-2 (Athena), punto previsto | 84,78°S, 29,13°E | LROC | Ha toccato il suolo a ~250 m dal punto previsto ed è finito inclinato. Non cade in nessuna regione Artemis con contorno |
| IM-1 (Odysseus) | 80,13°S, 1,44°E | Catalogo Moon Trek | Fuori dal settore a 84°S: con il confine attuale il catalogo lo rifiuta |

---

## 9. Cosa resta da decidere

- **Regioni attive.** Quali delle 13 con contorno attivare oltre alle due di sviluppo.
- **Confine del settore.** Nel catalogo è 84°S (requisito Artemis III); con 80°S si potrebbero inserire siti come IM-1.
- **Siti di atterraggio.** Quali inserire, ognuno con la sua fonte.
- **Griglia delle maschere d'orizzonte.** Le celle sono da 100 m; se il calcolo delle maschere è troppo lento, le maschere si calcolano su una griglia più larga. Si decide dopo aver misurato i tempi.
- **Soglie.** Punteggio minimo di una cella buona, zona continua minima per non scartare una regione, pendenza massima, margine minimo della Terra.
- **Pesi** del punteggio della cella e della classifica delle regioni.

---

## Fonti

- NASA Space Apps Challenge 2026, Lunar Landing Site Navigator: https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- Moon Trek, layer "Artemis III Candidate Landing Regions" (`A3_Named_regions_SP`) e catalogo dei prodotti: https://trek.nasa.gov/moon/
- LROC, IM-2 Landing Region: https://www.lroc.asu.edu/images/1401
- Annuncio delle 13 regioni (2022): https://www.collectspace.com/news/news-081922a-artemis-iii-moon-landing-regions.html
- Aggiornamento a 9 regioni (28 ottobre 2024): https://www.upi.com/Science_News/2024/10/28/nasa-artemis-moon-landing-regions/5971730152372/ e https://www.scientificamerican.com/article/nasa-unveils-candidate-landing-sites-for-artemis-astronauts/
- Requisiti di atterraggio Artemis III (6° dal polo, pendenza su 100 m, precisione 100 m): L. Ortiz, NASA, *Artemis Human Landing System Overview*, Space Apps Challenge 2025, NTRS 20250009323
- DEM LOLA polari ed etichette PDS: https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
