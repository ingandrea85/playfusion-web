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
