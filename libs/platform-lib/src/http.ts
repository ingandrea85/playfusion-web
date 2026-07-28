import { ZodError } from 'zod';
import { DomainError } from './errors.js';

export function ok(body: unknown) {
  return { statusCode: 200, body: JSON.stringify(body) };
}
export function toHttpError(e: unknown) {
  if (e instanceof DomainError) {
    return { statusCode: e.httpStatus, body: JSON.stringify({ code: e.code, message: e.message }) };
  }
  if (e instanceof ZodError) {
    return { statusCode: 400, body: JSON.stringify({ code: 'VALIDATION', message: 'Invalid request', issues: e.issues }) };
  }
  return { statusCode: 500, body: JSON.stringify({ code: 'INTERNAL', message: 'Internal error' }) };
}
