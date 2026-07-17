# Design — O8a: live results + standings recompute — O8/O6

- **Data:** 2026-07-17
- **Stato:** approvato in brainstorming
- **Repo:** `playfusion-web`
- **Correlati:** [[playfusion-web-mockups]]; Blueprint `o8-live-operations.md`, `o6-competition-management.md`. Segue: O8b (finals advancement).

## Contesto e obiettivo

Prima fetta di O8 (Live Operations): registrare i punteggi dei match di girone in E1 → **ricalcolo classifiche** con punti reali e ordinamento (Standing Initialized→Recomputed). È il "vivo" (VT1). Mockup mid-fi. I punteggi li inserisce l'organizzatore in E1 (il referto mobile E2 verrà col repo mobile).

## Scope

**Incluso:** punteggi su `ScheduledMatch`; `recordResult` + ricalcolo classifiche (3/1/0 + tie-break); ordinamento in `renderStandings`; punteggio mostrato sui match (E1 + pubblico E3); inserimento risultato in E1.

**Non incluso (→ O8b):** avanzamento/risoluzione segnaposto del tabellone finali; cronaca live; cartellini/disciplinari; referto mobile E2.

## Modello (mock store)

`ScheduledMatch` guadagna `homeScore: number | null` e `awayScore: number | null` (init `null` in `buildFixtures`; `null` = non giocata; entrambi valorizzati = giocata). Nessuna nuova collezione. `StandingRow` invariata (le stat esistenti — played/won/drawn/lost/goalsFor/goalsAgainst/points — ora vengono calcolate).

## Store

- `recordResult(matchId: string, homeScore: number, awayScore: number): void` — imposta i punteggi sul match, poi chiama il ricalcolo delle classifiche dell'evento del match.
- `recomputeStandings(eventId)` (interno, chiamato da `recordResult`): azzera le stat di tutte le `StandingRow` dell'evento, poi per ogni `ScheduledMatch` **giocato** (entrambi i punteggi non-null) dell'evento aggiorna le righe di `home` e `away` (match per `categoryId`+team): `played++`, `goalsFor/goalsAgainst`, e `won/drawn/lost` + `points` (vittoria 3, pareggio 1, sconfitta 0). Deterministico.
- Ri-registrare un risultato lo sovrascrive e ricalcola. "Reset demo" azzera (seed: punteggi null, stat 0).

## Ordinamento classifica

`renderStandings` ordina ogni girone per **punti desc → differenza reti (goalsFor−goalsAgainst) desc → goalsFor desc → nome squadra asc**; la posizione (Pos) riflette il ranking. Con punteggi iniziali a 0, l'ordine resta stabile (per nome). Vale per E1 e per il pubblico E3.

## UI

- **E1 `schedule.html`** (calendario editabile): oltre a "Modifica" (reschedule, B2), ogni match ha **"Risultato"** → pannello (contenitore `#editmatch` riusato) con input **punteggio casa** e **ospiti** (precompilati se già giocata) → **Salva** → `recordResult` → `renderViews` (calendario + classifiche aggiornati). Se giocata, la riga match mostra il punteggio.
- **`renderCalendar`**: se il match è giocato, mostra `home S–S away` (es. "ASD Aurora 2–1 GS Rivalta"); quando `editable`, aggiunge il pulsante "Risultato" accanto a "Modifica". Con `editable=false` (E3) niente pulsanti, ma il punteggio è visibile.
- **E3 pubblico**: `calendar.html` mostra i punteggi; `standings.html` mostra la classifica coi punti veri e riordinata (read-only) — nessuna modifica al gating.

## Revisione Blueprint

**D-O8-1** (`o8-live-operations.md`): registrare il risultato di un match (`MatchResultRecorded`) ricalcola la `Standing` (O6) da Initialized a Recomputed, applicando punti (3/1/0) e tie-break (punti → differenza reti → gol fatti). Cronaca live minuto-per-minuto, referto ricco e disciplinari (CP12) rimandati.

## Criteri di successo

1. Inserendo i punteggi di alcuni match di un girone, la classifica di quel girone mostra punti/V-N-P/GF-GS/DR reali e si **riordina** per ranking.
2. Il punteggio compare sulla riga del match nel calendario E1 e nel calendario pubblico E3.
3. Correggere un risultato ricalcola correttamente; "Reset demo" riporta tutto a 0/non-giocato.
4. E1/E3 restano coerenti; test verdi (recompute punti + tie-break + partita non giocata esclusa).

## Fuori scope / futuro

O8b (avanzamento finali/segnaposto); cronaca live; disciplinari; referto E2 mobile; forfait/rinuncia.
