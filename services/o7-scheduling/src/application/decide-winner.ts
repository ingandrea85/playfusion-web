import { ForbiddenError } from '@playfusion/platform-lib';
import { isPlayed, type ScheduledMatch } from './../domain.js';
import { CannotDecideWinnerError, MatchNotFoundError } from '../errors.js';
import type { MatchRepository } from '../ports.js';

/** `restrictToField` (S25): a field director may only decree on their own field's match. */
export interface DecideWinnerInput { sportEventId: string; matchId: string; winner: 'HOME' | 'AWAY'; restrictToField?: string }

/** Decree which side advances when a knockout (FINAL) match ends level. Rules are applied offline by
 *  the organizer/director (no shootout modelled). Only valid on a FINISHED, drawn FINAL match — group
 *  and final-group matches allow draws and never advance a winner. Sets `decidedWinner`; the winner
 *  propagation (resolve-finals) then advances that side to the next round. */
export function decideWinner(matches: MatchRepository) {
  return async (input: DecideWinnerInput): Promise<ScheduledMatch> => {
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);
    if (input.restrictToField !== undefined && target.field !== input.restrictToField) {
      throw new ForbiddenError('match is not on your field');
    }
    if (target.phase !== 'FINAL') throw new CannotDecideWinnerError('only knockout (FINAL) matches advance a winner');
    if (target.status !== 'FINISHED' || !isPlayed(target)) throw new CannotDecideWinnerError();
    if (target.homeScore !== target.awayScore) throw new CannotDecideWinnerError('the match is not a draw; the score decides');

    const updated: ScheduledMatch = { ...target, decidedWinner: input.winner };
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
