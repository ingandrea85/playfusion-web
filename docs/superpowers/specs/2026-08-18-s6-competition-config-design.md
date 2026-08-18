# S6 — Competition config (O6) (design)

- **Date:** 2026-08-18
- **Slice:** S6 — Competition config (O6)
- **Epic:** [#39 Competition config + Crea evento completo](https://github.com/ingandrea85/playfusion-web/issues/39)
- **Issues:**
  [#55 S6.1 Backend contract](https://github.com/ingandrea85/playfusion-web/issues/55) ·
  [#56 S6.2 Create-event form](https://github.com/ingandrea85/playfusion-web/issues/56) ·
  [#57 S6.3 Panoramica + tabs](https://github.com/ingandrea85/playfusion-web/issues/57) ·
  [#58 S6.4 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/58)
- **ADR:** ADR-002 (REST + Lambda-per-BC), ADR-008 (rest-client seam), ADR-011 (monorepo/boundaries),
  S1.1 read-model strategy (per-BC direct query, denormalize on write).
- **Branch:** `feature/s6-competition-config` (off `stage` @ `3ef92e1`, which carries S0–S5).

## Goal

Bring **event creation** from today's reduced form (sport / categorie / date range) up to the
mockup: choose the **Playbook (PB-1 | PB-2)**, capture event **name / location / start
date+time / end date**, and edit the **tie-break policy** (reorderable, toggleable criteria).
Persist this competition config on the `o3` event and surface it read-only in the workspace
(**Panoramica** + **Competition** + **Categorie** tabs). The Playbook choice is recorded so it
can gate the later flow (PB-2 → S14).

### Acceptance criteria (from the issues)
- **S6.1** the `o3` event contract carries `name/location/startTime/tieBreak/playbook`; a
  full-config create round-trips through `getEvent`; old-shape creates still work (defaults).
- **S6.2** the create-event form offers the Playbook selector and a reorderable/toggleable
  tie-break editor; submit sends the full `CreateEventInput`.
- **S6.3** Panoramica shows the persisted config; Competition + Categorie tabs render.
- **S6.4** organizer creates a PB-1 event with a custom tie-break → fields persisted → visible
  in Panoramica; E2E green locally and against real AWS stg.

## Key decision — additive contract (no breaking change)

`event.dates.{from,to}` is read in **6 places** (e1 dashboard, e1 workspace/enroll/participants
heroes, e3 landing). So the date model stays: `dates.from` = start date, `dates.to` = end date.
New fields are **added** alongside, all optional except `playbook` (defaults `PB-1`). Old events
without the new fields keep rendering.

```
SportEvent {
  sportEventId, organizationId, sport, categorie[], dates{from,to}, status
  + name?: string
  + location?: string
  + startTime?: string        // "HH:mm"
  + tieBreak?: TieBreakCriterion[]
  + playbook: 'PB-1' | 'PB-2'  // defaults 'PB-1'
}
type TieBreakCriterion = 'HEAD_TO_HEAD' | 'GOAL_DIFFERENCE' | 'GOALS_FOR'
```

## Design by sub-issue

### S6.1 — Backend: extend `o3` event contract + persistence
- **`services/o3-sport-events/src/domain.ts`** — add the fields above + `TieBreakCriterion`.
- **`services/o3-sport-events/src/handler.ts`** — extend the zod body: `name`, `location`,
  `startTime` optional strings; `tieBreak` optional array of the criterion enum; `playbook`
  enum defaulting `'PB-1'`. Persist all in the `PutCommand`. Add them to the `EventPublished`
  payload.
- **`services/o3-sport-events/src/read-model.ts`** — widen `EventDetail`/`EventSummary`
  (they `strip` org and spread the rest, so no logic change).
- **`libs/rest-client/src/types.ts`** — mirror onto `CreateEventInput` and `EventDetail`.
- Tests: full-config create → `getEvent` returns every field; minimal create → `playbook` is
  `'PB-1'`, optional fields absent.

### S6.2 — Frontend: full create-event form
- **`apps/e1-web/src/views/tiebreak.ts`** (new) — `ALL_CRITERIA`, `defaultTieBreak(sport)`
  (Calcio → `HEAD_TO_HEAD, GOAL_DIFFERENCE, GOALS_FOR`; generic → `GOAL_DIFFERENCE, GOALS_FOR`),
  `criterionLabel(c)`. Ported from the mockup's `shared/mock/tiebreak.ts`.
- **`apps/e1-web/src/views/create-event.ts`** — add Playbook `<select>`, `name`, `location`,
  start date + `time`, end date; render the tie-break editor (fixed "Punti" first row, then
  ordered criteria with checkbox + ↑/↓). Local ordered list + enabled set mutate on
  reorder/toggle; `collect()` yields the active criteria in order. Submit builds the extended
  `CreateEventInput`.
- Tests extend `create-event.test.ts`: playbook + editor render; toggle/reorder change the
  collected policy; submit payload carries name/location/startTime/tieBreak/playbook.

### S6.3 — Panoramica + Competition/Categorie tabs (read-only)
- **`apps/e1-web/src/views/workspace.ts`** — `tabs()` adds `competition` and `categorie`.
  Panoramica renders a config card: name, location, `from HH:mm → to`, playbook badge, tie-break
  order (labels). Competition tab = the same config detail; Categorie tab = the category list.
  Heroes show `event.name` when present, else `sport · categorie`.
- Test: Panoramica shows persisted fields; the two tabs render their content.

### S6.4 — Acceptance E2E + collaudo AWS
- Skip-gated E2E (pattern from S4/S5): create a PB-1 event with a custom tie-break via the
  organizer flow, then read it back and assert the config persisted and appears in Panoramica.
- `cdk deploy` stg, run E2E green. PB-2 branch is recorded only (execution hook is S14).

## Out of scope (YAGNI)
- Editing categories / reconfiguring competition **after** creation (that is S8 gironi + later).
- Backend enforcement of tie-break during standings (S10/S11).
- Free-plan "1 active event" gate from the mockup (belongs to S20 account/subscription).

## Testing
- Unit: `nx test o3-sport-events`, `nx test rest-client`, `nx test e1-web`.
- Build: `nx run-many -t build`. E2E: skip-gated, run against stg in S6.4.

## Git / deploy scope
- Commit per sub-issue on `feature/s6-competition-config`; merge to **local** `stage`. No
  `git push`. `cdk deploy` only in S6.4 (stg collaudo).
