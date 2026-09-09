import { DomainError } from '@playfusion/platform-lib';
import { categoryConfig, type ScheduleConfig, type ScheduledMatch } from './domain.js';

/** S17 — event resources & post-match logistics (docce, terzo tempo, …). A Resource has an
 *  occupancy duration, a person-capacity teams share, and an offset from a team's match finish.
 *  Turns are packed on read (pure, like standings/finals): a team's finish is DERIVED from its last
 *  match of the day (`time + slotMinutes(category)`), never entered by hand. `teamSizes`/`defaultTeamSize`
 *  live here in o7 (per team label) rather than on o3/o5 — no cross-BC schema coupling (ADR-002). */

export const DEFAULT_TEAM_SIZE = 14;

export type NodeMode = 'scheduled' | 'free';

export interface Resource {
  resourceId: string;
  name: string;
  icon?: string;
  occupancyMinutes: number;
  capacityPersons: number;
  offsetMinutes: number;
  mode?: NodeMode;
}
/** A manual override: pin `team` into `resource`'s slot at `slotTime` on `day` (S17 "sposta"). */
export interface ResourceAssignment { resourceId: string; day: string; team: string; slotTime: string }
/** A named cluster of resources presented (and scheduled) as a single node — e.g. "Docce" grouping
 *  several shower rooms. Anchor offset for scheduling purposes is the FIRST member's offsetMinutes. */
export interface ResourceGroup { groupId: string; name: string; icon?: string; memberIds: string[]; mode?: NodeMode }
/** A directed edge between two plan node ids (group or ungrouped resource), e.g. "Docce" → "Mensa". */
export interface ResourceRelation { from: string; to: string }
export interface ResourceConfig {
  resources: Resource[];
  defaultTeamSize?: number;
  teamSizes?: Record<string, number>;
  assignments?: ResourceAssignment[];
  groups?: ResourceGroup[];
  relations?: ResourceRelation[];
}

/** One node in the scheduling graph: either a ResourceGroup (pool = its members) or a single ungrouped
 *  Resource (pool = itself). `anchorOffset` drives scheduling order/timing for the node as a whole. */
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

/** B1/B2: a check-off record — a team was marked served at a plan node on a given day. Keyed in
 *  DynamoDB by (sportEventId, sk) where sk = checkoffSk(day, nodeId, team). */
export interface Checkoff { sportEventId: string; nodeId: string; day: string; team: string; servedAt: string }
/** The `sk` for one check-off: day#nodeId#encodeURIComponent(team) — team is URI-encoded since it may
 *  contain spaces/punctuation that would otherwise collide with the `#` separator. */
export const checkoffSk = (day: string, nodeId: string, team: string): string => `${day}#${nodeId}#${encodeURIComponent(team)}`;

export interface TeamFinish { team: string; categoryId: string; finish: string }
/** `served`/`servedAt` are set when a check-off overrode this team's slot (B3): the plan's computed
 *  `time` is left untouched (that's where the pool put it), but the row is flagged with the REAL
 *  check-off time so the UI can show the discrepancy. */
export interface TurnTeam { team: string; categoryId: string; size: number; pinned?: boolean; served?: boolean; servedAt?: string }
export interface ResourceSlot { time: string; teams: TurnTeam[]; persons: number; capacity: number; overflow: boolean }
/** One resource's turns for one day. `nodeId`/`topoIndex` identify the plan node (group or ungrouped
 *  resource) this resource belongs to and its position in schedule order. */
export interface ResourceDayTurns { resourceId: string; resourceName: string; day: string; nodeId: string; topoIndex: number; slots: ResourceSlot[] }
export interface UnassignableTeam { day: string; team: string; categoryId: string; size: number }
/** Read-model summary of one plan node, for UI rendering of the node graph alongside the plan. */
export interface PlanNodeInfo { nodeId: string; kind: 'group' | 'resource'; label: string; icon?: string; memberIds: string[]; mode: NodeMode; topoIndex: number; predecessorIds: string[] }
/** B3: a `mode: 'free'` node (e.g. a self-service buffet) has no capacity-driven slots — every team
 *  that reaches it is just listed, with a `served` flag/`servedAt` time when a check-off exists for it. */
export interface FreeNodeList { nodeId: string; day: string; teams: { team: string; categoryId: string; served?: boolean; servedAt?: string }[] }
/** B3: a team that reached the pipeline (it has ≥1 predecessor at this node) but whose predecessor
 *  completion is missing (e.g. stuck at an un-checked-off free node) — surfaced instead of silently
 *  dropped, so the UI can show "waiting for X". */
export interface PendingArrival { nodeId: string; day: string; team: string; categoryId: string; waitingFor: string }
export interface ResourcePlan {
  days: string[];
  defaultTeamSize: number;
  teams: { team: string; categoryId: string; size: number }[];
  turns: ResourceDayTurns[];
  /** Residual people a day's total resource capacity could not seat (team size > sum of all room
   *  capacities). `size` is the number of unseated people, not necessarily the whole team — a team
   *  is split across rooms first, and only the overflow beyond the pool surfaces here. */
  unassignable: UnassignableTeam[];
  finishesByDay: Record<string, TeamFinish[]>;
  /** The scheduling node graph (groups + ungrouped resources) in topo order, for UI display. */
  nodes: PlanNodeInfo[];
  /** One entry per (day, free node) reached by ≥1 team — see `FreeNodeList`. */
  freeLists: FreeNodeList[];
  /** Teams stuck behind a missing predecessor completion — see `PendingArrival`. */
  pending: PendingArrival[];
}

const toMinutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
const addMinutes = (hhmm: string, mins: number): string => {
  const total = toMinutes(hhmm) + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(((total % 60) + 60) % 60).padStart(2, '0')}`;
};
const slotMinutesOf = (config: ScheduleConfig, categoria: string): number => {
  const cc = categoryConfig(config, categoria);
  return cc.periods * cc.periodMinutes + cc.breakMinutes;
};

/** When a match ends = kickoff + the category's slot length (periods·periodMinutes + break). */
export function matchEnd(m: ScheduledMatch, slotMinutes: number): string { return addMinutes(m.time, slotMinutes); }

export function teamSizeOf(rc: ResourceConfig, team: string): number {
  return rc.teamSizes?.[team] ?? rc.defaultTeamSize ?? DEFAULT_TEAM_SIZE;
}

/** Per day, each known team's finish = the end of its LAST match that day. Sorted by finish then name.
 *  `known` filters out finals placeholders (only real team labels get a logistics turn). */
export function teamFinishes(matches: ScheduledMatch[], config: ScheduleConfig, known: Set<string>): Record<string, TeamFinish[]> {
  const byDay = new Map<string, Map<string, { categoryId: string; finish: string }>>();
  for (const m of matches) {
    const end = matchEnd(m, slotMinutesOf(config, m.categoryId));
    for (const team of [m.homeResolved ?? m.home, m.awayResolved ?? m.away]) {
      if (!known.has(team)) continue;
      const day = byDay.get(m.day) ?? new Map(); byDay.set(m.day, day);
      const cur = day.get(team);
      if (!cur || end > cur.finish) day.set(team, { categoryId: m.categoryId, finish: end });
    }
  }
  const out: Record<string, TeamFinish[]> = {};
  for (const [day, teams] of byDay)
    out[day] = [...teams].map(([team, v]) => ({ team, categoryId: v.categoryId, finish: v.finish }))
      .sort((a, b) => a.finish.localeCompare(b.finish) || a.team.localeCompare(b.team));
  return out;
}

const maxTime = (a: string, b: string): string => (a.localeCompare(b) >= 0 ? a : b);

/** One portion of a team arriving at a node: a team may bring several arrivals (portions) into the
 *  SAME node when it was itself split upstream (e.g. split across two group members, or split by a
 *  join). `ready` is when this portion may start being served. */
interface Arrival { team: string; categoryId: string; size: number; ready: string }
/** One produced portion once a node has served an arrival: how many people, and when they're done
 *  (`slotStart + memberOccupancy`) — feeds the next node's `ready` time downstream. */
interface Produced { size: number; end: string }

/** Greedy bin-pack of one node's arrivals into its member pool (the algorithm formerly in `assignDay`,
 *  generalized to per-arrival `ready` times instead of one shared team-finish). A team/arrival prefers a
 *  SINGLE pool member that can hold it whole (joining a compatible slot with room, or a fresh slot);
 *  arrivals sharing a slot must fit together and be ready within its occupancy window. When no single
 *  member can hold it whole, it is SPLIT across fresh concurrent slots (bin-packing the pool: 14 people →
 *  member A ×10 + member B ×4). The leftover seats those partial slots expose are then filled by later
 *  small arrivals via the normal join path. `unassignable` carries only the RESIDUAL people the pool
 *  could not seat at all. Pinned assignments are handled by the caller (pre/post-seeding), not here. Pure. */
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

/** The full plan for one event: known teams (with sizes), scheduled days, every plan node's member
 *  turns per day, and any people that fit no resource. Ungrouped resources are INDEPENDENT stages — a
 *  team visits every one of them (they are no longer alternatives sharing a pool); a `ResourceGroup`'s
 *  members share one pool (bin-packed together); `ResourceRelation`s chain nodes so a successor's
 *  arrivals are anchored to its predecessor(s)' completion (join = max of predecessors) rather than the
 *  raw match finish. `teamsByCat` are the confirmed teams from o5 (label → category). Manual
 *  `assignments` pin a team into one member resource's slot, excluding it from every node's automatic
 *  routing that day (see the pinning note in the o7 resources brief). Pure. */
export function computeResourcePlan(matches: ScheduledMatch[], config: ScheduleConfig, rc: ResourceConfig, teamsByCat: Map<string, string[]>, checkoffs: Checkoff[] = []): ResourcePlan {
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
  const labelOf = new Map(nodes.map((n) => [n.nodeId, n.label]));
  // Which node owns each member resource (a pin targets a resource → its owning node).
  const nodeOfResource = new Map<string, string>();
  for (const n of nodes) for (const r of n.pool) nodeOfResource.set(r.resourceId, n.nodeId);
  // B3: check-offs keyed exactly like `checkoffSk`, for O(1) lookup while walking the plan.
  const servedAtOf = new Map<string, string>(checkoffs.map((c) => [`${c.day}#${c.nodeId}#${c.team}`, c.servedAt]));

  const turns: ResourceDayTurns[] = [];
  const unassignable: UnassignableTeam[] = [];
  const freeLists: FreeNodeList[] = [];
  const pending: PendingArrival[] = [];

  for (const day of days) {
    const finishes = finishesByDay[day] ?? [];
    const finishOf = new Map(finishes.map((f) => [f.team, f]));
    // A pin fixes a team's slot at exactly ONE node (the one owning its target resource). The team is
    // excluded from automatic routing ONLY at that node and pre-seeded there; at every OTHER node it
    // flows normally (independent-stage root arrival, or per-portion/join flow from predecessors).
    const pinnedByTeam = new Map((rc.assignments ?? []).filter((a) => a.day === day).map((a) => [a.team, a]));
    const pinNodeOf = (team: string): string | undefined => {
      const a = pinnedByTeam.get(team); return a ? nodeOfResource.get(a.resourceId) : undefined;
    };
    // completion[nodeId] → team → produced portions (size+end)
    const completion = new Map<string, Map<string, Produced[]>>();
    for (const [i, node] of nodes.entries()) {
      const preds = predOf.get(node.nodeId)!;
      const arrivals: Arrival[] = [];
      for (const f of finishes) {
        if (pinNodeOf(f.team) === node.nodeId) continue; // pinned INTO this node → seeded manually below
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
      if (node.mode === 'free') {
        // B3: a free node has no capacity/slots — list every reaching team instead of packing. A
        // team may have reached it as several upstream portions; dedupe to one list row per team.
        const reaching = new Map<string, { team: string; categoryId: string }>();
        for (const a of arrivals) if (!reaching.has(a.team)) reaching.set(a.team, { team: a.team, categoryId: a.categoryId });
        const nodeCompletion = new Map<string, Produced[]>();
        const listTeams: FreeNodeList['teams'] = [];
        for (const { team, categoryId } of reaching.values()) {
          const servedAt = servedAtOf.get(`${day}#${node.nodeId}#${team}`);
          if (servedAt !== undefined) {
            listTeams.push({ team, categoryId, served: true, servedAt });
            nodeCompletion.set(team, [{ size: sizeOf(team), end: servedAt }]);
          } else {
            listTeams.push({ team, categoryId });
          }
        }
        freeLists.push({ nodeId: node.nodeId, day, teams: listTeams });
        completion.set(node.nodeId, nodeCompletion);
        for (const r of node.pool) turns.push({ resourceId: r.resourceId, resourceName: r.name, day, nodeId: node.nodeId, topoIndex: i, slots: [] });
        continue;
      }

      const packed = packArrivals(node.pool, arrivals);
      // B3: a team checked off AT THIS node overrides its computed completion with the real, reported
      // one (whole team, one portion) — this is what a successor anchors to — and its slot rows are
      // flagged `served`/`servedAt` (the row's `time` stays where the plan packed it).
      const arrivedTeams = new Set(arrivals.map((a) => a.team));
      for (const f of finishes) {
        if (pinNodeOf(f.team) === node.nodeId) continue;
        const servedAt = servedAtOf.get(`${day}#${node.nodeId}#${f.team}`);
        if (servedAt === undefined) continue;
        packed.produced.set(f.team, [{ size: sizeOf(f.team), end: servedAt }]);
        for (const ss of packed.slotsByRes.values())
          for (const s of ss) for (const t of s.teams) if (t.team === f.team) { t.served = true; t.servedAt = servedAt; }
      }
      // Manual overrides: pre-seed teams pinned INTO one of this node's member resources at the exact
      // slot time, and record their produced portion so any successor node picks up their completion.
      for (const [team, a] of pinnedByTeam) {
        if (pinNodeOf(team) !== node.nodeId) continue;
        const r = node.pool.find((x) => x.resourceId === a.resourceId)!;
        const f = finishOf.get(team);
        if (!f) continue;
        const size = sizeOf(team);
        const ss = packed.slotsByRes.get(r.resourceId)!;
        let s = ss.find((x) => x.time === a.slotTime);
        if (!s) { s = { time: a.slotTime, teams: [], persons: 0, capacity: r.capacityPersons, overflow: false }; ss.push(s); }
        s.teams.push({ team, categoryId: f.categoryId, size, pinned: true });
        s.persons += size;
        s.overflow = s.persons > s.capacity;
        ss.sort((x, y) => x.time.localeCompare(y.time));
        const arr = packed.produced.get(team) ?? []; arr.push({ size, end: addMinutes(a.slotTime, r.occupancyMinutes) }); packed.produced.set(team, arr);
      }
      // B3: pending — a team that reached the pipeline (this node has ≥1 predecessor) but for which no
      // arrival was built (its predecessor's completion is missing, e.g. an un-checked-off free node),
      // and which isn't itself directly checked off at this node.
      if (preds.length) {
        for (const f of finishes) {
          if (pinNodeOf(f.team) === node.nodeId) continue;
          if (arrivedTeams.has(f.team)) continue;
          if (servedAtOf.has(`${day}#${node.nodeId}#${f.team}`)) continue;
          pending.push({ nodeId: node.nodeId, day, team: f.team, categoryId: f.categoryId, waitingFor: labelOf.get(preds[0]!) ?? preds[0]! });
        }
      }
      completion.set(node.nodeId, packed.produced);
      for (const r of node.pool) turns.push({ resourceId: r.resourceId, resourceName: r.name, day, nodeId: node.nodeId, topoIndex: i, slots: packed.slotsByRes.get(r.resourceId) ?? [] });
      for (const u of packed.unassignable) unassignable.push({ day, team: u.team, categoryId: u.categoryId, size: u.size });
    }
  }

  const nodeInfos: PlanNodeInfo[] = nodes.map((n, i) => ({ nodeId: n.nodeId, kind: n.kind, label: n.label, icon: n.icon, memberIds: n.memberIds, mode: n.mode, topoIndex: i, predecessorIds: predOf.get(n.nodeId)! }));
  return { days, defaultTeamSize: rc.defaultTeamSize ?? DEFAULT_TEAM_SIZE, teams, turns, unassignable, finishesByDay, nodes: nodeInfos, freeLists, pending };
}
