export class DomainError extends Error {
  constructor(readonly code: string, message: string, readonly httpStatus = 409) {
    super(message);
    this.name = 'DomainError';
  }
}
export class TechnicalError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TechnicalError';
  }
}

/** 401 — no credential, or the credential failed verification. */
export class UnauthorizedError extends DomainError {
  constructor(message = 'unauthorized') { super('UNAUTHORIZED', message, 401); }
}
/** 403 — a valid credential that lacks the required role/permission. */
export class ForbiddenError extends DomainError {
  constructor(message = 'forbidden') { super('FORBIDDEN', message, 403); }
}
