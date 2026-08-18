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

/** Fields + match-format params live on the Schedule (O7), never on the Event/Category.
 *  `groupsCount`/`legs` are S7 inputs applied uniformly to every category until the
 *  per-category O6 gironi model lands in S8 (see the slice design). */
export interface ScheduleConfig {
  fields: string[];
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
  dailyStart: string; // 'HH:mm'
  slotsPerDay: number;
  groupsCount: number;
  legs: Legs;
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
}

/** One category's teams + its (uniform, for S7) group structure, fed to buildFixtures. */
export interface FixtureCategory {
  id: string;
  name: string;
  groupsCount: number;
  legs: Legs;
  teams: string[];
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
