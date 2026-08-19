import type { FinalsType, ResolvedGroup, Schedule, ScheduledMatch, TieBreakCriterion, TieOverride } from './domain.js';

/** Persistence seam for the Schedule aggregate (one per event). */
export interface ScheduleRepository {
  get(sportEventId: string): Promise<Schedule | undefined>;
  save(schedule: Schedule): Promise<void>;
}

/** Persistence seam for the generated fixtures. Stored as one item per event, so a
 *  regenerate is a single overwrite (no per-match delete). */
export interface MatchRepository {
  list(sportEventId: string): Promise<ScheduledMatch[]>;
  replace(sportEventId: string, matches: ScheduledMatch[]): Promise<void>;
}

/** The o3 event fields o7 needs to schedule (dates + categories). Read over HTTP
 *  (ADR-002: no cross-BC code import). */
export interface EventView {
  sportEventId: string;
  dates: { from: string; to: string };
  categorie: string[];
  /** S8: explicit per-category group composition from o3 (structural — o7 must not import
   *  o3's type, ADR-002). When present for a category, it overrides the auto-split. */
  gironi?: Record<string, { groups: ResolvedGroup[]; locked: boolean }>;
  /** S11: the sport (for `defaultTieBreak`) and the event's configured tie-break policy (S6).
   *  Both read from the o3 event over HTTP. */
  sport?: string;
  tieBreak?: TieBreakCriterion[];
  /** S12/S13: finals config (O6, from o3). `finalsType` absent (or `finalsEnabled === false`) ⇒ no
   *  bracket. `finalsTeamsToBracket` sizes the SPLIT_GROUP_FINALS bracket (S13, v1). `qualifiersPerGroup`
   *  is deprecated (unused by the v1 formats). */
  finalsType?: FinalsType;
  finalsEnabled?: boolean;
  finalsTeamsToBracket?: number;
  qualifiersPerGroup?: number;
}
export interface EventSource {
  get(sportEventId: string): Promise<EventView | undefined>;
}

/** S11: persistence seam for manual tie-break resolutions. One event's overrides are stored
 *  together; `upsert` replaces the override for its (categoryId, groupLabel). */
export interface TieOverrideRepository {
  list(sportEventId: string): Promise<TieOverride[]>;
  upsert(override: TieOverride): Promise<void>;
}

/** Confirmed teams per category, from o5. Teams are labelled by participantRef (no
 *  team-name field exists yet — see the slice design). Read over HTTP. */
export interface TeamSource {
  confirmedByCategory(sportEventId: string): Promise<Map<string, string[]>>;
}
