# Slice `rs` — Event resources & post-match logistics

**Date:** 2026-07-28
**Experience:** E1 Organizer · new "Risorse" tab
**Status:** design approved, ready for implementation (executed directly)

## Problem

Organizers need to manage shared post-match resources — **docce/spogliatoi** (immediate, short
occupancy) and **terzo tempo/pasto** (deferred, batched) — and know **when and in which order
teams finish** so they can stagger usage. Generalized: an organizer configures **arbitrary
resources** with an occupancy time and a **capacity that teams can share**.

## Decisions (locked during brainstorming)

- **Generic Resource model** — showers and meal are just two instances. A Resource has a name,
  an occupancy duration, a **capacity in persons**, and an **offset** from a team's match finish.
- **Capacity in persons** (not teams) → small teams naturally **share** a slot (8 + 8 fit a 16).
- **Team size in persons**, with a **default** (event-level, fallback 14) editable only on the few
  exceptions. Teams = CONFIRMED registrations.
- **Finish time is derived** (no data entry): a team's finish = end of its last match of the day =
  `match.time + slotMinutes(category)` where `slotMinutes = periods*periodMinutes + breakMinutes`.
- Engine **packs** teams into slots by ready-time (finish + offset), respecting person-capacity,
  **mixing categories allowed**; proposes turns, flags **overflow**, and the proposal is **editable**
  (move a team to another slot; recompute).

## Data model (`types.ts`)

```ts
interface Resource { id; eventId; name; occupancyMinutes; capacityPersons; offsetMinutes }
interface ResourceAssignment { eventId; resourceId; day; team; slotTime }   // manual override
// TournamentEvent gains: defaultTeamSize?: number
// Registration gains:    size?: number      // team headcount; falls back to default
```
`State` gains `resources: Resource[]`, `resourceAssignments: ResourceAssignment[]`.

## Engine — pure module `shared/mock/resources.ts`

```ts
const DEFAULT_TEAM_SIZE = 14
matchEnd(match, cfg): string                       // addMinutes(time, periods*periodMinutes+breakMinutes)
teamFinishes(state, eventId, day): { team, categoryId, finish }[]   // last match end per team that day, sorted
teamSizeOf(state, eventId, team): number           // registration.size ?? event.defaultTeamSize ?? 14
resourceTurns(state, eventId, resourceId, day): Slot[]
  // Slot = { time, teams: {team, categoryId, size}[], persons, capacity, overflow }
  // greedy: order by readyTime (finish+offset); a team joins the open slot when
  //   persons+size <= capacity AND readyTime <= slot.time + occupancy; else opens a new slot.
  // A lone team larger than capacity → its own slot with overflow=true.
  // Manual ResourceAssignment overrides re-group a team into its chosen slotTime; overflow recomputed.
```

Distinct days come from the event's scheduled matches. No mutations in the engine.

## Store (`store.ts`)

CRUD + wrappers: `getResources`, `addResource`, `updateResource`, `removeResource`;
`setTeamSize(regId, size|null)`, `setEventDefaultTeamSize`; `getResourceAssignments`,
`setResourceAssignment(eventId, resourceId, day, team, slotTime|null)`; `getResourceTurns`,
`getTeamFinishes`, `getEventDays`.

## Seed

`evt-1` gets two demo resources (🚿 Docce 30′/16 pers/+0, 🍝 Terzo tempo 45′/60 pers/+40) and a
couple of small-team `size` overrides so sharing is visible. `State.resources`/`resourceAssignments`
seeded (empty for other events). Event `defaultTeamSize` optional (fallback 14).

## UI — new "Risorse" workspace tab (`risorse.html` / `risorse.ts`)

- **Owner + Organizer only** — add `'resources'` to `ALL_TABS`/`allowedTabs` (NOT director);
  add the tab to `renderOrganizerWorkspace` (before ⚙ Impostazioni). `requireRole(['OWNER','ORGANIZER'])`.
- Sections: (1) **Risorse** config table + add form; (2) **Dimensione squadre** (default + per-team
  overrides); (3) **Turni proposti** — day selector + resource tabs → slots with person gauges,
  overflow in red, and a per-team "sposta" select (writes a ResourceAssignment, recomputes).
- CSS `/* resources */` block in `ui.css` (config table, gauges, slots), Matchday palette; overflow = danger red.

## Testing (TDD, store-level; suite is 155/155 today)

`resources.test.ts`:
- `matchEnd` adds the category slot length.
- `teamFinishes` = last match end per team per day, sorted by finish then name.
- `teamSizeOf` uses override else default else 14.
- `resourceTurns`: two small teams ready together share a slot; capacity respected (a third opens a
  new slot); lone oversized team → overflow; offset shifts ready time; a manual override re-groups a team.

## Out of scope

- True sequential chaining (finish→shower→meal as hard dependencies) — approximated by per-resource offset.
- Sharing rules beyond person-capacity (min-gap, per-category-only) — category mixing is allowed.
- Real drag-and-drop (a select stands in for the move); auto-optimization of turns.
- Any Blueprint decision — presentation/planning only (candidate note only if the user wants one).
