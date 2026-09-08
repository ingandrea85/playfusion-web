# Resource Groups & Sequencing Relations — Design Spec

**Date:** 2026-09-08
**Component:** o7-scheduling (event resources / post-match logistics, S17) + e1-web resources view
**Status:** Approved for planning
**Builds on:** the bin-packing change (`feat(o7-resources): split a team across resources`, tag `stg-resources-binpack`)

## 1. Overview

PlayFusion's event-resources feature (S17) assigns post-match logistics turns
(showers, "terzo tempo", etc.) to teams, on-read, from match finish times and a
per-person capacity. Today every resource is treated as one flat pool of
interchangeable alternatives: a team is placed in ONE resource (split across
several only when it is too big to fit one).

This spec adds two concepts:

1. **Groups** — a named pool of resources (e.g. *Docce* = Spogliatoio 1 +
   Spogliatoio 2). A team's people are bin-packed **within** the group.
2. **Sequencing relations** — directed "after" edges between nodes (resource or
   group), e.g. *Docce → Mensa*: a team enters Mensa only after finishing Docce.
   Relations form a general **DAG** (fork/join allowed).
3. **Resource steward role** — a magic-link view (like the S25 field director)
   the organizer mints, event-scoped, that shows the resource board and lets the
   steward **check off** teams as they consume each resource. A check-off is the
   team's **real completion** at that node and re-anchors downstream nodes.
4. **Free mode (per node)** — a node can be *scheduled* (turns, as above) or
   *free*: no calendar, just a check-off list of the teams that pass through it.

The motivating scenario: two 10-seat changing rooms grouped as *Docce* (pool of
20), a *Mensa*, and the rule that a team eats only after showering; on match day a
steward opens a magic link and ticks teams off as they shower and eat.

## Delivery in two waves

One spec, two implementation waves (the plan sequences them):
- **Wave A** — groups + relations: the node-graph engine and the reworked E1
  tab. Purely planned/on-read (§4–§10).
- **Wave B** — steward role + check-off store (check-off drives the sequence) +
  per-node free mode + the steward E3 view + E1 link generation / free-mode
  toggle (§11–§14).

## 2. Goals / Non-Goals

**Goals**
- Group same-purpose resources into a capacity pool (bin-pack inside the pool).
- Sequence nodes with a DAG of "after" relations; fork and join supported.
- Per-portion flow: a sub-group that has finished a predecessor proceeds to a
  successor without waiting for the rest of its team.
- Everything stays on-read (pure `computeResourcePlan`), no new tables, no data
  migration. Configs without groups/relations behave exactly as today for a
  single resource.
- Rework the E1 Risorse tab: create groups, define relations (with a visual
  pipeline map), turns grouped per node/stage.
- A magic-link **resource steward** view (event-scoped) that checks teams off;
  the check-off is a team's real completion and re-anchors downstream nodes.
- A per-node **free mode** (no schedule, check-off list only).

**Non-Goals (explicitly out of scope for this slice)**
- Per-category or per-team pipelines (the DAG is event-wide; every known team
  traverses every node).
- Resource membership in more than one group.
- Weighted / priority relations, time budgets, or "soft" ordering.
- Automatic conflict resolution beyond the greedy on-read pack.
- Per-resource (not per-node) or per-team check-off granularity — a check-off is
  one team at one node.
- Steward-driven capacity changes, no-show handling, or resource reassignment.

## 3. Confirmed decisions (from brainstorming)

1. **Group = capacity pool** with internal bin-packing across its members.
2. **Relation timing = per-portion**: for a single-predecessor edge, each portion
   flows forward with its own ready time (its own completion at the predecessor).
3. **Graph = general DAG** (a node may have multiple predecessors and successors).
4. **Ungrouped resources are independent stages**: a team visits *every*
   ungrouped resource (they are no longer interchangeable alternatives). To pool
   several resources, group them. Migration impact is negligible (feature is new,
   used only on staging test events).
5. **Join semantics**: at a node with multiple predecessors, portions
   **recompact** — the team's ready time = `max(predecessor completions) + offset`
   (must have finished ALL predecessors).
6. **Steward link = event-scoped**: one magic link sees/checks off all resources
   of the event; the organizer mints as many as needed (all equivalent, handed to
   different people).
7. **Check-off drives the sequence**: marking team T done at node N records a real
   completion (server timestamp); downstream nodes re-anchor to it. Unmarked → the
   planned time is used (fallback). Granularity = one `(team, node)`, whole team.
8. **Free mode is per node**: each node is `scheduled` (default) or `free`. A free
   node has no slots — only a check-off list; its completion for a team is the
   check-off timestamp (unknown until marked). A scheduled node that follows a
   not-yet-marked (free or scheduled) predecessor shows its arrival as *pending*.

## 4. Data model

`ResourceConfig` (o7 `services/o7-scheduling/src/resources.ts`, mirrored in
`@playfusion/rest-client`) gains two optional fields. Absent = today's behavior.

```ts
export interface ResourceGroup {
  groupId: string;
  name: string;
  icon?: string;
  memberIds: string[];        // resourceId of members; a resource is in ≤1 group
  mode?: 'scheduled' | 'free'; // default 'scheduled' (Wave B)
}

export interface ResourceRelation {  // directed "after" edge: `to` follows `from`
  from: string;               // nodeId (resourceId | groupId)
  to: string;                 // nodeId (resourceId | groupId)
}

export interface Resource {   // existing; gains an optional per-node mode (Wave B)
  // …capacityPersons, occupancyMinutes, offsetMinutes, name, icon…
  mode?: 'scheduled' | 'free'; // used only when the resource is an ungrouped node
}

export interface ResourceConfig {
  resources: Resource[];
  groups?: ResourceGroup[];
  relations?: ResourceRelation[];
  defaultTeamSize?: number;
  teamSizes?: Record<string, number>;
  assignments?: ResourceAssignment[];
}
```

`mode` lives on the **node** (a `ResourceGroup`, or an ungrouped `Resource`). A
grouped resource's own `mode` is ignored (the group's `mode` wins).

**Node** = a group, or a resource NOT belonging to any group. A grouped resource
is reachable only through its group (the group is the scheduling unit; members
are the capacity "shelves" inside it). `Resource.offsetMinutes` is reinterpreted
as "delay from the anchor": match-finish for root nodes, predecessor completion
for non-root nodes.

Offset/occupancy for a group node: **each member keeps its own
`occupancyMinutes`** (a slot's length is the member's), and the **node anchor
offset = the group's first member's `offsetMinutes`** (group members are expected
to share the same offset; the UI need not enforce it, but the first member is
authoritative). A single-resource node uses that resource's own values.

### 4.1 Node abstraction

Introduce an internal (non-persisted) `PlanNode` derived from the config:

```ts
type PlanNode = {
  nodeId: string;             // groupId or resourceId
  kind: 'group' | 'resource';
  label: string;              // group.name or resource.name
  pool: Resource[];           // group members, or [the single resource]
  anchorOffset: number;       // minutes added to the anchor time (match-finish or predecessor completion)
};
```

`pool` reuses the existing per-resource `capacityPersons` / `occupancyMinutes`;
`anchorOffset` is the group's (first member's) or resource's `offsetMinutes`.

## 5. Engine

`computeResourcePlan(matches, config, rc, teamsByCat)` is rewritten around the
node graph. Pure; on-read.

### 5.1 Build the graph

- Derive `PlanNode[]` from `resources` + `groups` (§4.1).
- Build adjacency from `relations` mapped to node ids. Validate:
  - every edge endpoint is a known node id;
  - no self-edge;
  - **no cycle** (Kahn's algorithm; on a cycle the engine throws a domain
    error — the handler surfaces 422, the UI prevents it live).
- **Topological order** of nodes (Kahn). Roots = nodes with no incoming edge.

### 5.2 Per-day scheduling

For each day (days come from `teamFinishes`, unchanged):

1. `teamFinishes(matches, config, known)` → per team, its match finish time
   (unchanged).
2. Maintain `completion: Map<nodeId, Map<team, Portion[]>>` where a `Portion` is
   `{ team, size, ready }` (ready = when those people can enter the NEXT node).
   A team's **completion at a node** = the latest `end` among the portions it
   produced there (used by join arrivals in §5.2).
3. Process nodes in topological order. For node `N`:
   - **Arrivals per team**:
     - `N` is a **root**: one portion `{ team, size: teamSize, ready: finish + N.anchorOffset }`.
     - `N` has **one predecessor** `P`: the portions team produced at `P`, each
       `{ team, size, ready: portionCompletion + N.anchorOffset }` (per-portion
       flow preserved).
     - `N` has **multiple predecessors** (join): one portion
       `{ team, size: teamSize, ready: max over preds of team's completion at pred + N.anchorOffset }`
       (recompact).
   - **Pack** the arrivals into `N.pool` with the existing greedy bin-pack
     (`assignDay` generalized): `ready` replaces the single `finish`; a portion
     enters a member slot whose start ≥ its ready (join an open slot with room if
     ready within its occupancy window, else open a fresh slot; split across
     members when no single member holds the whole arriving portion). Output:
     member slots + per-team **completion portions** = the produced slots'
     `{ size, end = slotStart + memberOccupancy }`, which become the arrivals'
     source for `N`'s successors.
   - **Residual**: people the node's pool cannot seat within the day →
     `unassignable` (residual persons, as today). Only seated people flow onward.

### 5.3 Output (`ResourcePlan`)

- `turns` stays keyed by `resourceId` (member) so per-resource rendering is
  unchanged, plus each `ResourceDayTurns` carries its owning `nodeId` and the
  node's topological index (for stage ordering / labels).
- `teams`, `days`, `defaultTeamSize`, `finishesByDay` unchanged.
- `unassignable` unchanged shape (residual persons per team per day, tagged with
  the node where they couldn't be seated).
- New: `nodes: { nodeId, kind, label, icon?, memberIds, topoIndex, predecessorIds }[]`
  so the UI can render the pipeline map and stage grouping without re-deriving
  the graph.

### 5.4 Backward compatibility

- No `groups` and no `relations`: every resource is its own root node → each team
  gets a turn in each resource, anchored to finish + offset. NOTE this differs
  from the previous "resources are alternatives" behavior — confirmed acceptable
  (decision §3.4). A single-resource config is byte-identical to today.
- `assignments` (manual "sposta" override) still pins a whole team into a member
  `resourceId` at a `slotTime`; it applies within that member's node.

### 5.5 Check-off overrides & free nodes (Wave B)

`computeResourcePlan` gains an optional `checkoffs` input (persisted, §12):
`{ nodeId, day, team, servedAt }[]`. It is DATA passed in — the function stays
pure (no `Date.now()`).

- **Actual completion**: if team `T` is checked off at node `N`, `T`'s completion
  at `N` = `servedAt` (a single time for the whole team, replacing the planned
  per-portion ends). Successor arrivals re-anchor to it (`ready = servedAt +
  successorOffset`).
- **Free node** (`mode: 'free'`): no packing, no slots. Its team list = all known
  teams that reach it (event-wide pipeline). A team's completion at a free node is
  its `servedAt` if checked off, else **undefined**.
- **Pending arrivals**: a scheduled node whose predecessor completion is undefined
  (a free predecessor not yet checked off, or a scheduled predecessor whose team
  had residual) cannot be planned for that team → the team is listed as
  **pending** at that node (surfaced in the plan, not seated). Once the
  predecessor is checked off, a re-read seats it.
- A checked-off team carries a `served: true` (+ `servedAt`) flag on its slot/list
  entry so the board and the steward view render the ✓.

## 6. Persistence & API

**Wave A** — no new endpoints. `groups`, `relations` and per-node `mode` ride on
the existing "save the whole resource config" mutation and its zod schema (o7
handler). Server-side validation mirrors the UI: edge endpoints exist, member in
≤1 group, acyclic (422 with a message on a cycle). `@playfusion/rest-client`
mirrors `ResourceGroup` / `ResourceRelation` and the extended `ResourcePlan.nodes`.

**Wave B** — new o7 endpoints (see §11–§12): mint a steward magic link, list
check-offs, mark / unmark a `(team, node, day)`. Details in those sections.

## 7. UI (E1 Risorse tab — `apps/e1-web/src/views/resources.ts`)

Three stacked blocks inside the existing tab (no new page):

- **Gruppi (pool di capienza)** — below the resource table. Create a group
  (name + icon), add ungrouped resources to it (select shows only free
  resources). Each group is a card listing members with the pool's total
  capacity ("pool 20 posti"). "Rimuovi gruppo" frees the members.
- **Sequenza (relazioni)** — two node dropdowns (`Da` → `A`, options = single
  resources + groups) + "Aggiungi". Existing relations shown as removable chips
  ("🚿 Docce → 🍝 Mensa"). Live validation: no self, no cycle (message), endpoints
  exist. Above the chips, a **pipeline mini-map**: nodes in topological order with
  CSS arrows (same technique as the finals bracket tree; mobile → ordered list). A
  join renders as multiple arrows converging on a node.
- **Turni** — the resource selector becomes grouped by node and ordered by the
  topological sequence (optgroup per node, group members inside). Slots unchanged
  (already per-resource, showing the "10p di 14" split). Add a stage label so it's
  clear where in the pipeline a slot sits.

## 8. Testing

**Engine (`services/o7-scheduling/test/resources.test.ts`)**
- topological order of a small DAG; cycle → throws.
- root node anchored to match-finish + offset.
- single-predecessor chain preserves per-portion flow (a portion that finished
  earlier enters the successor earlier).
- join: ready = max of predecessor completions; portions recompact.
- fork: one node's completions feed each successor independently.
- group = internal bin-pack across members (the 14 → 10 + 4 case, but scoped to
  the group's members).
- ungrouped resources = independent stages (a team appears in every ungrouped
  resource).
- backward-compat: a single-resource, no-group, no-relation config produces the
  same plan as today.

**UI (`apps/e1-web/test/resources.test.ts`)**
- group card renders members + pool capacity.
- relation chips render + a remove control per chip.
- pipeline mini-map lists nodes in topological order.
- turns resource selector is grouped by node.
- adding a cyclic relation surfaces an inline error.

**rest-client** — the two new types + `ResourcePlan.nodes`.

## 9. Edge cases

- **Cycle** in relations → engine throws / handler 422 / UI blocks. Never a
  silent infinite loop.
- **Residual at a predecessor**: people that couldn't be seated at a predecessor
  have no completion and do not flow onward; surfaced as unassignable at that
  node.
- **A group with one member** = a normal single-resource pool (valid, no special
  case).
- **A resource both grouped and named in a relation as itself** — not allowed: a
  grouped resource is not a node; relations reference the group.
- **Empty group** (no members) → not a scheduling node; UI prevents saving it.
- **Team larger than a group's whole pool** → seated up to pool capacity, residual
  surfaced (same as §5.2, existing bin-pack behavior).

## 10. File map

- `services/o7-scheduling/src/resources.ts` — `ResourceGroup`, `ResourceRelation`,
  `PlanNode`, graph build + topo sort + cycle guard, node-based
  `computeResourcePlan`, generalized pack, `ResourcePlan.nodes`.
- `services/o7-scheduling/src/handler.ts` — zod for `groups`/`relations`,
  server-side validation (endpoints, ≤1 group, acyclic → 422).
- `libs/rest-client/src/types.ts` — mirror the new types + `ResourcePlan.nodes`.
- `apps/e1-web/src/views/resources.ts` — groups block, relations block + pipeline
  map, node-grouped turns selector + stage labels; wiring for create/remove group,
  add/remove relation with live cycle validation.
- Tests as in §8.

Wave B files are listed in §14.

---

# Wave B — Resource steward role, check-off, free mode

## 11. Resource steward role (magic link)

Mirrors the S25 field-director pattern (`o7.getDirectorToken` → E3 `/director`
view via `magicLinkAuthProvider`), but **event-scoped** and for resource
check-off.

- **Token**: a magic link (`signMagicLink`, shared-kernel HMAC) with
  `purpose: 'resource-steward'`, `roles: ['ResourceSteward']`, and the event id
  in the subject/claim. Minted by the organizer.
- **Mint endpoint** (organizer-only): `POST /o7/events/:id/resource-steward-token`
  → `{ token }`. The organizer generates as many as needed (all equivalent,
  event-scoped); the E1 tab shows a "genera link addetto" button + copy, like the
  director links. No per-link persistence (a token is self-contained), matching
  the director model.
- **Guard**: check-off mutations accept the steward magic link (`requireMagicLink`
  with `purpose: 'resource-steward'`) OR an organizer JWT. Read of the board is
  allowed with either too.

## 12. Check-off store (drives the sequence)

A checked-off record is the only persisted per-team resource state.

- **Item**: `{ sportEventId, nodeId, day, team, servedAt }`. Stored in the o7
  resources table (same table family as the resource config; a distinct
  `sk` prefix, e.g. `CHECKOFF#<day>#<nodeId>#<team>`). No new table.
- **Endpoints** (steward or organizer):
  - `POST /o7/events/:id/resource-checkoffs` `{ nodeId, day, team }` → records
    `servedAt = <server now>` (201). Idempotent on `(nodeId, day, team)`.
  - `DELETE /o7/events/:id/resource-checkoffs/:nodeId/:day/:team` → 204 (unmark).
  - `GET /o7/events/:id/resource-checkoffs` → the list (read by the board and the
    steward view).
- `servedAt` is stamped server-side at write time; `computeResourcePlan` receives
  the list as `checkoffs` input (§5.5) and stays pure.
- A check-off is a team's real completion at that node → downstream nodes
  re-anchor (§5.5). Unmark reverts to the planned time on the next read.

## 13. Free mode & the steward view (E3)

**Free node** (§5.5): no slots; the plan carries, per free node, the list of
teams that reach it with `served`/`servedAt`. Relations still apply for
sequencing successors (a free predecessor gates a scheduled successor until
checked off), but the free node itself is never scheduled.

**Steward view** — new E3 route `#/events/:id/resources` (steward), gated on the
`resource-steward` magic link. Event-scoped: shows every node, ordered by the
pipeline (topological order):

- **Scheduled node** → its turns/slots (times + the split display), each team row
  with a **check-off toggle** (✓ servita / annulla). Pending arrivals shown greyed
  ("in attesa di <predecessore>").
- **Free node** → a flat check-off list of its teams (no times), with a
  served/total counter.
- Optimistic toggle → `POST`/`DELETE` check-off → re-fetch the board. Reuses the
  E3 magic-link client + `renderCalendar`/slot styles already in `app-shell`.

The organizer (E1) sees the same served ✓ overlay on the Risorse turns (read of
check-offs), so they can monitor progress; and a per-node **"modalità"** control
(scheduled / libero) in the node's config.

## 14. Wave B testing & files

**Engine**
- check-off overrides a team's completion at a node; successor re-anchors to
  `servedAt`.
- free node produces no slots, only a team list; its completion is `servedAt` or
  undefined.
- pending: a scheduled node after a not-yet-checked free predecessor lists the
  team as pending; after check-off it seats on re-read.
- unmark reverts to planned time.

**API / auth**
- steward token mints with `purpose: 'resource-steward'` + event claim; a token
  for another event is rejected on the check-off routes.
- check-off POST stamps `servedAt`, idempotent; DELETE removes; organizer JWT also
  accepted.

**UI**
- E3 steward view renders nodes in pipeline order; scheduled node shows toggles,
  free node shows a flat list + counter; pending rows greyed.
- E1 shows the "genera link addetto" control and the per-node modalità toggle; the
  served ✓ overlay appears on turns.

**Files (Wave B)**
- `services/o7-scheduling/src/resources.ts` — `checkoffs` input, actual-completion
  override, free-node handling, `pending` + `served` in the plan output.
- `services/o7-scheduling/src/handler.ts` — steward-token mint, check-off
  POST/DELETE/GET, `requireMagicLink('resource-steward')` guard, `mode` zod.
- `services/o7-scheduling/src/ports.ts` / repo — persist & read check-off items.
- `libs/platform-lib` — reuse `signMagicLink`/`requireMagicLink` (no change beyond
  a new purpose string).
- `libs/rest-client/src/types.ts` + o7 client — steward token, check-off calls,
  `mode`, `served`/`pending` plan fields.
- `apps/e3-web/src/views/resource-steward.ts` (new) + route in `apps/e3-web/src/main.ts`.
- `apps/e1-web/src/views/resources.ts` — steward-link generator, per-node modalità
  toggle, served ✓ overlay.

