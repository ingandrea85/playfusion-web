import { DomainError } from '@playfusion/platform-lib';
export class RegistrationAlreadyResolvedError extends DomainError {
  constructor(registrationId: string) {
    super('ALREADY_RESOLVED', `registration ${registrationId} is not in Applied state`, 409);
  }
}
export class WindowClosedError extends DomainError {
  constructor(sportEventId: string) {
    super('WINDOW_CLOSED', `registration window for event ${sportEventId} is closed`, 422);
  }
}
export class DoubleApplyError extends DomainError {
  constructor(participantRef: string) {
    super('DOUBLE_APPLY', `participant ${participantRef} already applied to this event`, 409);
  }
}
export class UnknownParticipantError extends DomainError {
  constructor(participantRef: string) {
    super('UNKNOWN_PARTICIPANT', `participant ${participantRef} does not exist`, 422);
  }
}
export class NotAuthorizedError extends DomainError {
  constructor() { super('NOT_AUTHORIZED', 'actor lacks the Registration Manager role', 403); }
}
