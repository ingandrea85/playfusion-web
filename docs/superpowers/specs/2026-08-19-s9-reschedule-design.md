# S9 — Calendar editor / reschedule (O7) (design)

- **Date:** 2026-08-19
- **Slice:** S9 — Calendar editor / reschedule (O7)
- **Epic:** [#42](https://github.com/ingandrea85/playfusion-web/issues/42) · **Issues:**
  [#69 backend](https://github.com/ingandrea85/playfusion-web/issues/69) ·
  [#70 rest-client](https://github.com/ingandrea85/playfusion-web/issues/70) ·
  [#71 e1-web editor](https://github.com/ingandrea85/playfusion-web/issues/71) ·
  [#72 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/72)
- **ADR:** ADR-002, ADR-008. Extends S7 (o7-scheduling). Blueprint D-O7-3 (manual reschedule).
- **Reference:** mockup `docs/superpowers/specs/2026-07-17-calendar-editor-design.md` (the mockup
  skipped conflict detection; **S9 adds it**, per issue #42).
- **Branch:** `feature/s9-reschedule` (off `stage` @ `6d39b06` = S8).

## Goal
Let the organizer reschedule a single group match (day/time/field) in place — reschedules happen
mid-tournament — without regenerating. Reflected in the public E3 calendar (read-only). This is
distinct from the mass regenerate that S7 locks after APPROVED.

## Key decisions
1. **Conflict = same (day, time, field) as another match** → the reschedule is **blocked with a
   409 SLOT_CONFLICT** (issue #42: "riprogrammate senza conflitti"). The editor keeps the panel
   open and shows the clash.
2. **Allowed in any status** (incl. PUBLISHED) and **does not change status** (D-O7-3). Only
   requires the match to exist.
3. **`renderCalendar` gains `editable`** (default false) so E3 is untouched; only E1 renders the
   per-match "Modifica" control.

## Design by sub-issue
### S9.1 — Backend (o7)
- `domain.ts` — pure `slotConflict(matches, matchId, patch): boolean` (another match with the same day+time+field).
- `errors.ts` — `MatchNotFoundError` (404), `SlotConflictError` (409).
- `ports.ts` — `MatchRepository` unchanged (list + replace suffice: read all, patch one, replace).
- `application/reschedule-match.ts` — find by id (404), conflict check (409), apply patch, `replace`, return the match.
- `handler.ts` — `PUT /events/:id/matches/:matchId` (organizer), body `{day,time,field}`.

### S9.2 — rest-client
- `o7.ts` — `rescheduleMatch(id, matchId, {day,time,field})` → PUT `/o7/events/:id/matches/:matchId`.

### S9.3 — e1-web
- `libs/app-shell/src/chrome.ts` — `renderCalendar(matches, catName, editable=false)`; when editable each `.pf-match` gets a `js-editmatch` button.
- `apps/e1-web/src/views/schedule.ts` — calendar rendered editable; an `#editmatch` panel (field select from `config.fields`, day, time) opens on Modifica; Salva → `o7.rescheduleMatch` → refresh; a 409 shows an inline conflict error.
- E3 `calendar.ts` unchanged (editable defaults off).

### S9.4 — E2E + collaudo
- `test/e2e/s9-reschedule.e2e.test.ts`: generate → reschedule a match to a free slot (assert changed in GET matches) → reschedule into an occupied slot → 409.
- `cdk deploy` stg (o7 handler), run E2E; merge, tag `stg-s9`, push, monitor.

## Out of scope
Drag-and-drop; reschedule notifications; editing finals matches; conflict *auto-resolution*.

## Git / deploy
Commit per sub-issue on `feature/s9-reschedule`; merge to `stage`, tag `stg-s9`, push, `cdk deploy` stg — authorized.
