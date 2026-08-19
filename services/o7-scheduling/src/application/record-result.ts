import { ForbiddenError } from '@playfusion/platform-lib';
import { canRecord, effectiveStatus, type ScheduledMatch } from '../domain.js';
import { InvalidMatchTransitionError, MatchNotFoundError } from '../errors.js';
import type { MatchRepository } from '../ports.js';
import type { Clock } from './transition-status.js';

/** `restrictToField` (S25): when set (a field director), the match must be on that field, else
 *  403 — a director reports only their own field's matches. */
export interface RecordResultInput { sportEventId: string; matchId: string; homeScore: number; awayScore: number; restrictToField?: string }

const systemClock: Clock = () => new Date().toISOString();

/** Record (or correct) a group match's result. Standings derive from the stored scores on read.
 *  S26 lifecycle: recording a SCHEDULED/LIVE match keeps it live (auto-advancing SCHEDULED → LIVE
 *  and stamping the kickoff), so a director who taps a score without pressing "Inizia" still
 *  works; a CANCELLED match rejects results (409); and once a match is FINISHED only the
 *  organizer may correct it — a field director (`restrictToField` set) gets 403. 404 if the match
 *  doesn't exist; 403 if a director targets a match outside their field. */
export function recordResult(matches: MatchRepository, now: Clock = systemClock) {
  return async (input: RecordResultInput): Promise<ScheduledMatch> => {
    const all = await matches.list(input.sportEventId);
    const target = all.find((m) => m.id === input.matchId);
    if (!target) throw new MatchNotFoundError(input.matchId);
    if (input.restrictToField !== undefined && target.field !== input.restrictToField) {
      throw new ForbiddenError('match is not on your field');
    }
    const status = effectiveStatus(target);
    if (!canRecord(status)) throw new InvalidMatchTransitionError(status, 'record a result on');
    // A field director cannot re-open a finished match — only the organizer corrects a result.
    if (input.restrictToField !== undefined && status === 'FINISHED') {
      throw new ForbiddenError('match is finished; only the organizer can correct the result');
    }
    // Correcting a FINISHED match keeps it FINISHED; any other state becomes LIVE (kickoff stamped).
    const nextStatus = status === 'FINISHED' ? 'FINISHED' : 'LIVE';
    const startedAt = target.startedAt ?? (nextStatus === 'LIVE' ? now() : target.startedAt);
    const updated: ScheduledMatch = { ...target, homeScore: input.homeScore, awayScore: input.awayScore, status: nextStatus, startedAt };
    // A new result invalidates a prior draw decree (delete the key — undefined would break marshalling).
    delete updated.decidedWinner;
    await matches.replace(input.sportEventId, all.map((m) => (m.id === input.matchId ? updated : m)));
    return updated;
  };
}
