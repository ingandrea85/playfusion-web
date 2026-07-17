# Design — Finale 3º/4º + rigori (spareggio a eliminazione) — O6/O8

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; completa O8b/O8b-2 (D-O6-6). Blueprint O6/O8.

## Contesto e obiettivo

Oggi un match del tabellone in parità **non propaga** alcun vincitore (O8b-2), e il tabellone a eliminazione non ha una **finale 3º/4º**. Aggiungiamo: (a) risoluzione della parità ai **rigori**; (b) propagazione anche del **perdente** (`Perdente …`) per alimentare una **finale 3º/4º**, generata quando la competizione ha l'opzione attiva. Mockup mid-fi.

## Scope

**Incluso:** `CompetitionConfig.thirdPlace` (toggle per categoria); `FinalMatch.homeShootout/awayShootout`; segnaposto `Perdente <round><order>`; `buildFinals` genera la "Finale 3º/4º" (perdenti delle due semifinali) quando `thirdPlace`; motore `decideMatch` (tempi → rigori) usato per `Vincente`/`Perdente`; `recordFinalResult` con rigori; UI (checkbox competizione + rigori nel pannello E1 + "d.c.r." nel bracket); `evt-finals` con `thirdPlace` attivo; Blueprint.

**Non incluso:** rigori nei match di girone (solo tabellone); classifica finale completa oltre 1º-4º; ripescaggi.

## Modello

- `CompetitionConfig` guadagna `thirdPlace: boolean` (default `false`). Tutte le creazioni di `Competition` (seed, `upsertCompetition`, `applyToAllCategories`, `demoEvent`) lo valorizzano.
- `FinalMatch` guadagna `homeShootout: number | null`, `awayShootout: number | null` (init `null` in `generateSchedule` e `demoEvent`).
- Segnaposto perdente: forma `Perdente <round><order>` (es. `Perdente SF1`), simmetrica a `Vincente <round><order>`.

## Generazione (`finals.ts`)

`buildFinals(gironi, qualifiersPerGroup, finalsType, thirdPlace = false)`. `singleElim` riceve `thirdPlace`: quando elabora il round con **esattamente 2 match** (le semifinali, `current.length === 4`), se `thirdPlace` è attivo aggiunge un match `{ bracketLabel, round: 'Finale 3º/4º', order: 1, home: 'Perdente SF1', away: 'Perdente SF2' }` (usando `roundShort` del round semifinale). Vale per crossover (Q≥4) e per ciascun tabellone dello split. Con Q=2 (finale secca) non ci sono semifinali → nessuna 3º/4º. PLACEMENT ignora `thirdPlace`.

## Motore (`derive.ts`)

Estrarre `decideMatch(m: FinalMatch): { winner: string; loser: string } | null`:
- richiede `m.homeResolved` e `m.awayResolved` non-null ed entrambi i punteggi tempi non-null;
- se `homeScore !== awayScore` → vincitore = lato col punteggio maggiore;
- altrimenti se `homeShootout`/`awayShootout` entrambi non-null e diversi → vincitore = lato coi rigori maggiori;
- altrimenti → `null` (indeciso: nessuna propagazione).
- `loser` = l'altro lato.

`resolveSlot` (per un `bracketLabel`):
- `^(\d+)ª (Girone .+)$` → qualificata (invariato).
- `^Vincente (SF|QF|OF|F|T)(\d+)$` → `decideMatch(src)?.winner ?? null`.
- `^Perdente (SF|QF|OF|F|T)(\d+)$` → `decideMatch(src)?.loser ?? null`.
- altro → `null`.

`resolveFinals` resta il fixpoint iterativo esistente (idempotente; correzioni ri-propagano). `roundShort` già esportata.

## Store

`recordFinalResult(finalMatchId, homeScore, awayScore, shootout?: { home: number; away: number }): void` — setta i punteggi tempi; setta `homeShootout/awayShootout` da `shootout` se fornito **e** i tempi sono pari, altrimenti `null` (i rigori non hanno senso se i tempi non sono pari); poi `resolveFinals`, `save`.

## UI

- **Configura competizione** (`competition.ts`): checkbox **"Finale 3º/4º"** per categoria (nel form per-categoria e nel toggle same-for-all), scritto in `upsertCompetition`/`applyToAllCategories`.
- **`renderBracket`**: se `homeShootout`/`awayShootout` presenti, mostra `d.c.r. X-Y` accanto al punteggio; la "Finale 3º/4º" è un round come gli altri; il **campione** resta il vincitore del round `Finale`.
- **Pannello risultato E1** (`openFinalResultPanel`): oltre ai punteggi tempi, due campi **rigori** (etichettati "Rigori — solo in caso di parità"); al salvataggio si passa `shootout` solo se compilati. Pubblico read-only.

## Evento demo

`evt-finals` (già 4 squadre → 2 semifinali + finale) attiva `thirdPlace: true`, così il tabellone include anche **Finale 3º/4º** (`Perdente SF1 vs Perdente SF2`). Consente di dimostrare: registrare le semifinali → si popolano finale e finale 3º/4º; una semifinale in parità risolta ai **rigori** propaga vincitore e perdente.

## Revisione Blueprint

Estendo **D-O6-6**: nei match del tabellone a eliminazione la **parità nei tempi si risolve ai rigori** (`homeShootout/awayShootout`); oltre al vincitore si propaga anche il **perdente** (`Perdente …`); la **finale 3º/4º** (perdenti delle semifinali) è un'**opzione di competizione** (`thirdPlace`). Il campione resta il vincitore della Finale.

## Criteri di successo

1. Con `thirdPlace` attivo, un tabellone crossover a 4 genera SF1, SF2, Finale **e** Finale 3º/4º (`Perdente SF1 vs Perdente SF2`); con Q=2 o PLACEMENT nessuna 3º/4º.
2. Registrando le semifinali, la finale prende i vincitori e la finale 3º/4º prende i perdenti; una semifinale pareggiata nei tempi ma decisa ai rigori propaga comunque (vincitore ai rigori sopra).
3. Il pannello E1 accetta i rigori; il bracket mostra `d.c.r. X-Y`; il campione è il vincitore della Finale (indifferente alla 3º/4º).
4. Correggere un risultato ri-propaga. Il toggle "Finale 3º/4º" è scritto sulla competizione e usato in generazione. Pubblico read-only. Test verdi (buildFinals 3º/4º; decideMatch rigori; Perdente→3º/4º; campione invariato); suite + build + `tsc` puliti.

## Fuori scope / futuro

Rigori nei gironi; classifica finale 5º-8º; ripescaggi/migliori seconde.
