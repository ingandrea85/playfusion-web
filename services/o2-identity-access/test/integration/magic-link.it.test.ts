import { test, expect } from 'vitest';

const { app } = await import('../../src/handler.js');

test('test_magicLink_issueThenVerify_roundTripsRoles', async () => {
  const issueRes = await app.request('/identities/magic-link', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact: 'marco@example.com', roles: ['RegistrationManager'] }),
  });
  expect(issueRes.status).toBe(201);
  const { token } = await issueRes.json();
  expect(token).toBeTruthy();

  const verifyRes = await app.request('/identities/verify', {
    method: 'GET',
    headers: { authorization: token },
  });
  expect(verifyRes.status).toBe(200);
  expect(await verifyRes.json()).toMatchObject({ roles: ['RegistrationManager'] });
});

test('test_magicLink_verifyWithoutToken_returns401', async () => {
  const res = await app.request('/identities/verify', { method: 'GET' });
  expect(res.status).toBe(401);
  expect(await res.json()).toMatchObject({ code: 'INVALID_TOKEN' });
});
