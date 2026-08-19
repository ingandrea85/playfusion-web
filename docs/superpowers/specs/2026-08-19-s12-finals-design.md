# S12 — Finals brackets + qualifier resolution (O6/O8) (design)

- **Date:** 2026-08-19
- **Slice:** S12 — Finals brackets + qualifier resolution · **Epic:** [#45](https://github.com/ingandrea85/playfusion-web/issues/45)
- **Issues:** [#105 o3](https://github.com/ingandrea85/playfusion-web/issues/105) ·
  [#106 o7](https://github.com/ingandrea85/playfusion-web/issues/106) ·
  [#107 rest-client](https://github.com/ingandrea85/playfusion-web/issues/107) ·
  [#108 e1](https://github.com/ingandrea85/playfusion-web/issues/108) ·
  [#109 e3](https://github.com/ingandrea85/playfusion-web/issues/109) ·
  [#110 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/110)
- **ADR:** ADR-002, ADR-008. Extends S6 (competition config on o3), S8 (gironi), S10/S11 (standings +
  ranking), S25/S26 (director + match lifecycle). Ports the mockup-era designs
  `2026-07-17-finals-bracket-design.md` + `2026-07-17-o8b-finals-qualifiers-design.md`.
- **Branch:** `feature/s12-finals` (off `stage` @ S11).

## Goal
From the group qualifiers, generate the **finals bracket with placeholders** per category (from the
event's `finalsType`), scheduled on a global `finalsDate` with time/field. Finals are **real matches**
directors and the organizer play (results, start/finish — reusing S26). As groups complete, the
`Nª Girone X` placeholders **resolve to the real ranked team** everywhere they appear (calendar,
director, bracket), reusing the S11 ranking and **blocked while the position is in an S11 `unresolved`
tie**.

## Decisions locked in brainstorming (2026-08-19)
- **Finals are `ScheduledMatch` (unified), not a separate entity.** A match gains `phase: 'GROUP' |
  'FINAL'` (default GROUP for legacy) + bracket metadata (`bracketLabel`, `round`, `order`). This reuses
  `recordResult`/start/finish/cancel, the per-field director scoping (S25), `renderCalendar`, and the
  standings machinery — no new table, finals live in the same `o7-matches` array.
- **Winner propagation is S13.** S12 resolves only `Nª Girone X` qualifiers; `Vincente <round><n>` stays
  a placeholder. (Third place / shootouts also S13.)
- **Placeholders shown everywhere, populated progressively.** Resolution is computed **on read**
  (idempotent, self-correcting); the stored match keeps the placeholder in `home`/`away`, and reads add
  `homeResolved`/`awayResolved` when the qualifier is known.
- **Finals config = dedicated editor in the Competizione tab** (o3 `PUT /events/:id/finals-config`),
  editable post-creation. **Consequence:** changing `finalsType`/`qualifiersPerGroup` after generate does
  NOT rebuild the bracket — regenerate the calendar (blocked once APPROVED). The editor shows this hint.
- **Finals scheduling:** `day = finalsDate`, `time`/`field` sequential per category from `dailyStart`,
  **no conflict-check** (declared simplification, as in the mockup).

## Design by sub-issue

### S12.1 — o3 O6 finals config (#105)
- `domain.ts`: `FinalsType = 'SINGLE_GROUP_CROSSOVER' | 'SPLIT_GROUP_FINALS' | 'PLACEMENT'`; `SportEvent`
  += `finalsType?`, `qualifiersPerGroup?` (additive/optional).
- read-model exposes both; default `qualifiersPerGroup` to 2 on read.
- application `setFinalsConfig` (read-modify-write the event item, mirroring the gironi save).
- `handler.ts`: `PUT /events/:id/finals-config` (organizer) body `{ finalsType, qualifiersPerGroup:int≥1 }`.
- Tests: RMW persist, read default, endpoint auth.

### S12.2 — o7 finals engine + generate + resolve-on-read (#106)
- `domain.ts`: `MatchPhase = 'GROUP' | 'FINAL'`; `ScheduledMatch` += `phase?` (absent ⇒ GROUP),
  `bracketLabel?`, `round?`, `order?`, and read-only `homeResolved?`/`awayResolved?`. `ScheduleConfig`
  += `finalsDate?`.
- `finals.ts` (pure, port of `mockups/shared/mock/finals.ts`): `buildFinals(gironi, qualifiersPerGroup,
  finalsType) → FinalDraw[]` (`{ bracketLabel, round, order, home, away }`); `singleElim` (Finale=2 /
  Semifinali=4 / Quarti=8 …, `Vincente <rs><n>` for later rounds); the 3 finalsType shapes.
- `standings.ts`: `computeStandings` **skips `phase === 'FINAL'`** (finals never affect the table nor
  create team rows).
- `resolve-finals.ts` (pure): `resolvePlaceholders(matches, standings) → ScheduledMatch[]` — for each
  FINAL match, resolve a `^(\d+)ª (Girone .+)$` placeholder to the ranked team **iff** its group is
  complete (all counted) **and** position N is not inside any `unresolved` set; else leave it. Never
  resolves `Vincente …` (S13).
- `generate-schedule.ts`: after fixtures, per category `buildFinals(resolvedGironi, qualifiersPerGroup,
  finalsType)` (from o3 via `EventSource`; add `finalsType`/`qualifiersPerGroup` to `EventView`), map to
  `ScheduledMatch{ phase:'FINAL', status:'SCHEDULED', day:finalsDate ?? dates.to, time/field sequential
  per category, home/away = placeholder }`, **append** to the fixtures array (single `replace`).
- `read.ts`: `listMatches` becomes resolution-aware when given deps (`{ overrides, events }`): computes
  standings then `resolvePlaceholders`; without deps returns raw (keeps S9/S10/S26 callers green).
  `handler.ts` `GET /events/:id/matches` passes deps → calendar/director/bracket all get resolved finals.
- Result entry/lifecycle/director scoping: **reused unchanged** (finals are matches with a field).
- Tests: buildFinals 3 types; generate appends finals on finalsDate; resolvePlaceholders on complete
  group; unresolved tie blocks the slot; incomplete stays placeholder; `Vincente …` stays placeholder;
  computeStandings ignores finals; recordResult works on a FINAL match.

### S12.3 — rest-client (#107)
- o3 DTO += `finalsType`/`qualifiersPerGroup`; `o3.updateFinalsConfig(id, {...})` (PUT).
- `ScheduledMatchView` += `phase`, `bracketLabel`, `round`, `order`, `homeResolved`, `awayResolved`;
  `ScheduleConfig` += `finalsDate`. (No new endpoint — finals ride `getMatches`.)
- Tests: PUT path/body; view carries the new fields.

### S12.4 — e1-web (#108)
- app-shell `renderBracket(finals, catName)` — group `bracketLabel → round`, each line
  `time · field · (homeResolved ?? home) vs (awayResolved ?? away)`; read-only; shared with E3.
- `renderCalendar` becomes phase-aware: FINAL rows show `homeResolved ?? home` + a round/bracket label
  so finals are recognizable inline among the group fixtures.
- Competizione tab: editor `finalsType` (select) + `qualifiersPerGroup` (number) + Salva →
  `o3.updateFinalsConfig` → refresh; "rigenera il calendario per applicare" hint.
- **Finali** section (selected category, `renderBracket` over `phase==='FINAL'` matches) in the workspace.
- **Data finali** `<input type=date>` in the Calendario config card → `finalsDate` in generate.
- Result entry on finals already works (finals are matches) — verify the panel opens on FINAL rows.
- Tests: editor save; bracket renders placeholder + resolved; calendar shows a FINAL row labelled.

### S12.5 — e3-web (#109)
- `views/bracket.ts` public Tabellone (gated on PUBLISHED, `phase==='FINAL'` from `getMatches`) +
  category tabs + `renderBracket`; landing gains a **Tabellone** link when published.
- Public calendar + **director view** show finals for free (they're matches); director reports FINAL
  results on their field via the existing S25/S26 flow. Verify placeholders/resolved render there.
- Tests: bracket gating + render; director list includes a FINAL row on the field.

### S12.6 — E2E + collaudo (#110)
- E2E on stg: set finals-config → generate → matches include FINAL rows with placeholders; complete a
  group with no tie → the `Nª Girone` slots resolve to the ranked teams (in `getMatches`); an S11
  unresolved tie → the slot stays a placeholder; a director/organizer records a FINAL result and it does
  NOT move the group standings.
- build; cdk deploy stg; merge → `stage`; tag `stg-s12`; push; monitor `deploy-stage` (explicit auth).

## Out of scope (S13)
Winner propagation (`Vincente …`), third place, shootouts; graphical bracket tree; finals slot-conflict
prevention; re-seeding / best-losers.
