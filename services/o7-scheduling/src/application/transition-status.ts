import { ForbiddenError } from '@playfusion/platform-lib';
import { canCancel, canFinish, canStart, effectiveStatus, type ScheduledMatch } from '../domain.js';
import { InvalidMatchTransitionError, MatchNotFoundError } from '../errors.js';
import type { MatchRepository } from '../ports.js';

/** Injectable clock so the LIVE kickoff instant is deterministic in tests. */
export type Clock = () => string;
const systemClock: Clock = () => new Date().toISOString();

/** `restrictToField` (a field director) forces the match to be on that field — else 403, as in
 *  recordResult. Organizer transitions pass it undefined. */
export interface TransitionInput { sportEventId: string; matchId: string; restrictToField?: string }

async function loadTarget(matches: MatchRepository, input: TransitionInput): Promise<{ all: ScheduledMatch[]; target: ScheduledMatch }> {
  const all = await matches.list(input.sportEventId);
  const target = all.find((m) => m.id === input.matchId);
  if (!target) throw new MatchNotFoundError(input.matchId);
  if (input.restrictToField !== undefined && target.field !== input.restrictToField) {
    throw new ForbiddenError('match is not on your field');
  }
  return { all, target };
}

async function persist(matches: MatchRepository, input: TransitionInput, all: ScheduledMatch[], updated: ScheduledMatch): Promise<ScheduledMatch> {
  await matches.replace(input.sportEventId, all.map((m) => (m.id === updated.id ? updated : m)));
  return updated;
}

/** Start a match (SCHEDULED/LIVE → LIVE), stamping the kickoff instant once. Director- or
 *  organizer-driven; the actual kickoff time feeds the delay indicator. */
export function startMatch(matches: MatchRepository, now: Clock = systemClock) {
  return async (input: TransitionInput): Promise<ScheduledMatch> => {
    const { all, target } = await loadTarget(matches, input);
    if (!canStart(effectiveStatus(target))) throw new InvalidMatchTransitionError(effectiveStatus(target), 'start');
    const updated: ScheduledMatch = { ...target, status: 'LIVE', startedAt: target.startedAt ?? now() };
    return persist(matches, input, all, updated);
  };
}

/** Finish a match (SCHEDULED/LIVE/FINISHED → FINISHED), freezing the result into the standings. */
export function finishMatch(matches: MatchRepository) {
  return async (input: TransitionInput): Promise<ScheduledMatch> => {
    const { all, target } = await loadTarget(matches, input);
    if (!canFinish(effectiveStatus(target))) throw new InvalidMatchTransitionError(effectiveStatus(target), 'finish');
    const updated: ScheduledMatch = { ...target, status: 'FINISHED' };
    return persist(matches, input, all, updated);
  };
}

/** Cancel a match (organizer only — enforced in the handler). Excluded from the standings. */
export function cancelMatch(matches: MatchRepository) {
  return async (input: TransitionInput): Promise<ScheduledMatch> => {
    const { all, target } = await loadTarget(matches, input);
    if (!canCancel(effectiveStatus(target))) throw new InvalidMatchTransitionError(effectiveStatus(target), 'cancel');
    const updated: ScheduledMatch = { ...target, status: 'CANCELLED' };
    return persist(matches, input, all, updated);
  };
}
