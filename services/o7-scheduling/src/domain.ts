/** O7 scheduling domain: the Schedule status machine and its config.
 *
 *  A Schedule advances NONE → GENERATED → APPROVED → PUBLISHED. Generating is allowed
 *  (and re-allowed) while the schedule is not yet approved; once APPROVED the config
 *  locks, so a later generate is a no-op. Approve only from GENERATED; publish only
 *  from APPROVED. */
export type ScheduleStatus = 'NONE' | 'GENERATED' | 'APPROVED' | 'PUBLISHED';

/** Number of legs in a group's round-robin. HOME_AWAY doubles every pairing (return
 *  fixtures with home/away swapped). */
export type Legs = 'SINGLE' | 'HOME_AWAY';

/** Per-category playing config (S22): a category's own fields + match-format params +
 *  leg count. Different categories can play on different fields with different durations
 *  (e.g. U10 short pitches/times vs U14 full pitch/long times). */
export interface CategorySchedule {
  fields: string[];
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
  legs: Legs;
}

/** Fields + match-format params live on the Schedule (O7), never on the Event/Category.
 *  The top-level fields/periods/…/legs are the DEFAULTS applied to every category; S22
 *  adds an optional `byCategory` override so each category can have its own fields +
 *  timing + legs. `dailyStart`/`slotsPerDay` (facility window) and `groupsCount` (the
 *  auto-split fallback) stay global. */
export interface ScheduleConfig {
  fields: string[];
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
  dailyStart: string; // 'HH:mm'
  slotsPerDay: number;
  groupsCount: number;
  legs: Legs;
  byCategory?: Record<string, CategorySchedule>;
}

/** Resolve a category's playing config: its `byCategory` override if present, else the
 *  top-level defaults. */
export function categoryConfig(config: ScheduleConfig, categoria: string): CategorySchedule {
  return config.byCategory?.[categoria] ?? {
    fields: config.fields, periods: config.periods, periodMinutes: config.periodMinutes,
    breakMinutes: config.breakMinutes, legs: config.legs,
  };
}

export interface Schedule {
  sportEventId: string;
  organizationId: string;
  status: ScheduleStatus;
  config: ScheduleConfig;
}

/** A placed group-stage fixture. `categoryId` is the categoria string (categories are
 *  plain strings on the o3 event today); `home`/`away` are the confirmed teams' labels
 *  (participantRef until a real team name exists — S14). */
export interface ScheduledMatch {
  id: string;
  sportEventId: string;
  categoryId: string;
  groupLabel: string;
  day: string;  // 'YYYY-MM-DD'
  time: string; // 'HH:mm'
  field: string;
  home: string;
  away: string;
  // S10: result. null/undefined = not played; both set = played.
  homeScore?: number | null;
  awayScore?: number | null;
}

/** S10: a computed standings row for one team within a group. */
export interface StandingRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}
export interface GroupStanding {
  categoryId: string;
  groupLabel: string;
  rows: StandingRow[];
}

/** A resolved group: its label + the teams composing it. */
export interface ResolvedGroup { label: string; teams: string[] }

/** One category fed to buildFixtures: its resolved groups (from the o3 gironi composition
 *  when present, else auto-split — S8), leg count, and its own placement config (fields +
 *  match timing — S22). buildFixtures places each category on its own `fields` with its own
 *  slot length. */
export interface FixtureCategory {
  id: string;
  name: string;
  legs: Legs;
  groups: ResolvedGroup[];
  fields: string[];
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
}

/** Round-robin auto-seed used when a category has no explicit gironi composition (S7
 *  fallback): team i → group `i % groupsCount`. Mirrors o3's `autoDraw` (ADR-002: BCs
 *  cannot share code, and this trivial split is duplicated by design). */
export function autoSplit(teams: string[], groupsCount: number): ResolvedGroup[] {
  const n = Math.max(1, Math.floor(groupsCount));
  const groups: ResolvedGroup[] = Array.from({ length: n }, (_, i) => ({ label: `Girone ${String.fromCharCode(65 + i)}`, teams: [] }));
  teams.forEach((t, i) => groups[i % n]!.teams.push(t));
  return groups;
}

/** A single match's placement — the patch a reschedule applies. */
export interface SlotPatch { day: string; time: string; field: string }

/** True when some *other* match already occupies the target slot (same day+time+field).
 *  Two matches on the same field at the same day+time is the conflict S9 blocks. */
export function slotConflict(matches: ScheduledMatch[], matchId: string, patch: SlotPatch): boolean {
  return matches.some((m) => m.id !== matchId && m.day === patch.day && m.time === patch.time && m.field === patch.field);
}

export function defaultConfig(): ScheduleConfig {
  return { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' };
}

/** Generate is allowed only while the config is still editable (not yet approved). */
export function canGenerate(status: ScheduleStatus): boolean {
  return status === 'NONE' || status === 'GENERATED';
}

/** Approve advances GENERATED → APPROVED; any other state is left untouched. */
export function nextOnApprove(status: ScheduleStatus): ScheduleStatus {
  return status === 'GENERATED' ? 'APPROVED' : status;
}

/** Publish advances APPROVED → PUBLISHED; any other state is left untouched. */
export function nextOnPublish(status: ScheduleStatus): ScheduleStatus {
  return status === 'APPROVED' ? 'PUBLISHED' : status;
}
