import { test, expect } from 'vitest';
import { signMagicLink } from '@playfusion/platform-lib';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
const { app } = await import('../../src/handler.js') as any;
// S2.4: create-event is an organizer mutation. Mint a RegistrationManager bridge token
// (verified locally against the shared secret by the requireOrganizer middleware).
const organizerToken = signMagicLink({ subject: 'it-organizer', roles: ['RegistrationManager'] });

test('test_publishEvent_persistsAndReturnsPublished', async () => {
  const res = await app.request('/events', { method: 'POST', headers: { 'content-type': 'application/json', authorization: organizerToken }, body: JSON.stringify({ sport: 'calcio', categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' } }) });
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({ status: 'Published' });
});
