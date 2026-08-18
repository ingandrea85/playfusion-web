# S8 — Gironi editor (O6) (design)

- **Date:** 2026-08-19
- **Slice:** S8 — Gironi editor (O6)
- **Epic:** [#41 S8 — Gironi editor [O6]](https://github.com/ingandrea85/playfusion-web/issues/41)
- **Issues:** [#64 S8.1 o3 gironi model](https://github.com/ingandrea85/playfusion-web/issues/64) ·
  [#65 S8.2 o7 integration](https://github.com/ingandrea85/playfusion-web/issues/65) ·
  [#66 S8.3 rest-client](https://github.com/ingandrea85/playfusion-web/issues/66) ·
  [#67 S8.4 e1-web editor](https://github.com/ingandrea85/playfusion-web/issues/67) ·
  [#68 S8.5 E2E + collaudo](https://github.com/ingandrea85/playfusion-web/issues/68)
- **ADR:** ADR-002 (REST + Lambda-per-BC, no cross-BC code import), ADR-008 (rest-client seam),
  S1.1 read-model strategy. Follows **S6's decision that O6 competition config lives on the o3
  event** (2026-08-18-s6-competition-config-design.md) — extends it, no new BC.
- **Reference (not the build target):** the mockup gironi design
  (`docs/superpowers/specs/2026-07-17-gironi-editor-design.md`, model `GroupSlot`/`resolveGroups`).
- **Branch:** `feature/s8-gironi` (off `stage` @ `c30f039` = S7).

## Goal

Make the group composition **explicit and editable**. Today S7 derives gironi with `i %
groupsCount` inside the generator. S8 lets the organizer **draw** groups (auto round-robin
seed from confirmed teams), **move** teams between groups, and **lock** the composition. The
S7 calendar then builds from the composed gironi; it is also the base for S10 standings / S12
finals.

### Acceptance (from the epic)
- Gironi created + persisted; the generated calendar reflects the composition; base for S7/S10.

## Key decisions
1. **Gironi live on the o3 event** (per S6): `gironi?: Record<categoria, CategoryGironi>` added
   additively to the `SportEvent` item — DynamoDB is schemaless, the read-model spreads rest, so
   pre-S8 events stay valid and `getEvent` already returns it.
2. **Draw is server-side** (R6 — no FE business logic): `o3` gains an `HttpTeamSource` that reads
   o5 confirmed registrations (same HTTP pattern as o7), splits round-robin, persists.
3. **o7 consumes the composition** (S8.2): `buildFixtures` is refactored to take *resolved groups*;
   `generate` uses the explicit o3 composition when present, else S7's auto-split (`config.groupsCount`).
   So the editor is not inert — composing changes the calendar.
4. **Lock semantics** = the mockup's: draw is a no-op while locked; move/lock go through a plain
   save (the editor disables moves when locked). Unbalanced groups are allowed.

## Model (on the o3 SportEvent)
```
interface Group { label: string; teams: string[] }          // label 'Girone A'…, teams = participantRef
interface CategoryGironi { groups: Group[]; locked: boolean }
type GironiMap = Record<string /* categoria */, CategoryGironi>
SportEvent += { gironi?: GironiMap }
```

## Design by sub-issue

### S8.1 — Backend (o3)
- `src/gironi.ts` — `Group`/`CategoryGironi`/`GironiMap` + pure `autoDraw(teams, groupsCount): Group[]`
  (round-robin `i % n`, labels `Girone A..`).
- `src/ports/{gironi-repository,team-source}.ts` — `GironiRepository { get(eventId), putCategory(eventId, categoria, cg) }` (read-modify-write on the o3-events item), `TeamSource { confirmedByCategory(eventId) }`.
- `src/adapters/{dynamodb-gironi-repository,http-team-source}.ts`.
- `src/application/{draw-gironi,save-gironi,get-gironi}.ts`.
- `src/handler.ts` — `POST /events/:id/gironi:draw` + `PUT /events/:id/gironi/:categoria` (organizer),
  `GET /events/:id/gironi` (public). `domain.ts`/`read-model.ts` carry `gironi?` through.

### S8.2 — o7 integration
- `services/o7-scheduling/src/domain.ts` — `FixtureCategory` becomes `{ id, name, legs, groups: {label,teams}[] }`.
- `fixtures.ts` — `buildFixtures` iterates resolved groups (drops the internal split).
- `application/generate-schedule.ts` — resolve per category: o3 `gironi[categoria].groups` if non-empty, else `autoSplit(confirmedTeams, config.groupsCount)`; `EventView` gains `gironi?`.
- Update S7 `fixtures.test`/`generate-schedule.test` to the new shape (auto case behaviourally identical).

### S8.3 — rest-client
- `o3.ts`: `getGironi(id)`, `drawGironi(id, categoria, groupsCount)`, `saveGironi(id, categoria, groups, locked)` + DTOs in `types.ts`.

### S8.4 — e1-web
- `views/gironi.ts` — category tabs; a groupsCount input + **Sorteggia gironi**; per-group columns
  with a per-team "Sposta in…" select; **Blocca gironi** toggle. Draw/move/lock → o3 seam → `ctx.refresh()`.
- **Gironi** workspace tab (between Categorie and Calendario) + route `#/events/:id/gironi`.

### S8.5 — E2E + collaudo
- `test/e2e/s8-gironi.e2e.test.ts` (skip-gated): create → open window → confirm ≥4 teams → draw (2 groups) →
  assert composition → move a team → generate → assert a match reflects the moved team's group → lock.
- `cdk deploy` stg (o3 handler + hosting), run E2E green; merge to stage, tag `stg-s8`, push, monitor.

## Out of scope (YAGNI)
- Drag-and-drop; automatic balancing; a dedicated o6 BC (deferred — O6 stays on o3 per S6);
  re-flowing already-generated finals on recomposition beyond regenerate.

## Git / deploy
- Commit per sub-issue on `feature/s8-gironi`; merge to `stage`, tag `stg-s8`, push, `cdk deploy` stg — authorized.
