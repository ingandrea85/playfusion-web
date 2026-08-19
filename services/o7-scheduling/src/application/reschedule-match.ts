import { slotConflict, type ScheduledMatch, type SlotPatch } from '../domain.js';
import { MatchNotFoundError, SlotConflictError } from '../errors.js';
import type { MatchRepository } from '../ports.js';

export interface RescheduleMatchInput { sportEventId: string; matchId: string; patch: SlotPatch }

/** Move one match to a new day/time/field. Rejects if the target slot is already taken by
 *  another match (409) or the match doesn't exist (404). Independent of the schedule status
 *  — reschedules are allowed even after publish (D-O7-3), and this never changes the status. */
export function rescheduleMatch(matches: MatchRepository) {
  return async (input: RescheduleMatchInput): Promise<ScheduledMatch> => {
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);
    if (slotConflict(all, input.matchId, input.patch)) throw new SlotConflictError(input.matchId);
    const updated: ScheduledMatch = { ...target, day: input.patch.day, time: input.patch.time, field: input.patch.field };
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
