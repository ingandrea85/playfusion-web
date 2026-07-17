# Design — O8b-2: finals results + winner propagation — O6/O8

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; completa O8b (D-O6-6). Blueprint O6/O8.

## Contesto e obiettivo

O8b risolve solo le qualificate (`Nª Girone X`). O8b-2 permette di **registrare i risultati dei match del tabellone** e **propaga i vincitori** (`Vincente SF1` → chi vince quella semifinale), fino al **campione**. Mockup mid-fi.

## Scope

**Incluso:** `FinalMatch` guadagna `homeScore`/`awayScore` (nullable); `resolveFinals` estesa a risolvere gli slot `Vincente <round><order>` dai match decisi (iterativa fino a punto fisso); store `recordFinalResult`; pannello risultato E1 sui match del tabellone con entrambi i partecipanti risolti; **campione** mostrato in E1 e pubblico; un evento demo con tabellone a più turni (semifinali → finale). Pubblico read-only.

**Non incluso:** finale 3º/4º; rigori/spareggio in caso di pareggio a eliminazione (un pareggio semplicemente non propaga alcun vincitore); ripescaggi.

## Modello

`FinalMatch` guadagna `homeScore: number | null`, `awayScore: number | null` (init `null` ovunque si creino FinalMatch: `generateSchedule`, `demoEvent`).

## Propagazione (`resolveFinals` in `derive.ts`)

`resolveFinals(state, eventId)` diventa iterativa (punto fisso, cap sulla profondità del tabellone): a ogni passata ricalcola `homeResolved`/`awayResolved` di ogni `FinalMatch`; si ferma quando nulla cambia. `resolveSlot` guadagna il `bracketLabel` del match e gestisce due forme di segnaposto:
- **Qualificata** `^(\d+)ª (Girone .+)$` → come O8b (girone completo + ranking + gating parità, invariato).
- **Vincente** `^Vincente (SF|QF|OF|F|T)(\d+)$` → trova, nello **stesso** `eventId`+`categoryId`+`bracketLabel`, il `FinalMatch` sorgente con `roundShort(round)` = codice e `order` = numero; se la sorgente ha **entrambi i partecipanti risolti** (`homeResolved`/`awayResolved` non-null) ed **entrambi i punteggi** e i punteggi **non sono pari** → vincitore = il partecipante col punteggio maggiore; altrimenti `null` (pareggio o match non ancora giocato → nessuna propagazione).
- Altro → `null`.

`roundShort` viene esportata da `finals.ts` e importata in `derive.ts` (unica fonte della codifica round→sigla). L'iterazione fa sì che, risolta una semifinale, la passata successiva popoli la finale. Idempotente e ri-derivata da capo (coerente con O8b): correggere un risultato ri-propaga.

## Store

`recordFinalResult(finalMatchId: string, homeScore: number, awayScore: number): void` — setta i punteggi del `FinalMatch`, chiama `resolveFinals(state, eventId)`, salva. (Simmetrico a `recordResult` per i gironi.)

## UI

- **`renderBracket(finals, editable = false)`** (chrome): per ogni match mostra i **punteggi** se presenti (stile calendario); quando `editable` e il match ha **entrambi i partecipanti risolti**, aggiunge un bottone **"Risultato"** (`data-final="<id>"`). Per ogni `bracketLabel`, se il match di round **Finale** è deciso (partecipanti risolti + punteggi + non pari), mostra **"🏆 Campione: <squadra>"**.
- **E1** (`schedule.ts`): passa `editable = true`; aggancia i bottoni "Risultato" a un pannello (riusa `#editmatch`) che chiama `recordFinalResult` e ri-renderizza.
- **Pubblico** (`bracket.html`): `renderBracket(..., false)` — punteggi + campione, nessun controllo.

## Evento demo

Nuovo evento `evt-finals` — **Demo · Tabellone (semifinali)**: girone unico a 4 squadre, `SINGLE_GROUP_CROSSOVER` con 4 qualificate → tabellone `[SF1: 1ª vs 4ª, SF2: 2ª vs 3ª, Finale: Vincente SF1 vs Vincente SF2]`. Il girone è completo (classifica 1-2-3-4 senza pari), quindi le semifinali hanno i partecipanti risolti; i match del tabellone sono **non ancora giocati** (punteggi null) così la propagazione si vede dal vivo. Per abilitarlo, `demoEvent` genera le finali con `buildFinals(['Girone A'], qualifiers, 'SINGLE_GROUP_CROSSOVER')` (rimpiazza il match hardcoded; per `qualifiers = 2` produce esattamente l'attuale singola finale `1ª vs 2ª Girone A`, quindi gli altri demo restano invariati) e accetta un parametro `qualifiers` (default 2; il nuovo demo usa 4).

## Revisione Blueprint

Completa **D-O6-6**: `ParticipantAdvanced` copre ora anche la **propagazione dei vincitori** dei match del tabellone (`Vincente …`), non solo le qualificate; il vincitore del match di **Finale** è il **campione**. Un pareggio a eliminazione non propaga (rigori/spareggio fuori scope).

## Criteri di successo

1. Il demo `evt-finals` mostra 2 semifinali (partecipanti risolti) + finale con slot `Vincente …` da riempire.
2. Registrando i risultati delle semifinali, la finale si popola coi vincitori; registrando la finale, compare il campione (E1 + pubblico coerenti).
3. Un pareggio in un match a eliminazione non propaga alcun vincitore (slot resta segnaposto).
4. Correggere un risultato ri-propaga da capo. Il pubblico resta read-only. Test verdi (propagazione semifinali→finale→campione, pareggio non propaga, correzione ri-propaga); suite + build + `tsc` puliti.

## Fuori scope / futuro

Finale 3º/4º; rigori/spareggio; ripescaggi/migliori seconde.
