import { categoryConfig, type ScheduleConfig, type ScheduledMatch } from './domain.js';

/** S17 — event resources & post-match logistics (docce, terzo tempo, …). A Resource has an
 *  occupancy duration, a person-capacity teams share, and an offset from a team's match finish.
 *  Turns are packed on read (pure, like standings/finals): a team's finish is DERIVED from its last
 *  match of the day (`time + slotMinutes(category)`), never entered by hand. `teamSizes`/`defaultTeamSize`
 *  live here in o7 (per team label) rather than on o3/o5 — no cross-BC schema coupling (ADR-002). */

export const DEFAULT_TEAM_SIZE = 14;

export interface Resource {
  resourceId: string;
  name: string;
  icon?: string;
  occupancyMinutes: number;
  capacityPersons: number;
  offsetMinutes: number;
}
/** A manual override: pin `team` into `resource`'s slot at `slotTime` on `day` (S17 "sposta"). */
export interface ResourceAssignment { resourceId: string; day: string; team: string; slotTime: string }
export interface ResourceConfig {
  resources: Resource[];
  defaultTeamSize?: number;
  teamSizes?: Record<string, number>;
  assignments?: ResourceAssignment[];
}

export interface TeamFinish { team: string; categoryId: string; finish: string }
export interface TurnTeam { team: string; categoryId: string; size: number; pinned?: boolean }
export interface ResourceSlot { time: string; teams: TurnTeam[]; persons: number; capacity: number; overflow: boolean }
export interface ResourceDayTurns { resourceId: string; day: string; slots: ResourceSlot[] }
export interface UnassignableTeam { day: string; team: string; categoryId: string; size: number }
export interface ResourcePlan {
  days: string[];
  defaultTeamSize: number;
  teams: { team: string; categoryId: string; size: number }[];
  turns: ResourceDayTurns[];
  /** Teams that fit no resource (bigger than every capacity) on a given day — surfaced, never
   *  silently packed into a too-small room. */
  unassignable: UnassignableTeam[];
  finishesByDay: Record<string, TeamFinish[]>;
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

/** Assign each of a day's team-finishes to EXACTLY ONE resource+slot, distributing the load across the
 *  resources (they are alternatives, not parallel copies). A team only enters a resource that can hold
 *  it (`size <= capacity`); teams sharing a slot must fit together and be ready within its occupancy
 *  window. Greedy by finish order, picking the resource+slot that lets the team start earliest — so a
 *  free room wins over a busy one. Manual `assignments` pin a team to a resource+slotTime. Teams that
 *  fit no resource are returned as `unassignable` (never packed into a too-small room). Pure. */
function assignDay(day: string, finishes: TeamFinish[], resources: Resource[], sizeOf: (team: string) => number, assignments: ResourceAssignment[]): { slotsByRes: Map<string, ResourceSlot[]>; unassignable: UnassignableTeam[] } {
  const slotsByRes = new Map<string, ResourceSlot[]>(resources.map((r) => [r.resourceId, []]));
  const byId = new Map(resources.map((r) => [r.resourceId, r]));
  const unassignable: UnassignableTeam[] = [];
  const pinned = new Map(assignments.filter((a) => a.day === day).map((a) => [a.team, a]));

  const addTo = (r: Resource, time: string, f: TeamFinish, isPinned: boolean): void => {
    const ss = slotsByRes.get(r.resourceId)!;
    let s = ss.find((x) => x.time === time);
    if (!s) { s = { time, teams: [], persons: 0, capacity: r.capacityPersons, overflow: false }; ss.push(s); }
    s.teams.push({ team: f.team, categoryId: f.categoryId, size: sizeOf(f.team), ...(isPinned ? { pinned: true } : {}) });
    s.persons += sizeOf(f.team);
  };
  const freeAt = (r: Resource): string | undefined => {
    const ss = slotsByRes.get(r.resourceId)!;
    return ss.length ? ss.map((s) => addMinutes(s.time, r.occupancyMinutes)).reduce(maxTime) : undefined;
  };

  // Pinned teams first (manual overrides win; a stale resource id ⇒ unassignable).
  for (const f of finishes) {
    const a = pinned.get(f.team); if (!a) continue;
    const r = byId.get(a.resourceId);
    if (r) addTo(r, a.slotTime, f, true);
    else unassignable.push({ day, team: f.team, categoryId: f.categoryId, size: sizeOf(f.team) });
  }
  // Auto-assign the rest, earliest-start-wins across the resources that fit.
  for (const f of finishes) {
    if (pinned.has(f.team)) continue;
    const size = sizeOf(f.team);
    const cands = resources.filter((r) => size <= r.capacityPersons);
    if (!cands.length) { unassignable.push({ day, team: f.team, categoryId: f.categoryId, size }); continue; }
    let best: { r: Resource; time: string } | undefined;
    for (const r of cands) {
      const ready = addMinutes(f.finish, r.offsetMinutes);
      const ss = slotsByRes.get(r.resourceId)!;
      const last = ss[ss.length - 1];
      const canJoin = last && last.persons + size <= r.capacityPersons && ready.localeCompare(addMinutes(last.time, r.occupancyMinutes)) <= 0;
      const time = canJoin ? last!.time : maxTime(ready, freeAt(r) ?? ready);
      if (!best || time.localeCompare(best.time) < 0) best = { r, time };
    }
    addTo(best!.r, best!.time, f, false);
  }

  for (const [, ss] of slotsByRes) { for (const s of ss) s.overflow = s.persons > s.capacity; ss.sort((a, b) => a.time.localeCompare(b.time)); }
  return { slotsByRes, unassignable };
}

/** The full plan for one event: known teams (with sizes), scheduled days, every resource's turns per
 *  day (each team appears once, in one resource), and any teams that fit no resource. `teamsByCat` are
 *  the confirmed teams from o5 (label → category). Pure. */
export function computeResourcePlan(matches: ScheduledMatch[], config: ScheduleConfig, rc: ResourceConfig, teamsByCat: Map<string, string[]>): ResourcePlan {
  const catOf = new Map<string, string>();
  for (const [cat, list] of teamsByCat) for (const t of list) catOf.set(t, cat);
  const finishesByDay = teamFinishes(matches, config, new Set(catOf.keys()));
  const days = Object.keys(finishesByDay).sort();
  const sizeOf = (team: string): number => teamSizeOf(rc, team);
  const teams = [...catOf].map(([team, categoryId]) => ({ team, categoryId, size: sizeOf(team) }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.team.localeCompare(b.team));
  const turns: ResourceDayTurns[] = [];
  const unassignable: UnassignableTeam[] = [];
  for (const day of days) {
    const res = assignDay(day, finishesByDay[day] ?? [], rc.resources, sizeOf, rc.assignments ?? []);
    unassignable.push(...res.unassignable);
    for (const r of rc.resources) turns.push({ resourceId: r.resourceId, day, slots: res.slotsByRes.get(r.resourceId) ?? [] });
  }
  return { days, defaultTeamSize: rc.defaultTeamSize ?? DEFAULT_TEAM_SIZE, teams, turns, unassignable, finishesByDay };
}
