# Scheduling: festival pools, per-group field, finalissima field — Design Spec

**Date:** 2026-09-10
**Component:** o7-scheduling (generator + fixtures) + o3-sport-events (gironi composition) + e1-web (Gironi/Calendario)
**Status:** Approved for planning

## 1. Overview

Three organizer options for how matches are placed, delivered as three deployable slices:

- **A — Field per group (girone/pool):** a girone (or festival pool) can be pinned to ONE field; all its matches play there (serialized), instead of round-robining over the category's fields. Unset → today's behavior.
- **B — Festival pools:** a festival category can optionally be split into POOLS (explicit composition, like gironi) whose teams play a round-robin **within** the pool — still non-competitive (phase `FESTIVAL`, no standings, no finals). Off → today's rotation (`rotationPairs`).
- **C — Finalissima field:** an event-level field (the same for every category) onto which only the **1st/2nd place final** of each category is placed, **serialized in real time** across categories.

## 2. Confirmed decisions (from brainstorming)

1. **Pools = explicit composition** (reuse the o3 gironi composition; the E1 "Gironi" tab is shown as "Pool" for a festival with pools).
2. **Field per group = a single field** (fallback to the category fields when unset).
3. **Finalissima = only the 1º/2º final**, one shared field across categories, serialized (matches placed one after another by real end time).
4. Backward compatible: no field / no pools / no finalissima → identical to today.

## 3. Known complexity (flagged)

`placeMatches` (o7 fixtures) assigns slots keyed by `placeKey = fields.join('|')@slotMinutes` using a slot-INDEX model (uniform `slotMinutes` per key). This is safe when a field is used only within one category. Two categories pinned to the **same physical field with different durations** would double-book (different keys → both think the field is free). Therefore:
- **A** keeps field pinning **within a category** (uniform duration) — no double-booking.
- **C** does NOT reuse the slot-index model for the shared field: it serializes the 1º/2º finals by **real time** in a dedicated pass.
- **Out of scope (documented limitation):** pinning the *same physical field* to groups of *different categories* in slice A. The UI offers only that category's fields; cross-category sharing is not offered (only the finalissima is cross-category, handled by C).

## 4. Data model

### o3 gironi composition (group gains a field) — slices A & B
`ResolvedGroup` (o7 domain) + the o3 stored group gain `field?: string`:
```ts
export interface ResolvedGroup { label: string; teams: string[]; field?: string }
```
The o3 gironi PUT (compose gironi) accepts an optional `field` per group; rest-client mirrors it.

### Festival pools flag — slice B
`ScheduleConfig` gains `festivalUsePools?: boolean` (event-level; default false). When true, a festival event's fixtures come from its o3 gironi composition (the "pools") instead of `rotationPairs`.

### Finalissima field — slice C
`ScheduleConfig` gains `finalissimaField?: string` (event-level, like `finalsDate`).

All three fields are optional; their absence = today's behavior.

## 5. Engine (o7)

### Slice A — field per group (`fixtures.ts` `buildFixtures`)
Today every group of a category shares one `place = { fields: cat.fields, slotMinutes }`. Change: compute the `place` **per group**:
```ts
for (const group of cat.groups) {
  const groupFields = group.field ? [group.field] : (cat.fields.length ? cat.fields : ['Campo 1'])
  const place: Placement = { fields: groupFields, slotMinutes }
  for (const [home, away] of pairs(group.teams)) { raw.push({ ...place }) ... }
}
```
`placeKey` already partitions by field set, so a pinned group serializes on its field (F=1) while unpinned groups keep sharing the category grid. `FixtureCategory.groups` items carry the optional `field`.

### Slice B — festival pools (`generate-schedule.ts` festival branch)
When `event.format === 'festival'`:
- If `config.festivalUsePools` AND the category has a non-empty gironi composition → build `FixtureCategory` with `groups = composed pools` (each `{label, teams, field?}`) and generate via `buildFixtures` tagging every match `phase: 'FESTIVAL'` (a `phase` param threaded through buildFixtures/RawMatch — already supported by `placeMatches`). No `buildFinalMatches`. Standings still skip FESTIVAL.
- Else → today's `buildFestivalFixtures` (`rotationPairs`).
`buildFixtures` gains an optional `phase?: MatchPhase` applied to every emitted match (default undefined = GROUP).

### Slice C — finalissima field (`generate-schedule.ts` `buildFinalMatches`)
After the per-category finals draws are computed:
- Identify each category's **1º/2º final** = the FINAL draw with `placementFrom === 1 && placementTo === 2`.
- If `config.finalissimaField` is set: exclude those draws from the normal per-category placement and, in a **dedicated serial pass**, place them on `finalissimaField` one after another by real time: `time_k = max(finalsStart_k, prevEnd)`, then `prevEnd = time_k + slotMinutes(category_k)`; ordered by category (event.categorie order). Each such match gets `field: finalissimaField`.
- The rest of the finals keep their current per-category field placement.
- Unset → unchanged.

## 6. UI (e1-web)

### Gironi/Pool tab (slice A + B)
- Each girone/pool row gains a **Campo** `<select>` (options = the category's fields + "Auto (rotazione)"). Saving persists `group.field` via the o3 gironi PUT.
- For a **festival**: the "Gironi" tab is shown as **"Pool"** and re-enabled in `workspaceTabs` only when `config.festivalUsePools` is true. A toggle **"Suddividi in pool"** in the Calendario config sets `festivalUsePools`.

### Calendario config (slice C)
- A **"Campo finalissima"** input (event-level, one for all categories), near the finals date. Persists `config.finalissimaField`.

## 7. Handler / rest-client

- o3: gironi compose PUT zod accepts `field?` per group; `getGironi` returns it. rest-client `GironiMap` group type gains `field?`.
- o7: `scheduleConfigBody` zod accepts `festivalUsePools?: boolean`, `finalissimaField?: string`; `ScheduleConfig`/rest-client mirror them.

## 8. Testing

**Slice A (o7 fixtures):** a group with `field` places ALL its matches on that field (serialized, distinct times); unpinned groups keep the category rotation; backward-compat byte-identical when no field.

**Slice B (o7 generate):** festival + `festivalUsePools` + composed pools → round-robin WITHIN pools, every match `phase FESTIVAL`, no finals, standings empty; without the flag → `rotationPairs` unchanged. A pool with a `field` serializes there (reuses A).

**Slice C (o7 finals):** with `finalissimaField`, each category's 1º/2º final lands on that field with non-overlapping real times ordered by category; other finals unchanged; unset → unchanged.

**UI:** Gironi/Pool field select renders + saves; festival pool toggle re-enables the tab; finalissima field input saves. **rest-client:** the mirrored fields.

## 9. File map

- `services/o7-scheduling/src/domain.ts` — `ResolvedGroup.field?`; `ScheduleConfig.festivalUsePools?/finalissimaField?`; `categoryConfig` default branch.
- `services/o7-scheduling/src/fixtures.ts` — per-group `place`; `buildFixtures` `phase?` param; `FixtureCategory`/group `field?`.
- `services/o7-scheduling/src/application/generate-schedule.ts` — festival-pools branch; finalissima serial pass; thread group `field`.
- `services/o7-scheduling/src/handler.ts` — zod for the new config fields.
- `services/o3-sport-events/src/…` — gironi group `field?` (domain + compose zod + read).
- `libs/rest-client/src/types.ts` — mirror `ResolvedGroup.field?`, `ScheduleConfig.festivalUsePools/finalissimaField`, `GironiMap` group `field?`.
- `apps/e1-web/src/views/gironi.ts` — per-group field select; pool relabel for festival.
- `apps/e1-web/src/views/schedule.ts` — "Suddividi in pool" toggle + "Campo finalissima" input.
- `apps/e1-web/src/views/workspace.ts` — `workspaceTabs`: show Pool tab for festival-with-pools.

## 10. Delivery — 3 slices
- **Slice A** (field per group): domain+fixtures+o3 gironi field + rest-client + Gironi field select. Tag `stg-group-field`.
- **Slice B** (festival pools): config flag + generate-schedule pools branch + festival Pool tab/toggle. Tag `stg-festival-pools`.
- **Slice C** (finalissima): config field + finals serial pass + Calendario input. Tag `stg-finalissima-field`.
