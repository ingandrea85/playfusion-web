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
