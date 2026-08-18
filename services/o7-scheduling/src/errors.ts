import { DomainError } from '@playfusion/platform-lib';

/** 404 — cannot schedule an event that does not exist in o3. */
export class EventNotFoundError extends DomainError {
  constructor(sportEventId: string) {
    super('EVENT_NOT_FOUND', `event ${sportEventId} does not exist`, 404);
  }
}
