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
export interface ResourcePlan {
  days: string[];
  defaultTeamSize: number;
  teams: { team: string; categoryId: string; size: number }[];
  turns: ResourceDayTurns[];
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

/** Pack the day's finishes into `resource`'s slots. Greedy by ready-time (finish + offset), respecting
 *  person-capacity, mixing categories. A lone team larger than capacity gets its own overflow slot.
 *  Manual `assignments` pin their teams into a slot at the chosen time (re-grouped, overflow recomputed). */
export function resourceTurns(finishes: TeamFinish[], resource: Resource, sizeOf: (team: string) => number, assignments: ResourceAssignment[] = []): ResourceSlot[] {
  const readyOf = (f: TeamFinish): string => addMinutes(f.finish, resource.offsetMinutes);
  const pinned = new Map(assignments.map((a) => [a.team, a.slotTime]));
  const slots: ResourceSlot[] = [];
  const newSlot = (time: string): ResourceSlot => { const s: ResourceSlot = { time, teams: [], persons: 0, capacity: resource.capacityPersons, overflow: false }; slots.push(s); return s; };

  // Auto-pack the un-pinned teams, in ready-time order.
  const auto = finishes.filter((f) => !pinned.has(f.team));
  for (const f of auto) {
    const ready = readyOf(f), size = sizeOf(f.team);
    const open = size > resource.capacityPersons ? undefined
      : slots.find((s) => s.persons + size <= resource.capacityPersons && ready <= addMinutes(s.time, resource.occupancyMinutes));
    const slot = open ?? newSlot(ready);
    slot.teams.push({ team: f.team, categoryId: f.categoryId, size }); slot.persons += size;
  }
  // Pinned teams: drop into (or create) the slot at their chosen time.
  for (const f of finishes.filter((x) => pinned.has(x.team))) {
    const time = pinned.get(f.team)!, size = sizeOf(f.team);
    const slot = slots.find((s) => s.time === time) ?? newSlot(time);
    slot.teams.push({ team: f.team, categoryId: f.categoryId, size, pinned: true }); slot.persons += size;
  }
  for (const s of slots) s.overflow = s.persons > resource.capacityPersons;
  return slots.sort((a, b) => a.time.localeCompare(b.time));
}

/** The full plan for one event: known teams (with sizes), scheduled days, and every resource's turns
 *  per day. `teamsByCat` are the confirmed teams from o5 (label → category). Pure. */
export function computeResourcePlan(matches: ScheduledMatch[], config: ScheduleConfig, rc: ResourceConfig, teamsByCat: Map<string, string[]>): ResourcePlan {
  const catOf = new Map<string, string>();
  for (const [cat, list] of teamsByCat) for (const t of list) catOf.set(t, cat);
  const finishesByDay = teamFinishes(matches, config, new Set(catOf.keys()));
  const days = Object.keys(finishesByDay).sort();
  const sizeOf = (team: string): number => teamSizeOf(rc, team);
  const teams = [...catOf].map(([team, categoryId]) => ({ team, categoryId, size: sizeOf(team) }))
    .sort((a, b) => a.categoryId.localeCompare(b.categoryId) || a.team.localeCompare(b.team));
  const turns: ResourceDayTurns[] = [];
  for (const r of rc.resources) for (const day of days) {
    const asg = (rc.assignments ?? []).filter((a) => a.resourceId === r.resourceId && a.day === day);
    turns.push({ resourceId: r.resourceId, day, slots: resourceTurns(finishesByDay[day] ?? [], r, sizeOf, asg) });
  }
  return { days, defaultTeamSize: rc.defaultTeamSize ?? DEFAULT_TEAM_SIZE, teams, turns, finishesByDay };
}
