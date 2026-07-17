# Design — Tie-break policy (Slice 1: policy + ranking deterministico + eventi demo) — O3/O6/O8

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; segue O8a (D-O8-1) e O8b (D-O6-6). Blueprint O3 (Event), O6 (Standing), O8. Slice 2 (risoluzione manuale) è a parte.

## Contesto e obiettivo

Oggi la classifica ordina con un tie-break cablato (punti → DR → reti → nome), dove il nome alfabetico è un ripiego non sportivo che può qualificare la squadra sbagliata (O8b `resolveFinals` prende "la N-esima"). Rendiamo lo spareggio una **policy di dominio configurabile per evento**, con default per sport, e implementiamo il ranking deterministico completo (scontri diretti + classifica avulsa + DR + reti fatte). La parità che resta irrisolta viene **segnalata e blocca** la risoluzione del tabellone (la risoluzione manuale è la Slice 2). Includiamo **eventi demo** che mostrano ogni casistica. Mockup mid-fi.

## Scope

**Incluso:**
- Modello `TieBreakCriterion` + `TournamentEvent.tieBreak: TieBreakCriterion[]`; punti è sempre il 1º criterio implicito (non nella lista).
- Default per sport (`shared/mock/tiebreak.ts`); pre-riempimento in *crea evento*, con editor riordina/abilita (frecce su/giù, mobile-friendly, no drag&drop).
- Refactor di `rankStanding` per consumare la policy + i match del girone: scontri diretti (2 squadre) e **classifica avulsa** (3+), poi DR generale, poi reti fatte; ritorna anche i gruppi rimasti **in parità irrisolta**.
- `renderStandings` consuma policy+match; segnala (badge) le squadre in parità irrisolta.
- `resolveFinals` (O8b) non risolve uno slot la cui posizione N ricade in una parità irrisolta; avviso nel tabellone.
- 5 **eventi demo** già giocati+pubblicati, ciascuno che isola una casistica, raggiungibili dalla dashboard organizer. Un test per scenario.

**Non incluso (Slice 2):** pannello di ordinamento manuale del gruppo appaiato + override persistito che sblocca ranking/tabellone. **Mai in scope:** fair-play/disciplinare, sorteggio automatico, ripescaggi/migliori seconde, terzo posto.

## Modello (types)

```
export type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'
```
`TournamentEvent` guadagna `tieBreak: TieBreakCriterion[]` (ordinato; sottoinsieme dei tre, senza duplicati). I punti sono sempre il criterio primario, non rappresentato nella lista.

## Default per sport (`shared/mock/tiebreak.ts`)

- `TIEBREAK_DEFAULTS: Record<string, TieBreakCriterion[]>` con almeno `Calcio: ['HEAD_TO_HEAD','GOAL_DIFFERENCE','GOALS_FOR']`.
- `defaultTieBreak(sport: string): TieBreakCriterion[]` → default dello sport se presente, altrimenti default generico `['GOAL_DIFFERENCE','GOALS_FOR']`.
- `criterionLabel(c): string` per la UI (es. `HEAD_TO_HEAD` → "Scontri diretti / avulsa", `GOAL_DIFFERENCE` → "Differenza reti", `GOALS_FOR` → "Reti fatte").
- `createEvent` imposta `tieBreak` dal payload se fornito, altrimenti `defaultTieBreak(sport)`.

## Ranking (`shared/mock/ranking.ts`)

Nuova firma:
```
export interface RankResult { rows: StandingRow[]; unresolved: string[][] }
export function rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[]): RankResult
```
- `rows`: sempre un ordine **totale e stabile** (le squadre in parità irrisolta restano ordinate per nome, così la UI renderizza sempre) — non un ordine sportivo per quelle.
- `unresolved`: lista dei gruppi (≥2 squadre) rimasti **esattamente in parità** dopo aver esaurito la policy; il loro ordine reciproco in `rows` è arbitrario (da definire in Slice 2).

Algoritmo:
1. Ordina per **punti** desc; raggruppa le squadre a pari punti.
2. Ogni gruppo di pari-merito (≥2) si risolve applicando i criteri **nell'ordine di `policy`**; un criterio che separa parzialmente ricorre sui sotto-gruppi ancora appaiati col criterio successivo. Esaurita la policy, un sotto-gruppo ancora appaiato → aggiunto a `unresolved` (ordinato per nome in `rows`).
3. Criteri:
   - `HEAD_TO_HEAD`: mini-classifica avulsa sui soli `matches` **tra le squadre del gruppo** (entrambe home e away nel gruppo, con punteggio registrato); ordina per **punti-avulsa → DR-avulsa → reti-avulsa**. Vale sia per 2 che per 3+ squadre. Se i match tra loro non bastano a separare (o non esistono) → il gruppo passa al criterio successivo.
   - `GOAL_DIFFERENCE`: differenza reti **generale** (`goalsFor − goalsAgainst`).
   - `GOALS_FOR`: reti fatte **generali**.

I `matches` passati sono quelli di quel girone (`eventId`+`categoryId`+`groupLabel`), giocati (con punteggio).

## Consumi

- **`renderStandings`** (chrome): firma → `renderStandings(rows, matches, policy, catName)`. Per ogni girone chiama `rankStanding` e renderizza `rows`; se una riga appartiene a un gruppo `unresolved`, mostra un **badge** "parità da definire" accanto alla posizione. E1 (`schedule.ts`) e pubblico (`standings.ts`) passano `getScheduledMatches(eventId)` e `event.tieBreak`.
- **`resolveFinals`** (store): usa `rankStanding(rowsDelGirone, matchesDelGirone, policyEvento)`. Uno slot `Nª Girone X` si risolve solo se il girone è completo **e** la squadra in posizione N **non** appartiene ad alcun gruppo `unresolved` (né la posizione N è al confine di un gruppo irrisolto). Altrimenti resta segnaposto.
- **`renderBracket`** (chrome): quando uno slot resta segnaposto per parità irrisolta (non per girone incompleto), il testo del segnaposto è invariato; l'avviso vive nella sezione classifiche. (Nessun nuovo parametro a `renderBracket`.)

## Eventi demo

5 eventi aggiuntivi nel seed, sport `Calcio` (default policy), ognuno **PUBLISHED** con match giocati e standing derivati, un solo girone, così la classifica mostra subito la casistica. Raggiungibili come card dalla dashboard organizer (che già elenca tutti gli eventi). Ognuno isola **un** criterio decisivo:

1. **Scontri diretti (2 squadre)** — due squadre identiche su punti/DR/reti generali; separate solo dallo scontro diretto vinto da una.
2. **Classifica avulsa (3 squadre)** — tre squadre a pari punti; separate dal triangolare interno (avulsa).
3. **Differenza reti** — due squadre a pari punti, scontro diretto in parità; separate dalla DR generale.
4. **Reti fatte** — due squadre a pari punti e pari DR, scontro diretto in parità; separate dalle reti fatte.
5. **Parità irrisolta** — due squadre identiche su tutto e scontro diretto pari → `unresolved`; in Slice 1 la classifica mostra il badge "parità da definire" e il tabellone (se dipende da quelle posizioni) lascia lo slot a segnaposto.

I punteggi esatti dei match sono fissati nel piano di implementazione, con **un test per scenario** che asserisce l'ordine risultante di `rankStanding` (e, per lo scenario 5, che il gruppo compaia in `unresolved`). Un test di **consistenza** verifica che gli standing seed coincidano con il ricalcolo dai match seed.

## Revisione Blueprint (da registrare dopo l'implementazione)

- **O3** (`o3-sport-events.md`): l'Evento possiede la `TieBreakPolicy` (lista ordinata di criteri), con **default per tipo di sport** e override in creazione evento. Presentation/regole di dominio dell'evento, consumate da O6.
- **O6/O8**: `rankStanding` consuma la policy dell'evento; introdotti scontri diretti + classifica avulsa; la parità residua è **non decisa dal dominio** e richiede intervento manuale (Slice 2, futuro evento tipo `StandingTieResolvedManually`). Il ranking resta single-sourced.

## Criteri di successo

1. Un nuovo evento nasce con la policy di default del suo sport; l'editor in crea-evento permette di riordinare/abilitare i criteri (frecce su/giù), punti sempre in cima e bloccato.
2. `rankStanding` risolve correttamente: scontri diretti (2), avulsa (3+), DR generale, reti fatte, nell'ordine della policy; ritorna i gruppi irrisolti in `unresolved`.
3. I 5 eventi demo mostrano ciascuno la propria casistica in classifica (E1 + pubblico); lo scenario 5 mostra il badge "parità da definire".
4. `resolveFinals` non qualifica una squadra la cui posizione dipende da una parità irrisolta.
5. `renderStandings` (E1 e pubblico) usa la stessa `rankStanding` e mostra lo stesso ordine/badge. Test verdi: un test per scenario + consistenza seed↔ricalcolo; suite + build + `tsc` puliti.

## Fuori scope / futuro

Slice 2 (risoluzione manuale + override + sblocco tabellone); fair-play/disciplinare; sorteggio automatico; terzo posto; ripescaggi.
