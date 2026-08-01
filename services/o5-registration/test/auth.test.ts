import { test, expect } from 'vitest';
import { app } from '../src/handler.js';
import { signMagicLink } from '@playfusion/platform-lib';

// Auth middleware runs before the handler body, so these resolve without DynamoDB (S2.4).
test('test_apply_withoutMagicLink_is401', async () => {
  const res = await app.request('/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ participantRef: 't1', sportEventId: 'evt-1', categoria: 'U15' }),
  });
  expect(res.status).toBe(401);
});

test('test_apply_withCoachMagicLink_passesAuth', async () => {
  // A valid magic-link clears auth; the request then proceeds to the use-case (which needs
  // an open window / real store), so we only assert it is NOT a 401/403 auth rejection.
  const token = signMagicLink({ subject: 'coach', roles: ['coach'] });
  const res = await app.request('/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: token },
    body: JSON.stringify({ participantRef: 't1', sportEventId: 'evt-1', categoria: 'U15' }),
  });
  expect([401, 403]).not.toContain(res.status);
});

test('test_confirm_withoutToken_is401', async () => {
  const res = await app.request('/registrations/reg-1/confirm', { method: 'POST' });
  expect(res.status).toBe(401);
});

test('test_confirm_withCoachMagicLink_is403', async () => {
  const token = signMagicLink({ subject: 'coach', roles: ['coach'] });
  const res = await app.request('/registrations/reg-1/confirm', { method: 'POST', headers: { authorization: token } });
  expect(res.status).toBe(403);
});

test('test_confirm_acceptsApproverTokenHeaderForManager', async () => {
  // RegistrationManager bridge token via x-approver-token clears auth (then hits the store).
  const token = signMagicLink({ subject: 'mgr', roles: ['RegistrationManager'] });
  const res = await app.request('/registrations/reg-1/confirm', { method: 'POST', headers: { 'x-approver-token': token } });
  expect([401, 403]).not.toContain(res.status);
});

test('test_openWindow_withoutToken_is401', async () => {
  const res = await app.request('/events/evt-1/registration-window:open', { method: 'POST' });
  expect(res.status).toBe(401);
});
