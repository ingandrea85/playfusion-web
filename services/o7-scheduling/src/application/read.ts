import { defaultConfig, type GroupStanding, type Schedule, type ScheduledMatch } from '../domain.js';
import { computeStandings } from '../standings.js';
import { defaultTieBreak, rankStanding } from '../ranking.js';
import type { EventSource, MatchRepository, ScheduleRepository, TieOverrideRepository } from '../ports.js';

/** Read the schedule for an event. Events that were never scheduled read as a NONE
 *  schedule with the default config, so the organizer screen always has a config to
 *  edit and the public gate ("only when PUBLISHED") is a plain status check. */
export function getScheduleOrDefault(schedules: ScheduleRepository) {
  return async (sportEventId: string, organizationId = ''): Promise<Schedule> =>
    (await schedules.get(sportEventId)) ?? { sportEventId, organizationId, status: 'NONE', config: defaultConfig() };
}

export function listMatches(matches: MatchRepository) {
  return async (sportEventId: string): Promise<ScheduledMatch[]> => matches.list(sportEventId);
}

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && new Set([...a, ...b]).size === a.length;

/** S10/S11: standings computed live from the event's stored results, ranked by the event's
 *  tie-break policy (S6, read from o3) with the organizer's manual overrides applied (S11).
 *
 *  Called without `deps` (S10 tests / callers that don't need the policy) it keeps the basic
 *  points → GD → GF → name order. With `deps` it applies the full policy: for each group it ranks
 *  with `event.tieBreak` (or `defaultTieBreak(sport)`), reports the still-tied `unresolved` sets,
 *  and — for each override that actually resolves a currently-tied set — surfaces its audit
 *  (`resolvedBy`/`resolvedAt`). An override whose set no longer matches a tie is silently ignored
 *  (self-invalidation). */
export function listStandings(
  matches: MatchRepository,
  deps: { overrides?: TieOverrideRepository; events?: EventSource } = {},
) {
  return async (sportEventId: string): Promise<GroupStanding[]> => {
    const all = await matches.list(sportEventId);
    const base = computeStandings(all);
    if (!deps.overrides && !deps.events) return base; // S10 behaviour: no policy configured

    const event = deps.events ? await deps.events.get(sportEventId) : undefined;
    const policy = event?.tieBreak?.length ? event.tieBreak : defaultTieBreak(event?.sport);
    const overrides = deps.overrides ? await deps.overrides.list(sportEventId) : [];

    return base.map((g) => {
      const groupMatches = all.filter((m) => m.categoryId === g.categoryId && m.groupLabel === g.groupLabel);
      const groupOverrides = overrides.filter((o) => o.categoryId === g.categoryId && o.groupLabel === g.groupLabel);
      // Ranking without overrides tells us which sets are genuinely tied (so an override's audit is
      // shown only while it still resolves a real tie).
      const raw = rankStanding(g.rows, groupMatches, policy, []);
      const ranked = rankStanding(g.rows, groupMatches, policy, groupOverrides.map((o) => o.order));
      const active = groupOverrides.find((o) => raw.unresolved.some((set) => sameSet(set, o.order)));
      return {
        categoryId: g.categoryId,
        groupLabel: g.groupLabel,
        rows: ranked.rows,
        unresolved: ranked.unresolved,
        ...(active ? { override: { order: active.order, resolvedBy: active.resolvedBy, resolvedAt: active.resolvedAt } } : {}),
      };
    });
  };
}
