import type { ResolvedGroup, Schedule, ScheduledMatch, TieBreakCriterion, TieOverride } from './domain.js';
import type { ResourceConfig } from './resources.js';
import type { CustomFinalsFormat } from './finals-format.js';

/** SP1: persistence seam for the GLOBAL custom finals-format catalog (not per-tenant). */
export interface FinalsFormatRepository {
  // Org-scoped: formats are visible only to the organization that created them.
  listByOrg(organizationId: string): Promise<CustomFinalsFormat[]>;
  get(formatId: string): Promise<CustomFinalsFormat | undefined>;
  save(format: CustomFinalsFormat): Promise<void>;
  delete(formatId: string): Promise<void>;
}

/** Persistence seam for the Schedule aggregate (one per event). */
export interface ScheduleRepository {
  get(sportEventId: string): Promise<Schedule | undefined>;
  save(schedule: Schedule): Promise<void>;
}

/** S17: persistence seam for the event's resource config (resources + team sizes + manual
 *  assignments). One item per event, keyed by sportEventId. */
export interface ResourceRepository {
  get(sportEventId: string): Promise<ResourceConfig | undefined>;
  save(sportEventId: string, config: ResourceConfig): Promise<void>;
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
   *  Both read from the o3 event over HTTP. (Finals format moved to the o7 ScheduleConfig,
   *  per-category — no longer read from the event.) */
  sport?: string;
  tieBreak?: TieBreakCriterion[];
  /** Epic #143: the event's sport profile snapshot — the points policy + generic tie-break order
   *  that parameterise the standings (falls back to Calcio 3/1/0 + the legacy tieBreak when absent). */
  sportProfile?: { points: { win: number; draw: number | null; loss: number }; tieBreak: string[] };
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
