# Design — O8b: finals qualifier resolution — O6/O8

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o6-competition-management.md`. Segue O8a (live results). Winner propagation → eventuale O8b-2.

## Contesto e obiettivo

Il tabellone finali ha segnaposto "Nª Girone X" (qualificate) e "Vincente …" (vincitori). Questa fetta risolve **le qualificate**: quando un girone è concluso, "Nª Girone X" diventa la squadra realmente N-esima in classifica. I "Vincente …" restano segnaposto (propagazione rimandata). Mockup mid-fi.

## Scope

**Incluso:** `rankStanding` condiviso (unico ranking); `FinalMatch.homeResolved/awayResolved`; `resolveFinals(eventId)` che risolve gli slot "Nª Girone X" a girone completo; `renderBracket` mostra la squadra risolta o il segnaposto; hook su generate + recordResult.

**Non incluso:** registrare risultati delle finali; propagazione vincitori ("Vincente …"); terzo posto.

## Modello (mock store)

`FinalMatch` guadagna `homeResolved: string | null`, `awayResolved: string | null` (init `null` quando i FinalMatch sono creati in `generateSchedule`). Nessuna nuova collezione.

## Ranking condiviso

Estrarre `rankStanding(rows: StandingRow[]): StandingRow[]` in `shared/mock/ranking.ts` — ordina una copia per **punti desc → (goalsFor−goalsAgainst) desc → goalsFor desc → team asc** (il tie-break introdotto in O8a). `renderStandings` (chrome) viene rifattorizzato per usarlo al posto del sort inline → **un'unica fonte del ranking** (vista + risoluzione).

## `resolveFinals(eventId)` (store)

Per l'evento:
- Un girone (categoria, groupLabel) è **completo** se tutti i suoi `ScheduledMatch` hanno entrambi i punteggi non-null.
- Per ogni `FinalMatch` dell'evento, per `home` e `away`:
  - se il segnaposto matcha `^(\d+)ª (Girone .+)$` → pos N, girone G; **se G è completo** e `rankStanding(righe di cat+G)[N-1]` esiste → `resolved = quel team`; **altrimenti `null`**.
  - altrimenti (es. "Vincente …") → `resolved = null`.
- Aggiorna `homeResolved`/`awayResolved` di ogni FinalMatch.
Chiamata: in coda a `generateSchedule` (gironi non completi → tutti null) e in coda a `recordResult` (dopo il ricalcolo classifiche → i gironi completati popolano il tabellone). Ri-risolve sempre da capo (idempotente; una correzione che "scompleta" un girone riporta a segnaposto).

## `renderBracket` (chrome)

Per ogni match del tabellone mostra `homeResolved ?? home` e `awayResolved ?? away` (la squadra risolta sostituisce il segnaposto quando disponibile). Nessun altro cambio; vale E1 (sezione Finali) e pubblico E3 (`bracket.html`).

## Revisione Blueprint

**D-O6-6** (`o6-competition-management.md`): i segnaposto qualificato del tabellone (`Nª Girone X`) si **risolvono nella squadra classificata** quando il girone è concluso (`ParticipantAdvanced` parziale, dal gruppo al tabellone). La propagazione dei vincitori dei match del tabellone (`Vincente …`) è rimandata. Il ranking è single-sourced (`rankStanding`).

## Criteri di successo

1. Con un girone incompleto, gli slot "Nª Girone X" del tabellone restano segnaposto.
2. Registrando i risultati fino a completare quel girone, gli slot diventano le squadre realmente classificate (1ª/2ª… secondo il ranking).
3. Correggere un risultato ri-risolve (anche all'indietro se il girone torna incompleto); gli slot "Vincente …" restano segnaposto.
4. E1 (Finali) e pubblico (`bracket.html`) mostrano la stessa risoluzione. Test verdi (`resolveFinals` + ranking + girone incompleto); `renderStandings` continua a ordinare via `rankStanding`.

## Fuori scope / futuro

O8b-2 (risultati finali + propagazione vincitori); terzo posto; ripescaggi/migliori seconde.
