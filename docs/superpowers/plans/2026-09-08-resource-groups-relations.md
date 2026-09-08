# Resource Groups, Relations & Steward Check-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let organizers group resources into capacity pools and sequence them in a DAG (Docce → Mensa), and let a magic-link "resource steward" check teams off as they consume each resource — where a check-off is the team's real completion that re-anchors downstream nodes; plus a per-node "free" mode (no schedule, check-off list only).

**Architecture:** All scheduling stays on-read in the pure `computeResourcePlan` (o7). Wave A rebuilds it around a node graph (a node is a group or an ungrouped resource) with topological ordering, per-portion flow and join recompaction; the existing bin-pack becomes the per-node packer. Wave B adds a small `o7-checkoffs` DynamoDB table, feeds its rows into the pure engine as data (`servedAt` stamped server-side), and adds an E3 steward view + E1 controls. The E1 resources tab gains groups/relations blocks with a CSS pipeline map.

**Tech Stack:** TypeScript ESM, Hono on AWS Lambda, DynamoDB (aws-sdk lib-dynamodb), AWS CDK, Vitest, Nx monorepo. Frontend = vanilla TS view modules rendering HTML strings (no framework), magic-link auth via `@playfusion/platform-lib`.

**Spec:** `docs/superpowers/specs/2026-09-08-resource-groups-relations-design.md`

## Global Constraints

- Engine stays **pure**: `computeResourcePlan` never calls `Date.now()`/`new Date()`; `servedAt` arrives as data. (Spec §5.5, §12)
- **Backward compatible**: a config with no `groups`/`relations`/`mode` and a single resource produces the same plan as today. (Spec §5.4)
- **Node** = a `ResourceGroup`, or a `Resource` not in any group. A grouped resource's own `mode` is ignored; the group's wins. A resource is in ≤1 group. (Spec §4)
- **Group anchor offset** = the group's **first member's** `offsetMinutes`; each member keeps its own `occupancyMinutes`. (Spec §4)
- **Join** (multiple predecessors) recompacts: team ready = `max(predecessor completions) + node.anchorOffset`. **Single predecessor** preserves per-portion flow (each portion carries its own completion). **Root** anchors to match-finish + offset. (Spec §3.2, §3.5, §5.2)
- **Check-off drives the sequence**: a `(team, node, day)` mark = whole-team real completion `servedAt`; unmarked → planned time. (Spec §3.7)
- **Free node**: no slots, a check-off list; completion = `servedAt` or undefined. A scheduled node whose predecessor completion is undefined lists the team as **pending**. (Spec §3.8, §5.5)
- **Steward link is event-scoped**, `purpose: 'resource-steward'`, minted by the organizer; check-off routes accept it OR an organizer JWT. (Spec §3.6, §11)
- **Cycle** in relations → `DomainError('resource-cycle', <msg>, 422)`; UI blocks it live. (Spec §5.1, §9)
- New table `o7-checkoffs`: PK `sportEventId`, SK `sk = <day>#<nodeId>#<team>`. (Spec §12)
- `DomainError(code: string, message: string, httpStatus = 409)` — 3-arg form (libs/platform-lib/src/errors.ts).
- Italian user-facing copy (this is an Italian product).
- Commit only on branch `feature/resource-groups-relations`. Run affected tests with `npx vitest run <path>`; full suite `npx nx run-many -t test --all`.

---

# WAVE A — Groups + Relations (planned, on-read)

## File Structure (Wave A)

- `services/o7-scheduling/src/resources.ts` — new types (`ResourceGroup`, `ResourceRelation`, `NodeMode`, `PlanNode`, `PlanNodeInfo`), `buildPlanNodes`, `topoOrder`, `validateResourceConfig`, node-based `computeResourcePlan`, extended `ResourcePlan`/`ResourceDayTurns`/`TurnTeam`. (grows; keep the pure helpers grouped)
- `services/o7-scheduling/src/handler.ts` — extend `resourceConfigBody` zod (groups/relations/mode) + call `validateResourceConfig` (→ 422) in the PUT.
- `libs/rest-client/src/types.ts` — mirror the new types + `ResourcePlan.nodes`, `ResourceDayTurns.nodeId/topoIndex`, `Resource.mode`, `ResourceGroup`, `ResourceRelation`.
- `apps/e1-web/src/views/resources.ts` — groups block, relations block + pipeline map, node-grouped turns selector + stage labels + wiring.

---

## Task A1: Node model + graph (buildPlanNodes, topoOrder, validateResourceConfig)

**Files:**
- Modify: `services/o7-scheduling/src/resources.ts` (add types + 3 pure functions near the top, after the existing interfaces)
- Test: `services/o7-scheduling/test/resources.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type NodeMode = 'scheduled' | 'free';
  export interface ResourceGroup { groupId: string; name: string; icon?: string; memberIds: string[]; mode?: NodeMode }
  export interface ResourceRelation { from: string; to: string }
  // Resource gains: mode?: NodeMode
  // ResourceConfig gains: groups?: ResourceGroup[]; relations?: ResourceRelation[]
  export interface PlanNode { nodeId: string; kind: 'group' | 'resource'; label: string; icon?: string; pool: Resource[]; anchorOffset: number; mode: NodeMode; memberIds: string[] }
  export function buildPlanNodes(rc: ResourceConfig): PlanNode[]
  export function topoOrder(nodes: PlanNode[], relations: ResourceRelation[]): PlanNode[] // throws DomainError on cycle
  export function validateResourceConfig(rc: ResourceConfig): string | null // null = ok; else an Italian error message
  ```

- [ ] **Step 1: Write the failing tests**

Add to `services/o7-scheduling/test/resources.test.ts` (import the new symbols):
```ts
import { buildPlanNodes, topoOrder, validateResourceConfig, type ResourceConfig as RC } from '../src/resources.js';

const R = (resourceId: string, over: Partial<import('../src/resources.js').Resource> = {}) =>
  ({ resourceId, name: resourceId, occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0, ...over });

test('test_buildPlanNodes_groupIsOneNode_ungroupedAreOwnNodes', () => {
  const rc: RC = { resources: [R('s1'), R('s2'), R('mensa', { offsetMinutes: 5 })],
    groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }] };
  const nodes = buildPlanNodes(rc);
  expect(nodes.map((n) => n.nodeId).sort()).toEqual(['docce', 'mensa']);
  const docce = nodes.find((n) => n.nodeId === 'docce')!;
  expect(docce.kind).toBe('group');
  expect(docce.pool.map((r) => r.resourceId)).toEqual(['s1', 's2']);
  expect(docce.anchorOffset).toBe(0);         // first member's offset
  expect(nodes.find((n) => n.nodeId === 'mensa')!.anchorOffset).toBe(5);
});

test('test_buildPlanNodes_emptyGroupIsNotANode', () => {
  const rc: RC = { resources: [R('a')], groups: [{ groupId: 'g', name: 'G', memberIds: [] }] };
  expect(buildPlanNodes(rc).map((n) => n.nodeId)).toEqual(['a']);
});

test('test_topoOrder_ordersPredecessorsFirst', () => {
  const rc: RC = { resources: [R('docce'), R('mensa')], relations: [{ from: 'docce', to: 'mensa' }] };
  const order = topoOrder(buildPlanNodes(rc), rc.relations!);
  expect(order.map((n) => n.nodeId)).toEqual(['docce', 'mensa']);
});

test('test_topoOrder_throwsOnCycle', () => {
  const rc: RC = { resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] };
  expect(() => topoOrder(buildPlanNodes(rc), rc.relations!)).toThrow(/ciclo/i);
});

test('test_validateResourceConfig_flagsCycleMemberDupAndBadEdge', () => {
  expect(validateResourceConfig({ resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] })).toMatch(/ciclo/i);
  expect(validateResourceConfig({ resources: [R('a'), R('b')], groups: [{ groupId: 'g1', name: 'G1', memberIds: ['a'] }, { groupId: 'g2', name: 'G2', memberIds: ['a'] }] })).toMatch(/gruppo/i);
  expect(validateResourceConfig({ resources: [R('a')], relations: [{ from: 'a', to: 'ghost' }] })).toMatch(/nodo/i);
  expect(validateResourceConfig({ resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }] })).toBeNull();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: FAIL — `buildPlanNodes`/`topoOrder`/`validateResourceConfig` not exported.

- [ ] **Step 3: Implement the model + graph functions**

In `services/o7-scheduling/src/resources.ts`: add `import { DomainError } from '@playfusion/platform-lib';` at the top; add `mode?: NodeMode` to `Resource`; add `groups?`/`relations?` to `ResourceConfig`; then:
```ts
export type NodeMode = 'scheduled' | 'free';
export interface ResourceGroup { groupId: string; name: string; icon?: string; memberIds: string[]; mode?: NodeMode }
export interface ResourceRelation { from: string; to: string }
export interface PlanNode { nodeId: string; kind: 'group' | 'resource'; label: string; icon?: string; pool: Resource[]; anchorOffset: number; mode: NodeMode; memberIds: string[] }

/** Derive the scheduling nodes: one per non-empty group, plus every ungrouped resource. A grouped
 *  resource is reachable only through its group. Group anchor offset = its first member's offset. */
export function buildPlanNodes(rc: ResourceConfig): PlanNode[] {
  const groups = rc.groups ?? [];
  const byId = new Map(rc.resources.map((r) => [r.resourceId, r]));
  const grouped = new Set(groups.flatMap((g) => g.memberIds));
  const nodes: PlanNode[] = [];
  for (const g of groups) {
    const pool = g.memberIds.map((id) => byId.get(id)).filter((r): r is Resource => !!r);
    if (!pool.length) continue; // empty group is not a node
    nodes.push({ nodeId: g.groupId, kind: 'group', label: g.name, icon: g.icon, pool, anchorOffset: pool[0]!.offsetMinutes, mode: g.mode ?? 'scheduled', memberIds: g.memberIds });
  }
  for (const r of rc.resources) {
    if (grouped.has(r.resourceId)) continue;
    nodes.push({ nodeId: r.resourceId, kind: 'resource', label: r.name, icon: r.icon, pool: [r], anchorOffset: r.offsetMinutes, mode: r.mode ?? 'scheduled', memberIds: [r.resourceId] });
  }
  return nodes;
}

/** Kahn topological sort of the node graph; throws on a cycle. Edges referencing unknown nodes are
 *  ignored here (validateResourceConfig rejects them earlier for the UI). */
export function topoOrder(nodes: PlanNode[], relations: ResourceRelation[]): PlanNode[] {
  const ids = new Set(nodes.map((n) => n.nodeId));
  const edges = relations.filter((e) => ids.has(e.from) && ids.has(e.to));
  const indeg = new Map(nodes.map((n) => [n.nodeId, 0] as [string, number]));
  const adj = new Map(nodes.map((n) => [n.nodeId, [] as string[]]));
  for (const e of edges) { adj.get(e.from)!.push(e.to); indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1); }
  const queue = nodes.filter((n) => (indeg.get(n.nodeId) ?? 0) === 0).map((n) => n.nodeId);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!; order.push(id);
    for (const to of adj.get(id)!) { indeg.set(to, indeg.get(to)! - 1); if (indeg.get(to) === 0) queue.push(to); }
  }
  if (order.length !== nodes.length) throw new DomainError('resource-cycle', 'Le relazioni tra risorse contengono un ciclo.', 422);
  const byId = new Map(nodes.map((n) => [n.nodeId, n]));
  return order.map((id) => byId.get(id)!);
}

/** Pure config validation shared by the UI (live) and the handler (422). Returns an Italian error
 *  message or null when valid. */
export function validateResourceConfig(rc: ResourceConfig): string | null {
  const groups = rc.groups ?? [];
  const seen = new Set<string>();
  for (const g of groups) for (const id of g.memberIds) {
    if (seen.has(id)) return `Una risorsa non può stare in più di un gruppo.`;
    seen.add(id);
  }
  const nodes = buildPlanNodes(rc);
  const nodeIds = new Set(nodes.map((n) => n.nodeId));
  for (const e of rc.relations ?? []) {
    if (e.from === e.to) return `Una relazione non può collegare un nodo a sé stesso.`;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) return `Una relazione fa riferimento a un nodo inesistente.`;
  }
  try { topoOrder(nodes, rc.relations ?? []); } catch { return `Le relazioni contengono un ciclo.`; }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: PASS (the 5 new tests + all existing resource tests).

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/resources.ts services/o7-scheduling/test/resources.test.ts
git commit -m "feat(o7-resources): node model + topo sort + config validation"
```

---

## Task A2: Node-based computeResourcePlan (per-portion flow, join, generalized pack)

**Files:**
- Modify: `services/o7-scheduling/src/resources.ts` (rewrite `computeResourcePlan`; keep `assignDay`'s greedy pack but drive it per node; add `ResourcePlan.nodes`, `ResourceDayTurns.nodeId/topoIndex`)
- Test: `services/o7-scheduling/test/resources.test.ts`

**Interfaces:**
- Consumes: `buildPlanNodes`, `topoOrder` (Task A1); the existing `teamFinishes`, `teamSizeOf`, `addMinutes`, `maxTime`, the greedy pack from `assignDay`.
- Produces:
  ```ts
  export interface PlanNodeInfo { nodeId: string; kind: 'group' | 'resource'; label: string; icon?: string; memberIds: string[]; mode: NodeMode; topoIndex: number; predecessorIds: string[] }
  // ResourceDayTurns gains: nodeId: string; topoIndex: number
  // ResourcePlan gains: nodes: PlanNodeInfo[]
  // computeResourcePlan signature unchanged for Wave A (checkoffs param added in Wave B, Task B3)
  ```

**Design note (engine):** Replace the single flat `assignDay(day, finishes, resources, …)` with per-node processing. Extract the greedy body of `assignDay` into a reusable `packArrivals(pool, arrivals)` where an `Arrival = { team; categoryId; size; ready }` (a team may bring several arrivals = portions). `packArrivals` returns `{ slotsByRes: Map<resourceId, ResourceSlot[]>; produced: Map<team, { size: number; end: string }[]>; unassignable: {team; categoryId; size}[] }`. `end = slotStart + memberOccupancy`. Then per day, walk nodes in topo order building each node's arrivals from predecessor `produced` maps.

- [ ] **Step 1: Write the failing tests**

```ts
import { computeResourcePlan, type ResourceConfig as RC } from '../src/resources.js';
// reuse `config`, `m`, `plan`/helpers already in the file; add:
const planRC = (matches: any[], rc: RC, teams: string[]) =>
  computeResourcePlan(matches, config, rc, new Map([['U10', teams]]));
const teamAt = (p: ReturnType<typeof planRC>, rid: string) =>
  p.turns.filter((t) => t.resourceId === rid).flatMap((t) => t.slots.flatMap((s) => s.teams));

test('test_plan_exposesNodesInTopoOrder', () => {
  const rc: RC = { resources: [R('docce'), R('mensa', { offsetMinutes: 5 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(p.nodes.map((n) => n.nodeId)).toEqual(['docce', 'mensa']);       // topo order
  expect(p.nodes[1]!.predecessorIds).toEqual(['docce']);
});

test('test_plan_ungroupedResources_areIndependentStages_teamVisitsBoth', () => {
  // No relations, no group: A visits BOTH resources (not alternatives).
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 }), R('mensa', { capacityPersons: 20 })] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(teamAt(p, 'docce').some((t) => t.team === 'A')).toBe(true);
  expect(teamAt(p, 'mensa').some((t) => t.team === 'A')).toBe(true);
});

test('test_plan_relationAnchorsSuccessorToPredecessorCompletion', () => {
  // docce occ 30, offset 0 → A ready 09:50, slot 09:50, ends 10:20. mensa offset 5 → A at 10:25.
  const rc: RC = { resources: [R('docce', { capacityPersons: 20, occupancyMinutes: 30 }), R('mensa', { capacityPersons: 20, occupancyMinutes: 30, offsetMinutes: 5 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A']);
  const mensaSlot = p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!;
  expect(mensaSlot.time).toBe('10:25');
});

test('test_plan_join_readyIsMaxOfPredecessors', () => {
  // docce ends 10:20, premiazione (occ 60) ends 10:50 → mensa ready = 10:50 (+0).
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 }), R('premi', { capacityPersons: 20, occupancyMinutes: 60 }), R('mensa', { capacityPersons: 20 })],
    relations: [{ from: 'docce', to: 'mensa' }, { from: 'premi', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A']);
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!.time).toBe('10:50');
});

test('test_plan_groupBinPacksInternally', () => {
  // group of two 10-rooms; a 14-team splits 10 + 4 inside the group.
  const rc: RC = { resources: [R('s1', { capacityPersons: 10 }), R('s2', { capacityPersons: 10 })], groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }], teamSizes: { A: 14 } as any };
  const p = planRC([m('A', 'B', '09:00')], { ...rc, teamSizes: { A: 14 } }, ['A']);
  const s1 = teamAt(p, 's1').filter((t) => t.team === 'A').reduce((n, t) => n + t.size, 0);
  const s2 = teamAt(p, 's2').filter((t) => t.team === 'A').reduce((n, t) => n + t.size, 0);
  expect(s1 + s2).toBe(14);
  expect(Math.max(s1, s2)).toBe(10);
});

test('test_plan_backwardCompat_singleResourceNoGroupsNoRelations', () => {
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 })] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(teamAt(p, 'docce').map((t) => t.team).sort()).toEqual(['A', 'B']);
  expect(p.unassignable).toHaveLength(0);
});
```
(Reuse the file's existing `R`, `m`, `config`; add `R` if not present from Task A1.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: FAIL — `p.nodes` undefined / successor anchoring wrong.

- [ ] **Step 3: Implement the node-based engine**

In `resources.ts`, extend the plan types and rewrite `computeResourcePlan`. Extract the greedy pack (from the current `assignDay`) into:
```ts
interface Arrival { team: string; categoryId: string; size: number; ready: string }
interface Produced { size: number; end: string }

/** Greedy bin-pack of a node's arrivals into its member pool (the algorithm from the former assignDay,
 *  with `ready` per arrival instead of one finish per team). Prefers a single member that fits the whole
 *  arriving portion; splits across members when none does. Returns member slots, per-team produced
 *  portions (size + end), and residual unseated people. Pinned assignments handled by the caller. */
function packArrivals(pool: Resource[], arrivals: Arrival[]): { slotsByRes: Map<string, ResourceSlot[]>; produced: Map<string, Produced[]>; unassignable: { team: string; categoryId: string; size: number }[] } {
  const slotsByRes = new Map<string, ResourceSlot[]>(pool.map((r) => [r.resourceId, []]));
  const produced = new Map<string, Produced[]>();
  const unassignable: { team: string; categoryId: string; size: number }[] = [];
  const occ = new Map(pool.map((r) => [r.resourceId, r.occupancyMinutes]));
  const record = (team: string, size: number, end: string) => {
    const arr = produced.get(team) ?? []; arr.push({ size, end }); produced.set(team, arr);
  };
  const freeAt = (r: Resource): string | undefined => {
    const ss = slotsByRes.get(r.resourceId)!;
    return ss.length ? ss.map((s) => addMinutes(s.time, r.occupancyMinutes)).reduce(maxTime) : undefined;
  };
  const addTo = (r: Resource, time: string, a: Arrival, persons: number) => {
    const ss = slotsByRes.get(r.resourceId)!;
    let s = ss.find((x) => x.time === time);
    if (!s) { s = { time, teams: [], persons: 0, capacity: r.capacityPersons, overflow: false }; ss.push(s); }
    s.teams.push({ team: a.team, categoryId: a.categoryId, size: persons });
    s.persons += persons;
    record(a.team, persons, addMinutes(time, occ.get(r.resourceId)!));
  };
  for (const a of arrivals) {
    const size = a.size;
    const whole: Array<{ r: Resource; time: string }> = [];
    for (const r of pool) {
      const ss = slotsByRes.get(r.resourceId)!;
      const last = ss[ss.length - 1];
      const canJoin = last && last.persons + size <= r.capacityPersons && a.ready.localeCompare(addMinutes(last.time, r.occupancyMinutes)) <= 0;
      if (canJoin) whole.push({ r, time: last!.time });
      else if (size <= r.capacityPersons) whole.push({ r, time: maxTime(a.ready, freeAt(r) ?? a.ready) });
    }
    if (whole.length) { const best = whole.reduce((x, y) => (y.time.localeCompare(x.time) < 0 ? y : x)); addTo(best.r, best.time, a, size); continue; }
    let remaining = size;
    const fresh = pool.map((r) => ({ r, time: maxTime(a.ready, freeAt(r) ?? a.ready) })).sort((x, y) => x.time.localeCompare(y.time));
    for (const c of fresh) { if (remaining <= 0) break; const p = Math.min(remaining, c.r.capacityPersons); if (p <= 0) continue; addTo(c.r, c.time, a, p); remaining -= p; }
    if (remaining > 0) unassignable.push({ team: a.team, categoryId: a.categoryId, size: remaining });
  }
  for (const [, ss] of slotsByRes) { for (const s of ss) s.overflow = s.persons > s.capacity; ss.sort((x, y) => x.time.localeCompare(y.time)); }
  return { slotsByRes, produced, unassignable };
}
```
Then rewrite `computeResourcePlan`:
```ts
export function computeResourcePlan(matches: ScheduledMatch[], config: ScheduleConfig, rc: ResourceConfig, teamsByCat: Map<string, string[]>): ResourcePlan {
  const catOf = new Map<string, string>();
  for (const [cat, list] of teamsByCat) for (const t of list) catOf.set(t, cat);
  const finishesByDay = teamFinishes(matches, config, new Set(catOf.keys()));
  const days = Object.keys(finishesByDay).sort();
  const sizeOf = (team: string) => teamSizeOf(rc, team);
  const teams = [...catOf].map(([team, categoryId]) => ({ team, categoryId, size: sizeOf(team) }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.team.localeCompare(b.team));

  const nodes = topoOrder(buildPlanNodes(rc), rc.relations ?? []);
  const predOf = new Map<string, string[]>(nodes.map((n) => [n.nodeId, []]));
  for (const e of rc.relations ?? []) if (predOf.has(e.to)) predOf.get(e.to)!.push(e.from);

  const turns: ResourceDayTurns[] = [];
  const unassignable: UnassignableTeam[] = [];

  for (const day of days) {
    const finishes = finishesByDay[day] ?? [];
    const finishOf = new Map(finishes.map((f) => [f.team, f]));
    // completion[nodeId] → team → produced portions (size+end)
    const completion = new Map<string, Map<string, Produced[]>>();
    for (const node of nodes) {
      const preds = predOf.get(node.nodeId)!;
      const arrivals: Arrival[] = [];
      for (const f of finishes) {
        const size = sizeOf(f.team);
        if (!preds.length) {
          arrivals.push({ team: f.team, categoryId: f.categoryId, size, ready: addMinutes(f.finish, node.anchorOffset) });
        } else if (preds.length === 1) {
          for (const p of completion.get(preds[0]!)?.get(f.team) ?? [])
            arrivals.push({ team: f.team, categoryId: f.categoryId, size: p.size, ready: addMinutes(p.end, node.anchorOffset) });
        } else {
          const ends = preds.map((pid) => (completion.get(pid)?.get(f.team) ?? []).map((p) => p.end)).flat();
          if (!ends.length) continue;
          arrivals.push({ team: f.team, categoryId: f.categoryId, size, ready: addMinutes(ends.reduce(maxTime), node.anchorOffset) });
        }
      }
      const packed = packArrivals(node.pool, arrivals);
      completion.set(node.nodeId, packed.produced);
      const topoIndex = nodes.indexOf(node);
      for (const r of node.pool) turns.push({ resourceId: r.resourceId, day, nodeId: node.nodeId, topoIndex, slots: packed.slotsByRes.get(r.resourceId) ?? [] });
      for (const u of packed.unassignable) unassignable.push({ day, team: u.team, categoryId: u.categoryId, size: u.size });
    }
  }

  const nodeInfos: PlanNodeInfo[] = nodes.map((n, i) => ({ nodeId: n.nodeId, kind: n.kind, label: n.label, icon: n.icon, memberIds: n.memberIds, mode: n.mode, topoIndex: i, predecessorIds: predOf.get(n.nodeId)! }));
  return { days, defaultTeamSize: rc.defaultTeamSize ?? DEFAULT_TEAM_SIZE, teams, turns, unassignable, finishesByDay, nodes: nodeInfos };
}
```
Update the `ResourceDayTurns` and `ResourcePlan` interfaces (`nodeId`, `topoIndex`, `nodes`). Remove the old `assignDay` and its `finishes`-based body once `packArrivals`/`computeResourcePlan` replace it (the manual-`assignments` pinning is re-added in Task A2b below — keep the pinning tests green by porting the pin loop into the root-node arrivals; see note).

**Pinning note:** the former `assignments` pinning must still work. Port it: before packing a node, if the node is a single ungrouped resource that a pinned assignment targets, seed that team's slot at the pinned `slotTime` and exclude it from `arrivals`. Keep the existing `test_plan_manualOverride_movesTeamAcrossResources` green (it pins into an ungrouped resource, which is its own node). Implement by pre-seeding `slotsByRes` for the target resource and recording its produced portion, then filtering the pinned team from that node's arrivals.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: PASS — the 6 new tests + ALL pre-existing resource tests (bin-pack split, leftover fill, manual override, small-teams-share) stay green. If a pre-existing test asserted the old "resources are alternatives" semantics, update it to the confirmed independent-stage behavior (Spec §3.4) and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/resources.ts services/o7-scheduling/test/resources.test.ts
git commit -m "feat(o7-resources): node-graph plan — per-portion flow, join, per-node pack"
```

---

## Task A3: Handler zod + server-side validation (422 on invalid config)

**Files:**
- Modify: `services/o7-scheduling/src/handler.ts:211-222` (extend `resourceConfigBody`; call `validateResourceConfig`)
- Test: `services/o7-scheduling/test/resources.test.ts` (validation is already unit-tested via `validateResourceConfig` in A1; here add a tiny zod-shape test if a handler test harness exists, else rely on A1 + manual `npm run build`).

**Interfaces:**
- Consumes: `validateResourceConfig` (A1), the extended `ResourceConfig` (A1/A2).

- [ ] **Step 1: Extend the zod body + validate**

In `handler.ts`, add schemas near `resourceItem`:
```ts
const groupItem = z.object({ groupId: z.string().min(1), name: z.string().min(1), icon: z.string().optional(), memberIds: z.array(z.string().min(1)), mode: z.enum(['scheduled', 'free']).optional() });
const relationItem = z.object({ from: z.string().min(1), to: z.string().min(1) });
```
Add `.mode` to `resourceItem`: `mode: z.enum(['scheduled', 'free']).optional()`. Extend `resourceConfigBody` with `groups: z.array(groupItem).optional()`, `relations: z.array(relationItem).optional()`. In the PUT handler, after parsing:
```ts
const cfg = resourceConfigBody.parse(await c.req.json());
const err = validateResourceConfig(cfg);
if (err) throw new DomainError('invalid-resource-config', err, 422);
return c.json(await saveResources(resourceRepo)(c.req.param('id'), cfg));
```
Import `DomainError` and `validateResourceConfig`.

- [ ] **Step 2: Build to verify types + zod compile**

Run: `npx nx run o7-scheduling:build` (or `npx tsc -p services/o7-scheduling/tsconfig.json`)
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add services/o7-scheduling/src/handler.ts
git commit -m "feat(o7-resources): accept groups/relations/mode; 422 on invalid config"
```

---

## Task A4: rest-client types

**Files:**
- Modify: `libs/rest-client/src/types.ts`
- Test: `libs/rest-client/test/*` (add a type-level/shape assertion only if the lib has type tests; otherwise `npm run build`).

**Interfaces:**
- Produces (mirror the o7 shapes for the frontend): `NodeMode`, `ResourceGroup`, `ResourceRelation`, `Resource.mode?`, `ResourceConfig.groups?/relations?`, `ResourcePlan.nodes: PlanNodeInfo[]`, `ResourceDayTurns.nodeId/topoIndex`, `PlanNodeInfo`.

- [ ] **Step 1: Add the mirrored types**

In `libs/rest-client/src/types.ts`, next to the existing `Resource`/`ResourceConfig`/`ResourcePlan`:
```ts
export type NodeMode = 'scheduled' | 'free';
export interface ResourceGroup { groupId: string; name: string; icon?: string; memberIds: string[]; mode?: NodeMode }
export interface ResourceRelation { from: string; to: string }
export interface PlanNodeInfo { nodeId: string; kind: 'group' | 'resource'; label: string; icon?: string; memberIds: string[]; mode: NodeMode; topoIndex: number; predecessorIds: string[] }
```
Add `mode?: NodeMode` to `Resource`; `groups?: ResourceGroup[]; relations?: ResourceRelation[]` to `ResourceConfig`; `nodeId: string; topoIndex: number` to `ResourceDayTurns`; `nodes: PlanNodeInfo[]` to `ResourcePlan`.

- [ ] **Step 2: Build**

Run: `npx nx run @playfusion/rest-client:build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/rest-client/src/types.ts
git commit -m "feat(rest-client): resource groups, relations, node mode, plan nodes"
```

---

## Task A5: E1 Risorse tab — groups block, relations block + pipeline map, node-grouped turns

**Files:**
- Modify: `apps/e1-web/src/views/resources.ts`
- Test: `apps/e1-web/test/resources.test.ts`

**Interfaces:**
- Consumes: `ResourceGroup`, `ResourceRelation`, `PlanNodeInfo`, `ResourcePlan.nodes`, `ResourceConfig.groups/relations` (A4).

**UI approach:** add `groupsCard(d)`, `relationsCard(d)` (with a `pipelineMap(nodes)` helper), and change the turns resource `<select>` to group `<optgroup>` by node in topo order. Wire: create/remove group, add/remove relation (call `validateResourceConfig` client-side before saving; inline error on cycle), per-node modalità toggle is added in Wave B (Task B8) — Wave A ships groups + relations + node-grouped turns only.

- [ ] **Step 1: Write the failing tests**

Add to `apps/e1-web/test/resources.test.ts` (extend `base`/`plan` with `nodes`):
```ts
it('renders a group card with members and pool capacity', () => {
  const d = { ...base, config: { ...base.config, resources: [{ resourceId: 's1', name: 'Spogliatoio 1', occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0 }, { resourceId: 's2', name: 'Spogliatoio 2', occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0 }], groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }] } };
  const html = renderResources(d as any);
  expect(html).toContain('Docce');
  expect(html).toContain('Spogliatoio 1');
  expect(html).toContain('pool 20');
});
it('renders relation chips and a pipeline map in topo order', () => {
  const d = { ...base, config: { ...base.config, relations: [{ from: 'docce', to: 'mensa' }] },
    plan: { ...base.plan, nodes: [{ nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] }, { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'scheduled', topoIndex: 1, predecessorIds: ['docce'] }] } };
  const html = renderResources(d as any);
  expect(html).toContain('js-rel-chip');
  expect(html).toContain('pf-pipe');            // the pipeline map container
  expect(html.indexOf('Docce')).toBeLessThan(html.indexOf('Mensa')); // topo order
});
it('groups the turns resource selector by node', () => {
  const d = { ...base, plan: { ...base.plan, nodes: [{ nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1', 's2'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] }],
    turns: [{ resourceId: 's1', day: '2026-09-01', nodeId: 'docce', topoIndex: 0, slots: [] }] } };
  expect(renderResources(d as any)).toContain('<optgroup label="Docce">');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run apps/e1-web/test/resources.test.ts`
Expected: FAIL — no group card / pipeline map / optgroup.

- [ ] **Step 3: Implement the UI blocks**

In `apps/e1-web/src/views/resources.ts` add:
```ts
function groupsCard(d: ResourcesData): string {
  const groups = d.config.groups ?? [];
  const byId = new Map(d.config.resources.map((r) => [r.resourceId, r]));
  const cards = groups.map((g) => {
    const pool = g.memberIds.map((id) => byId.get(id)).filter(Boolean) as typeof d.config.resources;
    const cap = pool.reduce((n, r) => n + r.capacityPersons, 0);
    const members = pool.map((r) => `<span class="pf-pill pf-pill--member">${esc(r.name)} · ${r.capacityPersons}</span>`).join('');
    return `<div class="pf-group"><div class="pf-group__head"><span class="pf-group__name">${g.icon ? esc(g.icon) + ' ' : ''}${esc(g.name)}</span>
      <button class="pf-btn pf-btn--ghost" data-delgroup="${esc(g.groupId)}">Rimuovi gruppo</button>
      <span class="pf-group__cap">pool ${cap} posti</span></div>
      <div class="pf-group__members">${members}</div></div>`;
  }).join('');
  const free = d.config.resources.filter((r) => !groups.some((g) => g.memberIds.includes(r.resourceId)));
  const opts = free.map((r) => `<option value="${esc(r.resourceId)}">${esc(r.name)}</option>`).join('');
  return `<div class="pf-card"><h2 class="pf-h3">Gruppi (pool di capienza)</h2>
    <p class="pf-muted">Risorse dello stesso tipo diventano un unico pool su cui le squadre vengono distribuite.</p>
    ${cards}
    <div class="pf-row" style="margin-top:10px">
      <input id="g-icon" placeholder="🚿" style="width:3.2em" maxlength="2" />
      <input id="g-name" placeholder="Nome gruppo" style="flex:1;min-width:9em" />
      <select id="g-member" multiple size="3" style="min-width:10em">${opts}</select>
      <button class="pf-btn pf-btn--primary" id="g-add">Crea gruppo</button>
    </div></div>`;
}

function pipelineMap(nodes: PlanNodeInfo[]): string {
  // simple topo columns: group nodes by topoIndex "rank" (distance from a root) is overkill; render
  // linearly in topo order with arrows between consecutive nodes that share an edge.
  const cells = nodes.map((n) => `<span class="pf-node${n.predecessorIds.length ? '' : ' pf-node--root'}">${n.icon ? esc(n.icon) + ' ' : ''}${esc(n.label)}</span>`);
  return `<div class="pf-pipe">${cells.join('<span class="pf-arrow">→</span>')}</div>`;
}

function relationsCard(d: ResourcesData): string {
  const nodes = d.plan.nodes ?? [];
  const chips = (d.config.relations ?? []).map((e) => {
    const f = nodes.find((n) => n.nodeId === e.from)?.label ?? e.from;
    const t = nodes.find((n) => n.nodeId === e.to)?.label ?? e.to;
    return `<span class="pf-rel-chip js-rel-chip">${esc(f)} → ${esc(t)} <button class="pf-rel-x" data-delrel="${esc(e.from)}|${esc(e.to)}">✕</button></span>`;
  }).join('');
  const nodeOpts = nodes.map((n) => `<option value="${esc(n.nodeId)}">${esc(n.label)}</option>`).join('');
  return `<div class="pf-card"><h2 class="pf-h3">Sequenza (relazioni)</h2>
    <p class="pf-muted">“A → B”: una squadra entra in B solo dopo aver finito A.</p>
    ${nodes.length ? pipelineMap(nodes) : ''}
    <div class="pf-rel-chips">${chips}</div>
    <div id="rel-err" class="pf-muted" style="color:var(--color-feedback-danger)"></div>
    <div class="pf-row" style="margin-top:12px">
      <select id="rel-from"><option value="">Da…</option>${nodeOpts}</select>
      <span class="pf-mono">→</span>
      <select id="rel-to"><option value="">A…</option>${nodeOpts}</select>
      <button class="pf-btn pf-btn--primary" id="rel-add">Aggiungi relazione</button>
    </div></div>`;
}
```
Import `PlanNodeInfo` from `@playfusion/rest-client`. Insert `${groupsCard(d)}${relationsCard(d)}` into the tab layout after `resourceTable(d.config)` (see the `workspaceShell(... )` call). Change the turns resource `<select>` builder to iterate `d.plan.nodes` (topo order) and, per node, emit `<optgroup label="${esc(node.label)}">` containing that node's member resources (map `memberIds` → resource names). Wire in `mount`: `#g-add` (read icon/name/selected members → push a group with a generated `groupId`, save via `client.o7.saveResources`), `[data-delgroup]` (remove group), `#rel-add` (read from/to → build the candidate config, run `validateResourceConfig` client-side; on error show `#rel-err`, else save), `[data-delrel]` (remove edge). Reuse the existing save+refresh pattern already in the file (the resource add/remove wiring). Add CSS classes (`pf-group`, `pf-pipe`, `pf-node`, `pf-arrow`, `pf-rel-chip`, `pf-pill--member`) to the resources stylesheet the tab already uses (mirror the mockup).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run apps/e1-web/test/resources.test.ts`
Expected: PASS.

- [ ] **Step 5: Full build + suite, then commit**

```bash
npx nx run-many -t build --all && npx nx run-many -t test --all
git add apps/e1-web/src/views/resources.ts apps/e1-web/test/resources.test.ts
git commit -m "feat(e1): resource groups + relations UI, node-grouped turns, pipeline map"
```

**Wave A ships here.** It is deployable on its own (groups + relations, planned, no check-off). Optional: merge to `stage` + tag `stg-resource-groups` for a mid-point deploy before Wave B (ask the user first).

---

# WAVE B — Steward role, check-off, free mode

## File Structure (Wave B)

- `infra/cdk/lib/data-stack.ts` — new `o7-checkoffs` table (PK `sportEventId`, SK `sk`); `infra/cdk/lib/api-stack.ts` — add `o7-checkoffs` to o7's table grants.
- `services/o7-scheduling/src/resource-steward-token.ts` (new) — steward magic-link role/purpose/subject helpers.
- `services/o7-scheduling/src/adapters/dynamodb-checkoff-repository.ts` (new) + `ports.ts` — persist/read check-offs.
- `services/o7-scheduling/src/application/resources.ts` — thread `checkoffs` into the plan.
- `services/o7-scheduling/src/resources.ts` — `checkoffs` param, actual-completion override, free-node handling, `pending`, `served` flags.
- `services/o7-scheduling/src/handler.ts` — mint steward token; check-off POST/DELETE/GET with a steward-or-organizer guard.
- `libs/rest-client/src/types.ts` + `o7.ts` — steward token, check-off calls, `served`/`pending`/free-list plan fields.
- `apps/e3-web/src/views/resource-steward.ts` (new) + `apps/e3-web/src/main.ts` — steward view + route.
- `apps/e1-web/src/views/resources.ts` — steward-link generator, per-node modalità toggle, served ✓ overlay.

---

## Task B1: `o7-checkoffs` table (CDK)

**Files:**
- Modify: `infra/cdk/lib/data-stack.ts:86` (near `o7-resources`), `infra/cdk/lib/api-stack.ts:81` (o7 tables list)

- [ ] **Step 1: Add the table with a sort key**

In `data-stack.ts`, after the `o7-resources` line, add a table WITH a sort key (the `table(base, pk)` helper only sets a PK, so define this one inline like the other composite-key tables in the file):
```ts
this.tables['o7-checkoffs'] = new Table(this, 'o7-checkoffs', {
  tableName: `${prefix}o7-checkoffs`,
  partitionKey: { name: 'sportEventId', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```
(Match the exact construction the file already uses for composite-key tables — copy their `tableName` prefix var, `billingMode`, `removalPolicy`.) In `api-stack.ts` add `'o7-checkoffs'` to the o7-scheduling `tables: [...]` array so the Lambda gets read/write grants.

- [ ] **Step 2: Synthesize to verify CDK compiles**

Run: `npx nx run @playfusion/infra:build` then `cd infra/cdk && npx cdk synth --context env=stg > /dev/null` (or the repo's `npm run synth`).
Expected: no synth error; the template contains `o7-checkoffs`.

- [ ] **Step 3: Commit**

```bash
git add infra/cdk/lib/data-stack.ts infra/cdk/lib/api-stack.ts
git commit -m "feat(infra): o7-checkoffs table (PK sportEventId, SK sk)"
```

---

## Task B2: Check-off repository + port

**Files:**
- Create: `services/o7-scheduling/src/adapters/dynamodb-checkoff-repository.ts`
- Modify: `services/o7-scheduling/src/ports.ts` (add `CheckoffRepository`), `services/o7-scheduling/src/resources.ts` (export `Checkoff` type)
- Test: `services/o7-scheduling/test/checkoff-repository.test.ts` (unit-test the `sk` encoding helpers; the Dynamo calls are covered by the existing integration harness pattern — here test the pure key builder)

**Interfaces:**
- Produces:
  ```ts
  export interface Checkoff { sportEventId: string; nodeId: string; day: string; team: string; servedAt: string }
  export const checkoffSk = (day: string, nodeId: string, team: string): string => `${day}#${nodeId}#${encodeURIComponent(team)}`;
  export interface CheckoffRepository {
    list(sportEventId: string): Promise<Checkoff[]>;
    put(c: Checkoff): Promise<void>;
    delete(sportEventId: string, day: string, nodeId: string, team: string): Promise<void>;
  }
  ```

- [ ] **Step 1: Write the failing test (key builder)**

`services/o7-scheduling/test/checkoff-repository.test.ts`:
```ts
import { test, expect } from 'vitest';
import { checkoffSk } from '../src/resources.js';
test('test_checkoffSk_encodesTeamAndJoins', () => {
  expect(checkoffSk('2026-09-10', 'docce', 'Leoni Monselice')).toBe('2026-09-10#docce#Leoni%20Monselice');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o7-scheduling/test/checkoff-repository.test.ts`
Expected: FAIL — `checkoffSk` not exported.

- [ ] **Step 3: Implement type + key + repository + port**

In `resources.ts` export `Checkoff` and `checkoffSk` (above). In `ports.ts` add the `CheckoffRepository` interface. Create the adapter:
```ts
import { QueryCommand, PutCommand, DeleteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { resourceName } from '@playfusion/platform-lib';
import { checkoffSk, type Checkoff } from '../resources.js';
import type { CheckoffRepository } from '../ports.js';

export class DynamoDbCheckoffRepository implements CheckoffRepository {
  constructor(private readonly db: DynamoDBDocumentClient, private readonly table = resourceName('o7-checkoffs')) {}
  async list(sportEventId: string): Promise<Checkoff[]> {
    const res = await this.db.send(new QueryCommand({ TableName: this.table, KeyConditionExpression: 'sportEventId = :e', ExpressionAttributeValues: { ':e': sportEventId } }));
    return (res.Items ?? []).map((i) => ({ sportEventId, nodeId: i.nodeId, day: i.day, team: i.team, servedAt: i.servedAt }));
  }
  async put(c: Checkoff): Promise<void> {
    await this.db.send(new PutCommand({ TableName: this.table, Item: { sportEventId: c.sportEventId, sk: checkoffSk(c.day, c.nodeId, c.team), nodeId: c.nodeId, day: c.day, team: c.team, servedAt: c.servedAt } }));
  }
  async delete(sportEventId: string, day: string, nodeId: string, team: string): Promise<void> {
    await this.db.send(new DeleteCommand({ TableName: this.table, Key: { sportEventId, sk: checkoffSk(day, nodeId, team) } }));
  }
}
```

- [ ] **Step 4: Run to verify it passes + build**

Run: `npx vitest run services/o7-scheduling/test/checkoff-repository.test.ts && npx nx run o7-scheduling:build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/adapters/dynamodb-checkoff-repository.ts services/o7-scheduling/src/ports.ts services/o7-scheduling/src/resources.ts services/o7-scheduling/test/checkoff-repository.test.ts
git commit -m "feat(o7-resources): check-off repository + sk key"
```

---

## Task B3: Engine — check-off overrides, free nodes, pending

**Files:**
- Modify: `services/o7-scheduling/src/resources.ts` (add `checkoffs` param + free/pending output)
- Test: `services/o7-scheduling/test/resources.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // TurnTeam gains: served?: boolean; servedAt?: string
  export interface FreeNodeList { nodeId: string; day: string; teams: { team: string; categoryId: string; served?: boolean; servedAt?: string }[] }
  export interface PendingArrival { nodeId: string; day: string; team: string; categoryId: string; waitingFor: string }
  // ResourcePlan gains: freeLists: FreeNodeList[]; pending: PendingArrival[]
  export function computeResourcePlan(matches, config, rc, teamsByCat, checkoffs?: Checkoff[]): ResourcePlan
  ```

**Design:** for each `(day, node, team)`, if a check-off exists → that team's completion at the node = `[{ size: teamSize, end: servedAt }]` (whole team, one portion) and its slot rows get `served/servedAt`. A **free node** produces no slots — instead a `FreeNodeList` entry with all reaching teams (served flag from check-offs); its completion = `[{size, end: servedAt}]` if served, else none (undefined). A scheduled node whose arrivals are empty for a team that HAS reached the pipeline but whose predecessor completion is missing → add a `PendingArrival` (`waitingFor` = the first predecessor's label).

- [ ] **Step 1: Write the failing tests**

```ts
import { computeResourcePlan, type Checkoff } from '../src/resources.js';
const co = (nodeId: string, team: string, servedAt: string): Checkoff => ({ sportEventId: 'e', nodeId, day: '2026-09-01', team, servedAt });

test('test_plan_checkoffOverridesCompletion_successorReAnchors', () => {
  const rc = { resources: [R('docce', { capacityPersons: 20 }), R('mensa', { capacityPersons: 20, offsetMinutes: 0 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A']]]), [co('docce', 'A', '10:40')]);
  // planned docce end would be 10:20; the check-off says 10:40 → mensa anchors to 10:40.
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!.time).toBe('10:40');
});

test('test_plan_freeNode_producesListNotSlots', () => {
  const rc = { resources: [R('mensa', { capacityPersons: 40, mode: 'free' })] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A', 'B']]]), []);
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots).toHaveLength(0);
  const list = p.freeLists.find((f) => f.nodeId === 'mensa')!;
  expect(list.teams.map((t) => t.team).sort()).toEqual(['A', 'B']);
});

test('test_plan_freeNode_servedFlagFromCheckoff', () => {
  const rc = { resources: [R('mensa', { capacityPersons: 40, mode: 'free' })] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A', 'B']]]), [co('mensa', 'A', '11:00')]);
  const list = p.freeLists.find((f) => f.nodeId === 'mensa')!;
  expect(list.teams.find((t) => t.team === 'A')!.served).toBe(true);
  expect(list.teams.find((t) => t.team === 'B')!.served).toBeFalsy();
});

test('test_plan_pendingWhenFreePredecessorNotCheckedOff', () => {
  const rc = { resources: [R('docce', { capacityPersons: 20, mode: 'free' }), R('mensa', { capacityPersons: 20 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A']]]), []); // docce free, not served
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots).toHaveLength(0); // A not seated yet
  expect(p.pending.some((x) => x.nodeId === 'mensa' && x.team === 'A')).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: FAIL — `checkoffs` param / `freeLists` / `pending` absent.

- [ ] **Step 3: Implement**

Extend the interfaces (`TurnTeam.served/servedAt`, `FreeNodeList`, `PendingArrival`, `ResourcePlan.freeLists/pending`). Add the 5th param `checkoffs: Checkoff[] = []`. Build a lookup `served = new Map<string, string>()` keyed `${day}#${nodeId}#${team}` → `servedAt`. In the per-node loop:
- If `node.mode === 'free'`: skip packing. For each team reaching the node (arrivals computed as usual, but only to know *which* teams reach it — a team reaches a free node if all its predecessors produced completion, or it's a root), push a `FreeNodeList` entry with `served`/`servedAt` from the lookup. Its completion for a team = `[{ size, end: servedAt }]` when served, else omit (so successors see it undefined → pending).
- For a **scheduled** node, after computing `arrivals`: for any team that has a check-off at THIS node, override its completion to `[{ size: teamSize, end: servedAt }]` (whole team) INSTEAD of the packed produced, and set `served/servedAt` on its slot rows (find the team's rows and flag them). Simplest: after packing, if `served.has(key)`, overwrite `completion[node][team]` with the actual and mark rows.
- **Pending**: for a scheduled node, a team that appears in `finishes` but whose predecessor completion is missing (empty arrivals for that team while it has ≥1 predecessor) → push `{ nodeId, day, team, categoryId, waitingFor: predOf(node)[0]'s label }`.
Keep Wave A tests green (no checkoffs, no free → identical output; `freeLists: []`, `pending: []`).

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: PASS (new + all prior).

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/resources.ts services/o7-scheduling/test/resources.test.ts
git commit -m "feat(o7-resources): check-off overrides, free nodes, pending arrivals"
```

---

## Task B4: Steward token + mint endpoint + guard

**Files:**
- Create: `services/o7-scheduling/src/resource-steward-token.ts`
- Modify: `services/o7-scheduling/src/handler.ts` (mint endpoint + a `requireSteward` guard)
- Test: `services/o7-scheduling/test/resource-steward-token.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STEWARD_ROLE = 'ResourceSteward';
  export const STEWARD_PURPOSE = 'resource-steward';
  export const stewardSubject = (eventId: string): string => `steward:${eventId}`;
  export function parseStewardScope(subject: string): { eventId: string } | null;
  ```

- [ ] **Step 1: Write the failing test**

`services/o7-scheduling/test/resource-steward-token.test.ts`:
```ts
import { test, expect } from 'vitest';
import { stewardSubject, parseStewardScope } from '../src/resource-steward-token.js';
test('test_stewardSubject_roundTrips', () => {
  expect(parseStewardScope(stewardSubject('ev-1'))).toEqual({ eventId: 'ev-1' });
  expect(parseStewardScope('director:x:y')).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o7-scheduling/test/resource-steward-token.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement token helpers + endpoint + guard**

Create `resource-steward-token.ts` (mirror `director-token.ts`):
```ts
export const STEWARD_ROLE = 'ResourceSteward';
export const STEWARD_PURPOSE = 'resource-steward';
export const stewardSubject = (eventId: string): string => `steward:${eventId}`;
export function parseStewardScope(subject: string): { eventId: string } | null {
  const parts = subject.split(':');
  if (parts.length < 2 || parts[0] !== 'steward' || !parts[1]) return null;
  return { eventId: parts[1] };
}
```
In `handler.ts`: mint endpoint (organizer):
```ts
app.post('/events/:id/resource-steward-token', organizer, async (c) => {
  const sportEventId = c.req.param('id');
  const ttlSeconds = 60 * 60 * 24 * 30;
  const token = signMagicLink({ subject: stewardSubject(sportEventId), roles: [STEWARD_ROLE], purpose: STEWARD_PURPOSE, ttlSeconds });
  return c.json({ token });
});
```
Add a `requireSteward` middleware that accepts an organizer JWT OR a steward magic link scoped to the same event (mirror `requireResultReporter`):
```ts
const requireSteward = async (c, next) => {
  const token = bearerToken(c);
  const magic = verifyMagicLink(token, { purpose: STEWARD_PURPOSE });
  if (magic && magic.roles.includes(STEWARD_ROLE)) {
    const scope = parseStewardScope(magic.subject);
    if (!scope || scope.eventId !== c.req.param('id')) throw new ForbiddenError('token addetto non valido per questo evento');
    return next();
  }
  return organizer(c, next); // fall back to organizer JWT
};
```

- [ ] **Step 4: Run to verify it passes + build**

Run: `npx vitest run services/o7-scheduling/test/resource-steward-token.test.ts && npx nx run o7-scheduling:build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/resource-steward-token.ts services/o7-scheduling/src/handler.ts services/o7-scheduling/test/resource-steward-token.test.ts
git commit -m "feat(o7-resources): resource-steward magic-link token + guard"
```

---

## Task B5: Check-off endpoints (POST/DELETE/GET) + plan wiring

**Files:**
- Modify: `services/o7-scheduling/src/handler.ts` (3 routes), `services/o7-scheduling/src/application/resources.ts` (thread checkoffs into the plan), `services/o7-scheduling/src/handler.ts:33` (instantiate `checkoffRepo`)
- Test: `services/o7-scheduling/test/resources.test.ts` (plan-with-checkoffs already covered in B3; here ensure the application function passes them through — a small unit test with fake repos)

**Interfaces:**
- Consumes: `CheckoffRepository` (B2), `computeResourcePlan(...checkoffs)` (B3), `requireSteward` (B4).

- [ ] **Step 1: Write the failing test (application threads checkoffs)**

Add to a suitable o7 application test (or `resources.test.ts`):
```ts
import { getResourcePlan } from '../src/application/resources.js';
test('test_getResourcePlan_passesCheckoffsToEngine', async () => {
  const fake = {
    resources: { get: async () => ({ resources: [{ resourceId: 'mensa', name: 'M', occupancyMinutes: 30, capacityPersons: 40, offsetMinutes: 0, mode: 'free' }] }) },
    matches: { list: async () => [m('A', 'B', '09:00')] },
    schedules: { get: async () => ({ config }) },
    teams: { confirmedByCategory: async () => new Map([['U10', ['A']]]) },
    checkoffs: { list: async () => [{ sportEventId: 'e', nodeId: 'mensa', day: '2026-09-01', team: 'A', servedAt: '11:00' }] },
  } as any;
  const plan = await getResourcePlan(fake)('e');
  expect(plan.freeLists[0]!.teams.find((t: any) => t.team === 'A')!.served).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts`
Expected: FAIL — `getResourcePlan` ignores checkoffs.

- [ ] **Step 3: Implement**

In `application/resources.ts`: add `checkoffs: CheckoffRepository` to `ResourcePlanDeps`; in `getResourcePlan`, `Promise.all` also `deps.checkoffs.list(sportEventId)` and pass it as the 5th arg to `computeResourcePlan`. In `handler.ts` instantiate `const checkoffRepo = new DynamoDbCheckoffRepository(db);`, pass it into the `getResourcePlan({ ... checkoffs: checkoffRepo })` deps, and add:
```ts
const checkoffBody = z.object({ nodeId: z.string().min(1), day: z.string().min(1), team: z.string().min(1) });
app.get('/events/:id/resource-checkoffs', requireSteward, async (c) => c.json(await checkoffRepo.list(c.req.param('id'))));
app.post('/events/:id/resource-checkoffs', requireSteward, async (c) => {
  const b = checkoffBody.parse(await c.req.json());
  const servedAt = new Date().toISOString().slice(11, 16); // HH:MM server time (plan times are HH:MM)
  await checkoffRepo.put({ sportEventId: c.req.param('id'), ...b, servedAt });
  return c.body(null, 201);
});
app.delete('/events/:id/resource-checkoffs/:nodeId/:day/:team', requireSteward, async (c) =>
  { await checkoffRepo.delete(c.req.param('id'), c.req.param('day'), c.req.param('nodeId'), decodeURIComponent(c.req.param('team'))); return c.body(null, 204); });
```
(`servedAt` as `HH:MM` keeps it comparable with the plan's `addMinutes` times; if the event spans days this is per-day which matches the `day` field. Note in a comment that `new Date()` here is a handler side-effect, NOT inside the pure engine.)

- [ ] **Step 4: Run to verify it passes + build**

Run: `npx vitest run services/o7-scheduling/test/resources.test.ts && npx nx run o7-scheduling:build`
Expected: PASS + clean build.

- [ ] **Step 5: Commit**

```bash
git add services/o7-scheduling/src/handler.ts services/o7-scheduling/src/application/resources.ts services/o7-scheduling/test/resources.test.ts
git commit -m "feat(o7-resources): check-off endpoints + plan wiring (servedAt server-side)"
```

---

## Task B6: rest-client — steward token, check-off calls, plan fields

**Files:**
- Modify: `libs/rest-client/src/types.ts`, `libs/rest-client/src/o7.ts`
- Test: build only (or a shape test if the lib has one)

- [ ] **Step 1: Add types + client methods**

In `types.ts`: `TurnTeam.served?/servedAt?`, `FreeNodeList`, `PendingArrival`, `ResourcePlan.freeLists/pending`, `Checkoff`. In `o7.ts` add:
```ts
stewardToken: (eventId) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(eventId)}/resource-steward-token`, {}),
listCheckoffs: (eventId) => request(cfg, 'GET', `/o7/events/${encodeURIComponent(eventId)}/resource-checkoffs`),
markCheckoff: (eventId, body) => request(cfg, 'POST', `/o7/events/${encodeURIComponent(eventId)}/resource-checkoffs`, body),
unmarkCheckoff: (eventId, nodeId, day, team) => request(cfg, 'DELETE', `/o7/events/${encodeURIComponent(eventId)}/resource-checkoffs/${encodeURIComponent(nodeId)}/${encodeURIComponent(day)}/${encodeURIComponent(team)}`),
```
Add matching method signatures to the o7 client interface.

- [ ] **Step 2: Build**

Run: `npx nx run @playfusion/rest-client:build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add libs/rest-client/src/types.ts libs/rest-client/src/o7.ts
git commit -m "feat(rest-client): steward token + check-off calls + plan served/pending"
```

---

## Task B7: E3 steward view + route

**Files:**
- Create: `apps/e3-web/src/views/resource-steward.ts`
- Modify: `apps/e3-web/src/main.ts` (add `#/events/:id/resources` route, steward-gated)
- Test: `apps/e3-web/test/resource-steward.test.ts`

**Interfaces:**
- Consumes: `ResourcePlan` (nodes, turns, freeLists, pending), `client.o7.getResourcePlan`, `listCheckoffs`, `markCheckoff`, `unmarkCheckoff`; the magic-link auth already wired in `apps/e3-web/src/main.ts` (see the `/director` route).

- [ ] **Step 1: Write the failing test**

`apps/e3-web/test/resource-steward.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { renderResourceSteward } from '../src/views/resource-steward';
const ev = { sportEventId: 'e', name: 'Test', sport: 'calcio' } as any;
const plan = {
  days: ['2026-09-10'], defaultTeamSize: 14, teams: [], unassignable: [], finishesByDay: {},
  nodes: [
    { nodeId: 'docce', kind: 'group', label: 'Docce', memberIds: ['s1'], mode: 'scheduled', topoIndex: 0, predecessorIds: [] },
    { nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 1, predecessorIds: ['docce'] },
  ],
  turns: [{ resourceId: 's1', day: '2026-09-10', nodeId: 'docce', topoIndex: 0, slots: [{ time: '10:30', capacity: 10, persons: 10, overflow: false, teams: [{ team: 'Leoni', categoryId: '1', size: 10 }] }] }],
  freeLists: [{ nodeId: 'mensa', day: '2026-09-10', teams: [{ team: 'Leoni', categoryId: '1', served: true, servedAt: '11:00' }, { team: 'Aquile', categoryId: '1' }] }],
  pending: [{ nodeId: 'mensa', day: '2026-09-10', team: 'Aquile', categoryId: '1', waitingFor: 'Docce' }],
} as any;

describe('e3 resource steward', () => {
  it('renders nodes in pipeline order with a check-off toggle on scheduled slots', () => {
    const html = renderResourceSteward(ev, plan, '2026-09-10');
    expect(html.indexOf('Docce')).toBeLessThan(html.indexOf('Mensa'));
    expect(html).toContain('js-checkoff');            // toggle control
    expect(html).toContain('Leoni');
  });
  it('renders a free node as a flat list with a served/total counter', () => {
    const html = renderResourceSteward(ev, plan, '2026-09-10');
    expect(html).toContain('1/2');                    // Leoni served of 2
  });
  it('greys out a pending team', () => {
    expect(renderResourceSteward(ev, plan, '2026-09-10')).toContain('in attesa');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run apps/e3-web/test/resource-steward.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view + route**

Create `resource-steward.ts` exporting `renderResourceSteward(event, plan, day)` and `wireResourceSteward(root, client, eventId, day, plan)`. Render nodes by `plan.nodes` (topo order); for a **scheduled** node, render its member slots (reuse `renderCalendar`-style slot markup from `app-shell`, or a local slot renderer) with each team row carrying a `<button class="js-checkoff" data-node data-team data-served>` toggle; mark pending teams (from `plan.pending`) greyed with "in attesa · <waitingFor>". For a **free** node, render `plan.freeLists` entry as a flat list + a `served/total` counter. Wiring: click toggle → optimistic class flip → `markCheckoff`/`unmarkCheckoff` → re-fetch plan + checkoffs → re-render. In `apps/e3-web/src/main.ts` add:
```ts
.on('#/events/:id/resources', async ({ id }) => {
  try {
    const [ev, plan] = await Promise.all([client.o3.getEvent(id), client.o7.getResourcePlan(id)]);
    await applyEventBrand(ev);
    const day = plan.days[0] ?? '';
    app.innerHTML = renderResourceSteward(ev, plan, day); wireResourceSteward(app, client.o7, id, day, plan);
  } catch { app.innerHTML = errorCard('Si è verificato un errore. Ricarica la pagina.'); }
})
```
(The steward token is captured by the existing `captureMagicLink`/`magicLinkAuthProvider` already in `main.ts`, so the check-off calls carry it as bearer.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run apps/e3-web/test/resource-steward.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/e3-web/src/views/resource-steward.ts apps/e3-web/src/main.ts apps/e3-web/test/resource-steward.test.ts
git commit -m "feat(e3): resource steward view — check-off board + free lists + pending"
```

---

## Task B8: E1 — steward link generator, per-node modalità toggle, served overlay

**Files:**
- Modify: `apps/e1-web/src/views/resources.ts`
- Test: `apps/e1-web/test/resources.test.ts`

**Interfaces:**
- Consumes: `client.o7.stewardToken`, `ResourcePlan.nodes` (mode), `ResourceConfig.groups/resources` (mode), the E3 base URL already used for director links (`ctx.e3BaseUrl`).

- [ ] **Step 1: Write the failing tests**

```ts
it('shows a generate-steward-link control', () => {
  expect(renderResources(base as any)).toContain('js-steward-link');
});
it('shows a per-node mode toggle (scheduled/free)', () => {
  const d = { ...base, plan: { ...base.plan, nodes: [{ nodeId: 'mensa', kind: 'resource', label: 'Mensa', memberIds: ['mensa'], mode: 'free', topoIndex: 0, predecessorIds: [] }] } };
  const html = renderResources(d as any);
  expect(html).toContain('js-node-mode');
  expect(html).toContain('Libera');
});
it('overlays a served tick on a checked-off turn row', () => {
  const d = { ...base, plan: { ...base.plan, turns: [{ resourceId: 'r', day: '2026-09-01', nodeId: 'r', topoIndex: 0, slots: [{ time: '10:00', capacity: 10, persons: 10, overflow: false, teams: [{ team: 'Leoni', categoryId: '1', size: 10, served: true, servedAt: '10:05' }] }] }] } };
  expect(renderResources(d as any)).toContain('✓');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run apps/e1-web/test/resources.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

Add a `stewardLinkCard()` (button `js-steward-link` + copy field, mirroring the director-link wiring already in the file: on click → `client.o7.stewardToken(id)` → build `${ctx.e3BaseUrl}/e3/?token=…#/events/${id}/resources` → copy). Add a per-node modalità control in the node config area: for each node a segmented `js-node-mode` toggle (Calendario/Libera) that patches the node's `mode` on the group (or resource) and saves the config. In `slotHtml`, when a team row has `served`, append a `✓ ${servedAt}` marker (read-only overlay). Reuse the existing save+refresh pattern.

- [ ] **Step 4: Run to verify they pass + full suite/build**

Run: `npx vitest run apps/e1-web/test/resources.test.ts && npx nx run-many -t build --all && npx nx run-many -t test --all`
Expected: PASS across all 17 projects.

- [ ] **Step 5: Commit**

```bash
git add apps/e1-web/src/views/resources.ts apps/e1-web/test/resources.test.ts
git commit -m "feat(e1): steward link generator, per-node modalità toggle, served overlay"
```

---

## Deploy (after user approval)

Wave A and Wave B can deploy together or separately. To deploy: merge `feature/resource-groups-relations` → `stage`, tag `stg-resource-groups` (Wave A) and/or `stg-resource-steward` (Wave B), push, watch `deploy-stage.yml`. Wave B requires the CDK deploy (new table) — the deploy-stage workflow runs `cdk deploy`, which creates `o7-checkoffs`. Do NOT merge/tag/push without explicit user authorization per repo rules.

---

## Self-Review (author checklist — completed)

**Spec coverage:** §4 model → A1/A4; §5 engine → A2 + B3; §5.1 cycle guard → A1; §5.5 check-off/free/pending → B3; §6 API → A3 + B5; §11 steward role → B4; §12 check-off store → B1/B2/B5; §13 free mode & steward view → B3/B7; §7 UI → A5 + B8; §8/§14 testing → per-task tests. All spec sections map to a task.

**Placeholder scan:** no TBD/"handle edge cases"/"similar to Task N" — each step has real code or a concrete command.

**Type consistency:** `PlanNode`/`PlanNodeInfo`, `Arrival`/`Produced`, `Checkoff`/`checkoffSk`, `computeResourcePlan(...checkoffs?)`, `FreeNodeList`/`PendingArrival`, steward `STEWARD_ROLE`/`STEWARD_PURPOSE`/`stewardSubject`/`parseStewardScope` are used identically across the tasks that define and consume them. `ResourcePlan` grows monotonically (A2 adds `nodes`; B3 adds `freeLists`/`pending`) — later tasks build on earlier fields, no renames.
