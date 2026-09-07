# Festival (non-competitive) event format — Design

**Date:** 2026-09-08
**Status:** Design — approved in brainstorming
**Scope:** Add a fourth event format, `festival`, for non-competitive gatherings ("concentramento / Feste del Rugby"): each team plays a fixed number of matches with field rotation, **no standings, no finals, no winner**. The generated calendar remains editable (existing reschedule). This slice delivers only the base non-competitive festival.

## Context & motivation

Inspired by the FIR "Feste del Rugby" minirugby model: a host club welcomes other clubs; each category plays a set number of matches; "si gioca *con*, non *contro*" — no rankings, focus on participation. PlayFusion today is competition-centric (groups/standings/finals). A festival format opens the youth/grassroots/federation segment (which today uses spreadsheets) with a small technical delta: reuse the scheduler, drop standings/finals.

**Existing architecture (grounding):**
- The event **format** lives on the o3 `SportEvent`: `'groups' | 'groups+bracket' | 'bracket'` (Epic #143), mirrored into o7 `EventView.format`. `'bracket'` is already special-cased everywhere (hides gironi/standings, skips finals).
- o7 `generateSchedule` branches on format; the else-branch resolves groups and calls `buildFixtures` (full round-robin via `pairs()`) + `buildFinalMatches`.
- Standings are computed **on read** by `computeStandings`, which already **skips `phase === 'FINAL'`** matches.
- Finals are off simply by not generating FINAL matches (the finals tab is data-driven).
- Views (E1 `workspaceTabs`, E3 `landing`/`main`) gate standings/gironi on `format === 'bracket'`.

## Approach (decided)

Add `festival` as the **fourth `format` value**, reusing the same special-casing pattern as `bracket`. Rejected: a separate `competitive: false` flag — it touches the same points but can't reuse the existing format gates, so it's less clean.

## Decisions

- **Match generation:** auto-rotation (circle method) — the organizer sets **N** ("each team plays N matches"); the generator produces N rounds where each team meets distinct opponents. The generated calendar is then **editable** via the existing reschedule flow (day/time/field).
- **N config:** a global `festivalMatchesPerTeam` (default `3`) on `ScheduleConfig`, with an optional per-category override via the existing `byCategory` map.
- **Results:** recordable but **never ranked** — festival matches carry `phase: 'FESTIVAL'`, which `computeStandings` skips. Scores may still be entered (field director) for record, but no standings ever appear.
- **Categories:** unchanged (free strings). Age-category templates (U6/U8/U10/U12) are out of scope.

## 1. Config

- `services/o3-sport-events/src/domain.ts` — extend `SportEvent.format` union with `'festival'`.
- `services/o3-sport-events/src/handler.ts` — add `'festival'` to the `format` zod enum.
- `services/o7-scheduling/src/ports.ts` — extend `EventView.format` with `'festival'`.
- `services/o7-scheduling/src/domain.ts` — add `festivalMatchesPerTeam?: number` to `ScheduleConfig` (top-level default) and to `CategorySchedule` (per-category override); resolve it in `categoryConfig` like the other per-category fields.
- `services/o7-scheduling/src/handler.ts` — add `festivalMatchesPerTeam` to the schedule-config zod (`z.number().int().positive().optional()`), top-level and per-category.
- `apps/e1-web/src/views/create-event.ts` — add the format label `'festival': 'Festival (non competitivo)'`.

## 2. Match generation

- `services/o7-scheduling/src/fixtures.ts` — new **pure** generator `rotationPairs(teams: string[], n: number): Array<[string, string]>` (circle method): produces up to `min(n, teams.length - 1)` rounds; each team plays distinct opponents; odd team count yields a rotating bye. Returns unordered pairs. Existing `pairs()` is untouched.
- `services/o7-scheduling/src/application/generate-schedule.ts` — new branch `event.format === 'festival'`:
  - for each category, take the confirmed teams (no groups), call `rotationPairs(teams, festivalMatchesPerTeam)`,
  - feed the pairs into the **existing placement engine** (slot/day/field greedy, anti-conflict), producing `ScheduledMatch` with `phase: 'FESTIVAL'`, a neutral `groupLabel` (`''`), and no bracket fields.
  - do **NOT** call `buildFinalMatches`.
- `services/o7-scheduling/src/domain.ts` — `ScheduledMatch.phase` union gains `'FESTIVAL'` (currently includes `GROUP`/`FINAL`/`FINAL_GROUP`-style values; add `FESTIVAL`).

To reuse the placement engine cleanly, **extract** the greedy slot/day/field placement loop from `buildFixtures` into a helper `placeMatches(cats, pairsByCat, startDate, endDate, dailyStart)` that both the round-robin path and the festival path call. The round-robin behavior must stay byte-identical (regression-guarded by the existing schedule tests).

## 3. Standings off (engine-level)

- `services/o7-scheduling/src/standings.ts` — `computeStandings` skips `m.phase === 'FESTIVAL'` (extend the existing `phase === 'FINAL'` skip). Result: no standings are ever produced for festival matches, even if scores are recorded.

## 4. Finals off

Free: the festival branch never generates FINAL matches, so the data-driven finals tab/section stays hidden. No code beyond §2.

## 5. Views (Calendar only)

- **E1** `apps/e1-web/src/views/workspace.ts` — extend the format gate so `festival` hides `gironi`, `standings`, and `finals` (today only `bracket` hides gironi+standings). Keep Overview, Categorie, **Calendario**, Risorse, Avvisi, Sito, Iscrizioni, Partecipanti.
- **E3** `apps/e3-web/src/views/landing.ts` — for `festival`, show only Calendario (+ Squadre/Avvisi); hide Classifiche and Tabellone/Formula.
- **E3** `apps/e3-web/src/main.ts` — for `festival`, redirect the standings and bracket routes to the calendar (like `bracket` redirects today).
- **Calendar filter:** the E3 public calendar's `Gironi | Finali` sub-filter is not pertinent to festival. For a festival event the calendar renders a **plain match list** grouped by day/field, with the `Gironi | Finali` phase filter **suppressed** (pass a flag to the shared calendar renderer so it omits the phase tabs when the event is festival). The Finali tab is already data-driven and absent (no FINAL matches).
- **Editing:** the existing reschedule flow (o7 reschedule endpoint + E1 schedule view) applies unchanged to festival matches.

## 6. Testing

- Unit `rotationPairs`: N=3 over 6 teams → each team in exactly 3 pairs, no repeated opponent; odd team count (5 teams, N=3) → each team ≤3 matches with a rotating bye; N capped at `teams-1` (e.g. N=5 over 4 teams → 3).
- Unit `generateSchedule` festival branch: festival event → matches all `phase: 'FESTIVAL'`, count per team matches N, **zero** FINAL matches; placement respects the one-match-per-team-per-slot constraint.
- Unit `computeStandings`: festival matches (with scores) produce **no** standings rows.
- Unit views: E1 `workspaceTabs('festival')` excludes gironi/standings/finals; E3 `landing` for festival shows only Calendario (+ Squadre/Avvisi).

## Out of scope (follow-ups)

- **"Squadre a colori"** (pool players from multiple clubs → balanced mixed teams) — a distinct future format.
- **Age-category templates** (U6/U8/U10/U12 quick-add) — pure UI, separate.
- **Referto / participation / playing-time tracking** — separate slice.
- Nothing here changes the competitive formats (`groups`/`groups+bracket`/`bracket`).
