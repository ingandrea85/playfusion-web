import type { ScheduledMatch } from '../domain.js';
import { MatchNotFoundError } from '../errors.js';
import type { MatchRepository } from '../ports.js';

export interface RecordResultInput { sportEventId: string; matchId: string; homeScore: number; awayScore: number }

/** Record (or correct) a group match's result. Standings are derived on read from the stored
 *  scores, so this only persists the two scores on the match. 404 if the match doesn't exist. */
export function recordResult(matches: MatchRepository) {
  return async (input: RecordResultInput): Promise<ScheduledMatch> => {
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);
    const updated: ScheduledMatch = { ...target, homeScore: input.homeScore, awayScore: input.awayScore };
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
