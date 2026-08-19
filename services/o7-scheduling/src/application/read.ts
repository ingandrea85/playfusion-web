import { defaultConfig, type GroupStanding, type Schedule, type ScheduledMatch } from '../domain.js';
import { computeStandings } from '../standings.js';
import { defaultTieBreak, rankStanding } from '../ranking.js';
import { resolvePlaceholders } from '../resolve-finals.js';
import type { EventSource, MatchRepository, ScheduleRepository, TieOverrideRepository } from '../ports.js';

/** Read the schedule for an event. Events that were never scheduled read as a NONE
 *  schedule with the default config, so the organizer screen always has a config to
 *  edit and the public gate ("only when PUBLISHED") is a plain status check. */
export function getScheduleOrDefault(schedules: ScheduleRepository) {
  return async (sportEventId: string, organizationId = ''): Promise<Schedule> =>
    (await schedules.get(sportEventId)) ?? { sportEventId, organizationId, status: 'NONE', config: defaultConfig() };
}

/** Deps that unlock policy-aware ranking (S11) and finals resolution (S12). Absent ⇒ basic order /
 *  raw matches, so S9/S10/S26 callers keep working unchanged. */
export interface ReadDeps { overrides?: TieOverrideRepository; events?: EventSource }

const sameSet = (a: string[], b: string[]): boolean => a.length === b.length && new Set([...a, ...b]).size === a.length;

/** Compute the ranked standings for one event's matches: base aggregates (S10), then per group the
 *  S11 tie-break policy + manual overrides, reporting `unresolved` sets and surfacing an override's
 *  audit only while it resolves a real tie. */
async function rankedStandings(all: ScheduledMatch[], deps: ReadDeps, sportEventId: string): Promise<GroupStanding[]> {
  const base = computeStandings(all);
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
}

/** S10/S11: standings, ranked by the event's tie-break policy with manual overrides applied. Without
 *  `deps` keeps the basic points → GD → GF → name order (S10 callers/tests). */
export function listStandings(matches: MatchRepository, deps: ReadDeps = {}) {
  return async (sportEventId: string): Promise<GroupStanding[]> => {
    const all = await matches.list(sportEventId);
    if (!deps.overrides && !deps.events) return computeStandings(all); // S10 behaviour
    const ranked = await rankedStandings(all, deps, sportEventId);
    // S13: the FINAL_GROUP is a round-robin among qualifier placeholders; resolve them to real teams
    // (from the group standings) and recompute so its mini-table reads real names + results.
    if (!all.some((m) => m.phase === 'FINAL_GROUP')) return ranked;
    const resolved = resolvePlaceholders(all, ranked);
    const swapped = resolved.map((m) =>
      m.phase === 'FINAL_GROUP' && m.homeResolved && m.awayResolved ? { ...m, home: m.homeResolved, away: m.awayResolved } : m);
    return rankedStandings(swapped, deps, sportEventId);
  };
}

/** The event's placed fixtures + finals. Without `deps` returns them raw (S9/S26 callers). With
 *  `deps` (S12) it resolves each FINAL match's `Nª Girone X` placeholder to the ranked team on read,
 *  reusing the same S11 ranking as the standings. */
export function listMatches(matches: MatchRepository, deps: ReadDeps = {}) {
  return async (sportEventId: string): Promise<ScheduledMatch[]> => {
    const all = await matches.list(sportEventId);
    if (!deps.overrides && !deps.events) return all;
    const standings = await rankedStandings(all, deps, sportEventId);
    return resolvePlaceholders(all, standings);
  };
}
