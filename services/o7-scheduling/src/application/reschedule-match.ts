import { slotConflict, type ScheduledMatch } from '../domain.js';
import { InvalidTeamError, MatchNotFoundError, SlotConflictError, UnknownTeamError } from '../errors.js';
import type { MatchRepository, TeamSource } from '../ports.js';

/** Match edit patch: always day/time/field (reschedule); optionally home/away (team edit — S24). */
export interface EditMatchPatch { day: string; time: string; field: string; home?: string; away?: string }
export interface EditMatchInput { sportEventId: string; matchId: string; patch: EditMatchPatch }
export interface EditMatchDeps { matches: MatchRepository; teams: TeamSource }

/** Edit one match: reschedule (day/time/field) and/or reassign its teams (home/away — S24).
 *  Rejects a slot clash (409) or a missing match (404). When home/away are supplied AND differ
 *  from the stored teams: they must be non-empty and different (422 INVALID_TEAM); each must be
 *  a confirmed team of the match's category (422 UNKNOWN_TEAM, level B — skipped if the
 *  confirmed list is unavailable, so an o5 hiccup can't block edits); and the result is reset
 *  (a score no longer belongs to the new pairing). Status-independent (allowed after publish);
 *  never changes the schedule status. A pure reschedule (no home/away) does not touch o5. */
export function rescheduleMatch(deps: EditMatchDeps) {
  return async (input: EditMatchInput): Promise<ScheduledMatch> => {
    const { matches, teams } = deps;
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);

    const home = input.patch.home ?? target.home;
    const away = input.patch.away ?? target.away;
    const teamsChanged = home !== target.home || away !== target.away;
    if (teamsChanged) {
      if (!home.trim() || !away.trim() || home === away) throw new InvalidTeamError();
      const confirmed = (await teams.confirmedByCategory(input.sportEventId)).get(target.categoryId) ?? [];
      if (confirmed.length) {
        if (!confirmed.includes(home)) throw new UnknownTeamError(home);
        if (!confirmed.includes(away)) throw new UnknownTeamError(away);
      }
    }

    if (slotConflict(all, input.matchId, { day: input.patch.day, time: input.patch.time, field: input.patch.field })) {
      throw new SlotConflictError(input.matchId);
    }

    const updated: ScheduledMatch = {
      ...target, day: input.patch.day, time: input.patch.time, field: input.patch.field, home, away,
      ...(teamsChanged ? { homeScore: null, awayScore: null } : {}),
    };
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
