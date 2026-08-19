import { test, expect } from 'vitest';
import { signMagicLink } from '@playfusion/platform-lib';
import { app } from '../src/handler.js';

// The verify endpoint is stateless (signature + exp only), so it exercises via app.request
// without DynamoDB. Regression: a `Bearer <token>` header must verify like a raw token — the
// rest-client (and the E3 SPA pre-check) always send Bearer.
const token = signMagicLink({ subject: 'enroll:evt-1', roles: ['coach'], purpose: 'coach-enrollment' });

test('test_verify_acceptsBearerPrefixedToken', async () => {
  const res = await app.request('/identities/verify', { headers: { authorization: `Bearer ${token}` } });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ subject: 'enroll:evt-1', roles: ['coach'] });
});

test('test_verify_acceptsRawToken', async () => {
  const res = await app.request('/identities/verify', { headers: { authorization: token } });
  expect(res.status).toBe(200);
});

test('test_verify_rejectsGarbage', async () => {
  const res = await app.request('/identities/verify', { headers: { authorization: 'Bearer not-a-token' } });
  expect(res.status).toBe(401);
});
