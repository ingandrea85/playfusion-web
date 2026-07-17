# Design — Gironi editor + explicit group composition (B1) — O6

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming ("vai")
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o6-competition-management.md`. Segue: editor calendario (B2, round successivo).

## Contesto e obiettivo

Oggi i gironi sono **derivati** (`i % groups` dentro `buildFixtures`), non modificabili. B1 li rende **espliciti e modificabili**: un editor gironi (E1) dove l'organizzatore sorteggia, sposta le squadre tra i gironi (controlli a select, mobile-friendly) e blocca la composizione. Fixtures/classifiche/finali derivano dalla composizione scelta. Mockup mid-fi.

## Scope (B1)

**Incluso:** modello `GroupSlot` + `groupsLocked`; refactor del raggruppamento a monte (`resolveGroups`: da slot espliciti se presenti, altrimenti auto); store per sorteggio/spostamento/lock; nuovo step E1 "Gironi".

**Non incluso:** editor calendario (B2); drag&drop; validazioni avanzate (gironi sbilanciati sono ammessi); riverbero su finali già pianificate oltre la rigenerazione.

## Modello (mock store)

```
GroupSlot { eventId: string; categoryId: string; team: string; groupLabel: string }
```
- `State.groupSlots: GroupSlot[]` (seed `[]`).
- `Competition` guadagna `groupsLocked: boolean` (seed `false`).

## Refactor "resolveGroups" (fondativo)

Sposta il raggruppamento fuori da `buildFixtures`:
- Helper `resolveGroups(eventId, cat, competition): Array<{ groupLabel: string; teams: string[] }>` (store): se esistono `GroupSlot` per la categoria → costruisce i gironi da quelli (ordine gironi = `Girone A/B/…`, squadre nell'ordine degli slot); altrimenti auto via `splitIntoGroups(cat)` (comportamento attuale). Unica fonte di raggruppamento.
- `buildFixtures` cambia firma: ogni categoria di input porta i **gironi risolti** (`groups: {groupLabel, teams}[]`) invece di `{teams, format, groupsCount}`; itera i gironi e produce le coppie round-robin (andata/ritorno per `legs`) + piazzamento su campi/slot (invariato). `buildGroups` diventa/rimane il produttore dell'auto-risoluzione (`splitIntoGroups`), usato da `resolveGroups` nel ramo "nessuno slot".
- `generateSchedule`: per ogni categoria calcola `resolveGroups(...)` una volta e lo passa a `buildFixtures`, alle **standings** (una riga per squadra di ogni girone risolto) e a **buildFinals** (label gironi risolti). Comportamento invariato quando non si compone a mano (auto-risoluzione = split odierno).
- I test di `fixtures`/`finals` vengono adeguati alla nuova firma (comportamento equivalente sull'auto-caso).

## Store (editor gironi)

- `getGroupSlots(eventId): GroupSlot[]`
- `drawGroups(eventId, categoryId): void` — semina/ri-semina gli slot della categoria dall'auto-sorteggio (`splitIntoGroups` sulle squadre confermate), **solo se non bloccata**; rimpiazza gli slot della categoria.
- `moveTeam(eventId, categoryId, team, toGroupLabel): void` — cambia il `groupLabel` dello slot (no-op se categoria bloccata).
- `setGroupsLocked(categoryId, locked): void`.
- Gironi disponibili per la categoria = `Girone A..` fino a `Competition.groupsCount` (`ROUND_ROBIN` → 1).

## Schermata E1 — nuovo step "Gironi"

- Nuovo step nell'hub evento **"Componi gironi"** tra "Configura competizione" e "Genera calendario" (`gironi.html?event=`), done quando ogni categoria ha slot.
- Pagina `gironi.html`: tab **categoria** (riuso `renderTabs`); per la categoria selezionata:
  - Pulsante **"Sorteggia gironi"** (semina/ri-semina); toggle **"Blocca gironi"**.
  - Elenco per girone (colonne/card) con le squadre; ogni squadra ha un **select "Sposta in…"** con gli altri gironi (disabilitato se bloccata).
  - Se nessuno slot: messaggio + invito a sorteggiare.
- Controlli a select/tap (mobile-friendly), nessun drag&drop.

## Revisione Blueprint

- **D-O6-5** (`o6-competition-management.md`): la **composizione dei gironi** è stato esplicito di O6 (assegnazione squadra→girone), seminata da un sorteggio e modificabile finché non `groupsLocked`. Le proiezioni (fixtures/standings/finali) derivano dalla composizione.

## Criteri di successo

1. "Sorteggia gironi" popola gli slot della categoria coerentemente con `groupsCount`.
2. Spostando una squadra in un altro girone e poi rigenerando il calendario, fixtures/classifiche/finali riflettono la nuova composizione.
3. Il lucchetto impedisce sorteggio/spostamento.
4. Senza comporre a mano, "Genera" funziona come prima (auto-risoluzione).
5. Step hub "Componi gironi" presente e con done-state; test verdi.
6. Blueprint D-O6-5 registrata.

## Fuori scope / futuro

Editor calendario (B2); drag&drop; bilanciamento automatico; spostamenti che aggiornano finali già pianificate senza rigenerare.
