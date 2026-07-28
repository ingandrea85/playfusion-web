import { test, expect } from 'vitest';
import { signToken, verifyToken } from '../src/token.js';

test('test_verifyToken_roundTripsSubjectAndRoles', () => {
  const t = signToken('marco', ['RegistrationManager']);
  expect(verifyToken(t)).toMatchObject({ subject: 'marco', roles: ['RegistrationManager'] });
});
test('test_verifyToken_tamperedTokenIsRejected', () => {
  expect(verifyToken(signToken('marco', ['RegistrationManager']) + 'x')).toBeNull();
});
