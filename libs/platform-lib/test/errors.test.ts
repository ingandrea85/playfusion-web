import { test, expect } from 'vitest';
import { z } from 'zod';
import { DomainError } from '../src/errors.js';
import { toHttpError } from '../src/http.js';

test('test_toHttpError_domainErrorMapsToItsStatusAndCode', () => {
  const res = toHttpError(new DomainError('ALREADY_CONFIRMED', 'already confirmed', 409));
  expect(res.statusCode).toBe(409);
  expect(JSON.parse(res.body)).toMatchObject({ code: 'ALREADY_CONFIRMED' });
});

test('test_toHttpError_unknownErrorMapsTo500', () => {
  expect(toHttpError(new Error('boom')).statusCode).toBe(500);
});

test('test_toHttpError_zodErrorMapsTo400', () => {
  const parsed = z.string().safeParse(123);
  expect(parsed.success).toBe(false);
  const res = toHttpError((parsed as { error: unknown }).error);
  expect(res.statusCode).toBe(400);
  expect(JSON.parse(res.body)).toMatchObject({ code: 'VALIDATION' });
});
