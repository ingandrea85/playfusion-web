# Custom finals formats — admin-authored, seed-based (SP1: backend + wiring)

**Date:** 2026-08-27
**Status:** design approved (brainstorming), ready for implementation plan
**Experiences:** E1 organizer (per-category finals selection) · admin (authoring — UI is SP2)
**BC:** O7 scheduling (finals live here)

## Problem

Today the finals of a category are auto-generated from a fixed choice: one of **three** built-in
formats (`PLACEMENT`, `SINGLE_GROUP_CROSSOVER`, `SPLIT_GROUP_FINALS`) + "teams to bracket", compiled
by the hardcoded `buildFinals` in `services/o7-scheduling/src/finals.ts`. Adding a new bracket shape
requires code + a deploy. The platform admin wants to **define new finals formats at runtime** — a
catalog of custom brackets that appear, alongside the built-ins, in the per-category "Fase finale"
selector. Only the platform admin authors/sees the catalog; every organizer can *use* the published
formats.

Scope of THIS spec = **SP1**: the domain model, the cross-group seeding resolver, the compiler, the
global store + admin gating, and the `generate`/selection wiring. The authoring **editor UI (SP2)** is
a separate slice; SP1 is fully testable by seeding a format via the API.

## Decisions (locked during brainstorming)

- A custom format is an **explicitly drawn bracket** (fixed slots), not adaptive rules.
- Qualifiers are referenced **by seed** (cross-group ranking: "best 1st, 2nd-best 1st, … best 2nd, …"),
  NOT by group letter. This is new resolution logic.
- **Approach A**: store a clean **declarative** format model and **compile** it to the internal `Draw[]`
  at generate time, reusing all existing finals machinery (bracket tree, winner/loser propagation,
  draw-decision on level KO, final standings). Do NOT store raw draws.
- Catalog is **global** (not per-tenant); authoring is gated to a new **`platform_admin`** role.
- Seeding rule (default): rank **by finishing position first, then performance** — all group winners
  ranked among themselves (points → GD → GF → …, reusing `ranking.ts`), then all runners-up, etc.

## Data model

New pure module `services/o7-scheduling/src/finals-format.ts`.

```ts
type SeedRef = { seed: number }                          // Seed n (1..N), cross-group ranking
type LinkRef = { winnerOf: string } | { loserOf: string } // Vincente/Perdente <slot>
type MatchRef = SeedRef | LinkRef

interface FormatMatch {
  slot: string            // unique within the format (e.g. 'SF1', 'F', '3P')
  home: MatchRef
  away: MatchRef
  placementFrom?: number  // 2-wide finals: winner→from, loser→to (from = to-1)
  placementTo?: number
}
interface FormatRound { name: string; matches: FormatMatch[] }        // 'Semifinali', 'Finale', 'Finale 3º/4º'
interface CustomFinalsFormat { id: string; name: string; seeds: number; rounds: FormatRound[]; createdAt: string }
```

**Validation** (`validateFormat`, pure — used by save and by the future editor):
- non-empty `name`, `seeds >= 2`, at least one round with at least one match;
- every `slot` unique across the whole format;
- `SeedRef.seed` ∈ 1..seeds;
- each `winnerOf`/`loserOf` references a slot defined in an **earlier** round (no forward refs, no cycles);
- placement pairs consistent: if `placementFrom`/`placementTo` present, `placementTo = placementFrom + 1`;
- (warn, non-blocking) a seed referenced more than once, or seeds 1..N not all used.
Invalid → `DomainError('INVALID_FORMAT', …, 422)`.

## Cross-group seeding (new, resolved on read)

New pure `seedRanking(groups: GroupStanding[]): string[]` in `finals-format.ts` (or `resolve-finals.ts`):
- for each finishing position `p = 1..maxPos`: take the p-th-placed team of **every** group, order that
  set among themselves with the existing tie-break comparators (`ranking.ts`: points → GD → GF → …);
- concatenate positions in order (all p=1, then all p=2, …) → the seed list; `Seed k` = index `k-1`.
- Returns only teams from **complete** groups (an incomplete group ⇒ its slots stay unresolved, exactly
  like the current `Nª Girone X` behaviour). If fewer than `k` seeds are resolvable, `Seed k` stays a
  placeholder.

`resolvePlaceholders` (in `resolve-finals.ts`) gains a branch: a `Seed k` placeholder resolves to
`seedRanking(...)[k-1]` when available; `Vincente/Perdente <slot>` keep their current resolution.

## Compiler

Pure `compileFormat(fmt: CustomFinalsFormat): FinalDraw[]` (same `FinalDraw` shape `buildFinals` emits):
- one `Draw` per `FormatMatch`: `bracketLabel: 'Tabellone'`, `round: round.name`, `order` (sequential),
  `slot`, `phase: 'FINAL'`, `placementFrom/To` passed through;
- `home`/`away` → placeholder strings: `SeedRef` → `Seed k`; `{winnerOf:s}` → `Vincente <s>`;
  `{loserOf:s}` → `Perdente <s>` (the exact tokens the resolver understands).
- **No undefined keys** written (the S13 DynamoDB hotfix rule): omit `placementFrom/To` when absent.

## Storage + admin gating

- **Global catalog table** `o7-finals-formats` (PK `formatId`) — one item per format. Infra: data-stack
  table + api-stack grant to the o7 handler + provision.ts (no GSI; small catalog, `Scan` for list).
- **Endpoints** on o7:
  - `GET /o7/finals-formats` — list (organizer-readable, to populate the selector);
  - `POST /o7/finals-formats` / `PUT /o7/finals-formats/:id` / `DELETE /o7/finals-formats/:id` —
    **`platform_admin` only**, body validated by `validateFormat`.
- **`requirePlatformAdmin`** middleware in `@playfusion/platform-lib` (mirrors `requireOrganizer`):
  passes only when the identity's roles include `platform_admin`. Auth0 note: the post-login Action must
  **preserve/add** `platform_admin` for the owner account (it currently forces `['organizer']`).

## generate integration + per-category selection

- `ScheduleConfig` (o7 + rest-client) gains `finalsFormatId?` at top level and in `byCategory[cat]`.
  A custom format **overrides** the built-in `finalsType` for that category.
- E1 "Fase finale" selector (`views/schedule.ts`) lists: *Nessuna* · the 3 built-ins · **each custom
  format by name** (loaded from `GET /o7/finals-formats`). Choosing a custom one sets `finalsFormatId`
  (and clears `finalsType`); the built-ins keep setting `finalsType` as today.
- `generate` (o7): per category, if `finalsFormatId` is set → load the format → `compileFormat` → append
  its draws (placeholders resolved on read); else the existing `buildFinals` path. Validate `seeds ≤`
  available qualifiers for that category; on shortfall, surface a clear error (don't silently truncate).

## Reused for free (no new work)

Bracket tree render (`renderBracket`), winner/loser propagation, level-KO "chi passa?" decree, progressive
final standings, phase filters — all operate on the `Draw`/`ScheduledMatch` shape the compiler targets, so
custom formats inherit them.

## Testing (TDD, unit + one e2e)

- `validateFormat`: unique slots, seed range, backward-only links, placement consistency, rejects.
- `seedRanking`: winners-then-runners-up ordering; tie-break comparators; incomplete group ⇒ unresolved.
- `compileFormat`: refs → placeholder tokens; placement passthrough; no undefined keys.
- `resolvePlaceholders`: `Seed k` resolves once seeds available; stays placeholder otherwise.
- `generate`: `finalsFormatId` path emits the compiled draws; `seeds > qualifiers` → error.
- rest-client `o7`: finals-format CRUD + `getSchedule`/generate carry `finalsFormatId`.
- e2e (skip-gated): seed a format via API → configure a category with it → generate → matches include the
  format's slots → play groups → `Seed k` resolve to the seeded teams.

## Out of scope (SP1)

- The **editor UI** (SP2): the admin bracket-builder page + preview.
- Adaptive/parametric formats (explicitly rejected — fixed slots only).
- Multi-tenant format ownership (catalog is global, admin-only).
- Changing the built-in three formats.

## Follow-ups / risks

- `platform_admin` provisioning in Auth0 (Action must keep it for the owner) — operator step.
- Seeding rule is fixed (position-first); if a format ever needs a different seeding, that's a later
  parameter, not in SP1.
