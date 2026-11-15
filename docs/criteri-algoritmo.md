# Criteri dell'algoritmo di valutazione

Decisi dal team il **15/11/2026**. Questo documento raccoglie in un posto solo **tutti i criteri** dell'algoritmo e il **perché** di ogni scelta. È la base da cui si scrive il codice.

Il programma risponde a una domanda:

> **Se atterro in un certo istante T, quali regioni del polo sud sono le migliori, e perché?**

Ogni soglia ha una fonte, indicata come [F…] e elencata in fondo. Quello che non ha una fonte è marcato **Scelta del team**. Il piano completo è in `docs/piano-logica.md`, mentre il riepilogo di tutte le decisioni del progetto è in `docs/stato-decisioni.md`.

---

## 1. Principi

| Principio | Perché |
|---|---|
| **Niente profili di missione** (lander robotico, equipaggio…). Il programma **misura e colora**, e ogni colore ha come riferimento una soglia NASA | Veicoli diversi hanno limiti diversi: un profilo inventato sarebbe meno affidabile di misure chiare con riferimenti dichiarati. Il giudizio finale resta all'utente |
| **Niente valori fissi per Sole e Terra**: le elevazioni si calcolano ogni ora, per ogni punto, dalle effemeridi Horizons in UTC [F5] | Al polo sud Sole e Terra stanno a pochi gradi sull'orizzonte (2–7° [F1]) e cambiano molto con il punto e la data. Un intervallo fisso sarebbe sbagliato quasi ovunque |
| **Niente durata di permanenza da scegliere**: le misure partono da T e vanno avanti **fino all'evento** (tramonto, tramonto della Terra, fine della notte) | La challenge chiede il tempo rimanente al tramonto, la durata della luce e le finestre di visibilità della Terra [F12]. Nessuno di questi ha bisogno di una durata fissata a priori |
| **Dati in locale per i punti predefiniti** (13 regioni, 16 siti) | L'app deve aprirsi subito anche senza rete, per esempio davanti ai giudici. I server NASA servono ad aggiornare la cache e a valutare le coordinate inserite a mano |
| **Passo di 1 ora** | È il passo usato dalla NASA per le mappe di illuminazione del polo [F7] |

---

## 2. Linea di vista: il cuore del calcolo

Per ogni punto (cella di 100 m o sito):

1. dal DEM si calcola la **maschera d'orizzonte**: per ognuna di 360 direzioni, l'**angolo** sotto cui si vede il terreno più alto, con la curvatura lunare, per un osservatore a **2 m** dal suolo;
2. ogni ora si confronta l'elevazione di Sole e Terra con l'angolo della maschera **nella loro direzione**;
3. se il terreno copre il disco, la linea di vista è bloccata. Per il Sole vuol dire **ombra**: i pannelli non caricano e la temperatura scende. Per la Terra vuol dire **niente comunicazione diretta**.

**Perché:** con Sole e Terra così bassi, un rilievo anche piccolo li nasconde, e le ombre si allungano per chilometri. Serve l'orizzonte **reale**, non quello di una Luna liscia.

### Quando Sole e Terra contano come "visibili" (decisione C3)

**Visibili se se ne vede almeno metà del disco** (frazione ≥ 0,5). La frazione esatta, da 0 a 1, si salva sempre.

| Corpo | Perché metà disco |
|---|---|
| **Sole** (raggio apparente ~0,27°) | La potenza dei pannelli cresce con la parte di disco visibile. Con uno spicchio sottile arriva quasi niente, quindi contarlo come "luce" sarebbe ottimistico. "Disco intero" sarebbe troppo severo, perché segnerebbe buio anche quando i pannelli caricano |
| **Terra** (raggio apparente ~0,95°) | La NASA (PGDA) la conta visibile anche se se ne vede uno spicchio, ma avverte che è "leggermente ottimistico" per le comunicazioni radio [F7]. Metà disco equivale circa a "il centro della Terra è sopra l'orizzonte": è più prudente per un segnale fragile |

È anche la definizione del prototipo già validato, quindi i test fatti restano validi. Per confrontarsi con le mappe PGDA nella validazione si ricalcola con frazione > 0.

---

## 3. I dieci criteri

| # | Criterio | Quando | Cosa si misura | Perché |
|---|---|---|---|---|
| 1 | **Sole visibile** | All'atterraggio (T) | Sì / no, con la frazione di disco | Senza luce il lander non si ricarica: è la potenza solare chiesta dalla challenge [F12] |
| 2 | **Terra visibile** | All'atterraggio | Sì / no, con la frazione di disco | Senza linea di vista non c'è comunicazione diretta: per Artemis III "nessun relay disponibile" [F1] |
| 3 | **Elevazione del Sole** | All'atterraggio | Gradi sopra l'orizzonte **locale** | È il margine prima che il Sole sparisca dietro il terreno. La challenge chiede l'elevazione solare in evidenza [F12] |
| 4 | **Elevazione della Terra** | All'atterraggio | Gradi sopra l'orizzonte locale | Come sopra, per il segnale: al polo basta una piccola montagna a bloccarlo |
| 5 | **Luce continua** | Dopo l'atterraggio | Ore da T al primo tramonto del Sole | È il "tempo rimanente al tramonto" e la "durata della luce" chiesti dalla challenge [F12] |
| 6 | **Contatto continuo con la Terra** | Dopo l'atterraggio | Ore da T al primo tramonto della Terra | È la "finestra di visibilità della Terra" chiesta dalla challenge [F12] |
| 7 | **Prima notte** | Dopo l'atterraggio | Quando inizia e quanto dura il primo buio; 🔴 oltre 50 ore | Il freddo del buio può congelare batterie e meccanismi. L'avviso si basa su un evento reale, non su una finestra scelta a caso |
| 8 | **Pendenza** | Terreno (non dipende da T) | Classe su 100 m: 🟢 🟡 🟠 🔴 | Un terreno troppo inclinato fa ribaltare il lander |
| 9 | **Illuminazione annua** | Anno della data scelta | % di ore con il Sole, picchi ≥ 80%, calendario dei giorni buoni | Mostra quali punti producono energia in modo stabile e in quali giorni dell'anno conviene atterrare |
| 10 | **Tenuta agli slittamenti** | T ± 1, 2, 3 giorni | Si ricalcolano i criteri 1–9 alle date vicine | Le date slittano spesso: è il contesto esplicito della challenge [F12] |

Il programma mostra anche le **prossime finestre** di Sole e Terra dopo T, e una timeline di un mese lunare (~29,5 giorni) con zoom libero. Sono visualizzazione, non criteri.

---

## 4. Soglie di riferimento

### 4.1 Pendenza (criterio 8)

Misurata su una base di **100 m**, come nel requisito NASA [F1]: per ogni cella si adatta un piano al terreno e si prende la sua inclinazione.

| Colore | Pendenza | Significato | Fonte |
|---|---|---|---|
| 🟢 Verde | < 8° | Adatta anche al lander umano più esigente | Tolleranza del lander HLS di Artemis: 8° [F2] |
| 🟡 Giallo | 8–10° | Entro il limite di atterraggio di Artemis III e dei lander commerciali CLPS | Artemis III: < 10° su 100 m [F1]; Blue Ghost e bandi CLPS: ≤ 10° [F21], [F22] |
| 🟠 Arancione | 10–15° | Non adatta all'atterraggio, ma percorribile da un rover | Rover VIPER: fino a 15° [F20] |
| 🔴 Rosso | > 15° | Non adatta né all'atterraggio né al rover | Oltre il limite nominale di VIPER [F20] |

**Perché questa scala e non 5/15°:** la prima proposta del team (verde < 5°, giallo 5–15°, rosso > 15°) non aveva una fonte NASA, e con quella scala il limite di Artemis III (10°) sarebbe stato "giallo". La scala scelta mette un confine esattamente su ogni soglia NASA documentata. Il fatto utile è che **Artemis III e i lander CLPS usano lo stesso limite di 10°**: per questo un valore unico basta, senza profili.

Altri riferimenti, mostrati solo come informazione: il modulo lunare Apollo poteva non riuscire a ripartire oltre ~12° di inclinazione [F23]; gli astronauti a piedi richiedono pendenze < 20° su 2 km [F1].

### 4.2 Buio continuo (criterio 7)

**Avviso rosso se la prima notte dopo l'atterraggio supera 50 ore.**

**Perché:** è il limite dichiarato dalla NASA per il rover VIPER, che "non può sopportare più di 50 ore di buio continuo" [F20]. È l'unico dato pubblico e documentato su quanto buio regge un veicolo al polo sud. Nell'interfaccia va scritto che il riferimento è VIPER: altri veicoli hanno limiti diversi. Il programma **non** calcola la temperatura, perché non abbiamo un modello termico: misura solo la durata del buio.

### 4.3 Illuminazione annua (criterio 9, decisione C6)

**Picco se almeno l'80% delle ore dell'anno ha il Sole visibile**, calcolato a 2 m dal suolo.

**Perché:**

- l'80% è una **Scelta del team**. Ho controllato le fonti originali: lo studio NASA di Mazarico et al. 2011 non usa questa soglia [F7], e il numero "5 km² sopra l'80%" che circola online gli viene attribuito solo da fonti secondarie;
- è però coerente con i valori misurati. Il massimo noto al polo sud è il **92,27%** delle ore a 2 m, su Connecting Ridge [F25]; Mazarico et al. trovano un punto sul bordo di Shackleton illuminato **240 giorni di fila** [F7]. Con l'80% si evidenziano i punti vicini ai migliori conosciuti;
- 2 m è l'altezza delle nostre maschere e del valore di riferimento [F25];
- l'interfaccia mostra la % esatta e, come confronto, il massimo noto del 92,27%;
- si calcola sull'anno della data scelta, perché le condizioni di luce al polo si spostano di circa 2–3 settimane l'anno [F26].

### 4.4 Ombre permanenti (decisione C1)

**Solo un livello colorato sulla mappa**: non entrano nella valutazione.

**Perché:** le ombre permanenti sono fondi di crateri senza Sole, dove si cerca il ghiaccio d'acqua [F3]. Sono un'informazione scientifica utile da vedere, ma l'obiettivo del programma è l'atterraggio: luce, comunicazione, terreno. Dare loro un peso nella classifica avrebbe richiesto pesi senza fonte. Se in futuro servisse un'analisi di accessibilità, il riferimento è Wueller et al. 2026 [F24].

---

## 5. Dalle celle alla regione

### 5.1 Punti papabili (decisione C4)

Ogni regione è divisa in **celle di 100 m**: da ~25 000 a ~89 000 per regione. Una cella è un **punto papabile** se, all'istante T:

1. il **Sole è visibile** (criterio 1);
2. la **Terra è visibile** (criterio 2);
3. la **pendenza è < 10°**, cioè 🟢 o 🟡 (criterio 8).

**Perché queste tre:** sono le condizioni indispensabili per atterrare. Senza luce non c'è energia, senza Terra non c'è comunicazione, oltre i 10° si superano i limiti NASA di Artemis III e CLPS. Gli altri criteri non escludono un punto: dicono **quanto** è buono.

**Perché celle da 100 m:** è la base su cui la NASA misura la pendenza di atterraggio, ed è la precisione di atterraggio richiesta per Artemis III, "entro 100 m dal bersaglio" [F1].

**I punti papabili restano interni**: servono a valutare e ordinare le regioni, ma **non** si mostrano sulla mappa. Il programma dice **in quale regione** atterrare; la scelta del punto esatto resta alla missione.

Gli stessi criteri valgono per i 16 siti: ognuno è una sola cella, quindi è papabile oppure no.

### 5.2 Regioni considerate e scartate

- Una regione è **considerata** se ha almeno un punto papabile.
- Altrimenti è **scartata**, con il motivo: la condizione che ha escluso più celle, per esempio "nessun punto con la Terra visibile all'atterraggio".

**Perché:** dire "questa data non va bene per questa regione, e per questo motivo" è già una risposta utile per chi pianifica.

### 5.3 Area papabile e topografia

L'area papabile è il numero di punti papabili × 0,01 km². La topografia entra in **chi** è papabile, attraverso la pendenza e la maschera d'orizzonte. Le correzioni dell'area sono trascurabili ma si applicano: la proiezione polare deforma tra lo 0,05% e lo 0,5%, e un terreno inclinato di 10° ha una superficie più grande solo dell'1,5%.

Prima stima, solo pendenza (DEM PGDA a 20 m [F19]): de Gerlache Rim 2 ha **133,8 km²** sotto i 10° su 400 (33%), Malapert Massif **73,6 km²** su 441 (17%). È un limite superiore: con Sole e Terra all'istante T i punti papabili saranno di meno.

---

## 6. Confronto tra le regioni (decisione C5)

Le regioni considerate si ordinano **senza pesi**: ogni passo decide solo in caso di parità con il precedente.

| Ordine | Cosa | Perché |
|---|---|---|
| 1 | **Tenuta** (criterio 10): per quanti giorni di slittamento la regione ha ancora punti papabili | Per missioni le cui date slittano è la qualità più importante. La NASA ha scelto le regioni di Artemis III favorendo quelle "meno sensibili alle incertezze sui tempi" [F26] |
| 2 | **Area papabile** in km² | Più spazio vuol dire più margine se il lander non tocca il punto previsto: IM-2 è atterrato a ~250 m dal bersaglio [F14]. Anche la NASA ha favorito le regioni con "abbastanza area a bassa pendenza" [F26] |
| 3 | **Ore di luce continua** (criterio 5) del punto papabile migliore | Più ore di luce vuol dire più energia prima della prima notte |
| 4 | **Ore di contatto con la Terra** (criterio 6) del punto papabile migliore | Più ore di contatto vuol dire più tempo per comunicare |

**Perché senza pesi:** nessuna fonte dice quanto valga un'ora di luce rispetto a un km² di spazio. Un ordine a cascata evita di inventare numeri ed è facile da spiegare. Tutti i valori restano visibili in tabella, e l'utente può riordinare per qualsiasi colonna.

---

## 7. Tenuta agli slittamenti (decisione C7)

- Un **punto** regge uno slittamento di j giorni se a T + j, alla stessa ora, è **ancora papabile**.
- Una **regione** regge se a T + j ha ancora almeno un punto papabile.
- **Ritardi e anticipi separati**, per esempio "regge fino a +2 giorni di ritardo e −1 di anticipo".
- Contano solo serie **senza buchi**: se a +1 non regge, +2 e +3 non contano.
- Nel confronto tra regioni vale il **minimo dei due versi**; a parità, il ritardo.
- La prima notte si mostra per ogni data vicina, ma non decide la tenuta.

**Perché:**

- si usa la stessa regola dei punti papabili, così il criterio resta coerente con il resto;
- in pratica gli slittamenti sono soprattutto **ritardi**, quindi tenere separati i due versi dà un'informazione più utile;
- i "buchi" non contano perché una missione non può saltare il giorno +1 e atterrare il +2 come se niente fosse;
- **±1–3 giorni** è una Scelta del team: la NASA conferma che la robustezza alle date conta [F26], ma non indica un numero di giorni;
- il ricalcolo costa poco: le maschere e la tabella di effemeridi sono le stesse. Pendenza (8) e illuminazione annua (9) non cambiano con la data: in pratica si ricalcolano i criteri 1–7.

---

## 8. Cosa resta fuori, e perché

| Escluso | Perché |
|---|---|
| Profili di missione | Si misura e si colora con riferimenti NASA (principio 1) |
| Durata di permanenza fissa | Le misure vanno fino all'evento (principio 3) |
| Modello termico | Non abbiamo dati affidabili: si misura la durata del buio, non la temperatura |
| Ombre permanenti nella classifica | Solo livello sulla mappa (4.4) |
| Illuminazione durante l'avvicinamento | Dipende dalla traiettoria di ogni lancio, che non abbiamo [F1] |
| Relay e comunicazioni via satellite | Si valuta solo la comunicazione diretta con la Terra |
| Pesi numerici | Nessuna fonte li giustifica (sezione 6) |

---

## 9. Limiti da dichiarare nell'interfaccia

- I DEM non vedono massi e crateri di pochi metri: un punto papabile è "adatto secondo i dati orbitali", non "sicuro". I lander veri evitano gli ostacoli all'ultimo momento con i sensori di bordo.
- Ai 5 m di risoluzione, circa il 90% dei pixel dei DEM LOLA è interpolato tra le tracce del laser [F19].
- L'avviso sul buio usa il limite di un veicolo preciso (VIPER): altri veicoli hanno limiti diversi.
- Le soglie marcate come Scelta del team (80% di illuminazione annua, ±1–3 giorni) vanno rilette dopo i primi calcoli.

---

## 10. Riassunto per chi scrive il codice

```text
input:   istante di atterraggio T (UTC)
dati:    maschere d'orizzonte (360 valori, osservatore a 2 m), pendenza su 100 m,
         effemeridi Horizons orarie (punti sub-solare e sub-terrestre, distanza)

per ogni cella di ogni regione (e per ogni sito):
  1-2   Sole e Terra visibili a T            (frazione di disco >= 0,5)
  3-4   elevazioni sopra l'orizzonte locale a T
  5-6   ore fino al primo tramonto del Sole e della Terra
  7     prima notte: inizio e durata          (avviso se > 50 h)
  8     classe di pendenza                    (< 8, 8-10, 10-15, > 15 gradi)
  9     % di ore di Sole nell'anno            (picco se >= 80%)
  papabile = 1 e 2 e pendenza < 10 gradi
  10    papabile a T+1, T+2, T+3 e T-1, T-2, T-3 (serie senza buchi)

per ogni regione:
  scartata se nessun punto papabile (motivo: la condizione che esclude più celle)
  altrimenti: area papabile, tenuta (ritardo, anticipo), valori del punto migliore

confronto: tenuta (minimo dei due versi) > area papabile > ore di luce > ore di contatto
```

---

## Fonti

- **[F1]** L. Ortiz, NASA, *Artemis Human Landing System Overview*, Space Apps 2025, NTRS 20250009323 (slide 19, 21, 24, 27, 28). https://ntrs.nasa.gov/api/citations/20250009323/downloads/ArtemisOverview2025IntSPAPPSChallenge.pdf
- **[F2]** Z. Scoville, NASA, *Artemis III EVA Mission Capability for de Gerlache-Shackleton Ridge*, NTRS 20210026296 (requisito HLS-S-R-0071). https://ntrs.nasa.gov/api/citations/20210026296/downloads/Scoville%20Final%20presentation%20-%20compressed.pptx.pdf
- **[F3]** NASA Moon Trek, *Artemis III Candidate Landing Regions* (`A3_Named_regions_SP`) e abstract. https://trek.nasa.gov/moon/TrekWS/rest/cat/abstract?label=A3_Named_regions_SP
- **[F5]** JPL Horizons API. https://ssd-api.jpl.nasa.gov/doc/horizons.html
- **[F7]** E. Mazarico et al. (2011), *Illumination conditions of the lunar polar regions using LOLA topography*, Icarus 211, 1066–1081. Abstract: https://ntrs.nasa.gov/citations/20120010094. Dati: https://pgda.gsfc.nasa.gov/products/69
- **[F12]** NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*. https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/
- **[F14]** LROC, IM-2 Landing Region. https://www.lroc.asu.edu/images/1401
- **[F19]** M. K. Barker, NASA PGDA, *A New View of the Lunar South Pole from LOLA*. https://pgda.gsfc.nasa.gov/products/90 (e prodotto 78 per l'interpolazione dei DEM a 5 m: https://pgda.gsfc.nasa.gov/products/78)
- **[F20]** NASA, *VIPER Lunar Operations*: pendenze fino a 15°, al massimo 50 ore di buio continuo. https://science.nasa.gov/mission/viper/lunar-operations/
- **[F21]** *Landing site selected for the Blue Ghost Mission 1*, LPSC 2022, abstract 1390: pendenze ≤ 10°. https://www.hou.usra.edu/meetings/lpsc2022/pdf/1390.pdf
- **[F22]** *Lunar-VISE Landing Site Selection and Characterization at Mons Gruithuisen Gamma*, Planetary Science Journal (2026): bandi CLPS, pendenze < 10°. https://iopscience.iop.org/article/10.3847/PSJ/ae7d2c
- **[F23]** NASA, *Apollo Lunar Module Landing Gear*. https://www.nasa.gov/wp-content/uploads/static/history/alsj/LM_Landing%20Gear1973010151.pdf
- **[F24]** Wueller et al. (2026), JGR Planets, doi:10.1029/2025JE009434. https://agupubs.onlinelibrary.wiley.com/doi/10.1029/2025JE009434
- **[F25]** P. Gläser et al. (2014), *Illumination conditions at the lunar south pole using high resolution Digital Terrain Models from LOLA*, Icarus 243, 78–90. Abstract: https://elib.dlr.de/94240
- **[F26]** T. George et al. (NASA), *Artemis III Site Selection Update: Down-selection from 13 to 9 Candidate Regions*, LPSC 2026, abstract 1901. https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf
