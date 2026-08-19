import { ForbiddenError } from '@playfusion/platform-lib';
import type { ScheduledMatch } from '../domain.js';
import { MatchNotFoundError } from '../errors.js';
import type { MatchRepository } from '../ports.js';

/** `restrictToField` (S25): when set (a field director), the match must be on that field, else
 *  403 — a director reports only their own field's matches. */
export interface RecordResultInput { sportEventId: string; matchId: string; homeScore: number; awayScore: number; restrictToField?: string }

/** Record (or correct) a group match's result. Standings are derived on read from the stored
 *  scores, so this only persists the two scores on the match. 404 if the match doesn't exist;
 *  403 if a field director targets a match outside their field. */
export function recordResult(matches: MatchRepository) {
  return async (input: RecordResultInput): Promise<ScheduledMatch> => {
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);
    if (input.restrictToField !== undefined && target.field !== input.restrictToField) {
      throw new ForbiddenError('match is not on your field');
    }
    const updated: ScheduledMatch = { ...target, homeScore: input.homeScore, awayScore: input.awayScore };
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
