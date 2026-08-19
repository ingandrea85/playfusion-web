import { DomainError } from '@playfusion/platform-lib';

/** 404 — cannot schedule an event that does not exist in o3. */
export class EventNotFoundError extends DomainError {
  constructor(sportEventId: string) {
    super('EVENT_NOT_FOUND', `event ${sportEventId} does not exist`, 404);
  }
}

/** 404 — reschedule targeted a match id not present in the event's fixtures. */
export class MatchNotFoundError extends DomainError {
  constructor(matchId: string) {
    super('MATCH_NOT_FOUND', `match ${matchId} does not exist`, 404);
  }
}

/** 409 — the target slot (day+time+field) is already taken by another match. */
export class SlotConflictError extends DomainError {
  constructor(matchId: string) {
    super('SLOT_CONFLICT', `the target slot is already occupied (match ${matchId})`, 409);
  }
}

/** 422 — a team edit with an empty team or home === away. */
export class InvalidTeamError extends DomainError {
  constructor(message = 'home and away must be non-empty and different') {
    super('INVALID_TEAM', message, 422);
  }
}

/** 422 — a team edit with a team that isn't confirmed for the match's category (level B). */
export class UnknownTeamError extends DomainError {
  constructor(team: string) {
    super('UNKNOWN_TEAM', `team ${team} is not a confirmed team of this category`, 422);
  }
}

/** 409 — a lifecycle transition not allowed from the match's current status (S26), e.g. start
 *  a FINISHED match, or record a result on a CANCELLED one. */
export class InvalidMatchTransitionError extends DomainError {
  constructor(from: string, action: string) {
    super('INVALID_MATCH_TRANSITION', `cannot ${action} a match in status ${from}`, 409);
  }
}

/** 422 — a manual tie-break override with an empty or duplicate-team order (S11). */
export class InvalidTieOverrideError extends DomainError {
  constructor(message = 'override order must be non-empty and contain distinct teams') {
    super('INVALID_TIE_OVERRIDE', message, 422);
  }
}

/** 409 — cannot decree an advancing side unless the match is a FINISHED, drawn knockout (FINAL). */
export class CannotDecideWinnerError extends DomainError {
  constructor(message = 'the winner can only be decreed on a finished, drawn knockout match') {
    super('CANNOT_DECIDE_WINNER', message, 409);
  }
}
