import { test, expect } from 'vitest';
import { app } from '../src/handler.js';
import { signMagicLink } from '@playfusion/platform-lib';

// The requireOrganizer middleware runs before the handler body, so these assertions
// resolve without touching DynamoDB (S2.4).
const create = (headers: Record<string, string>) =>
  app.request('/events', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ sport: 'calcio', categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' } }),
  });

test('test_createEvent_withoutToken_is401', async () => {
  expect((await create({})).status).toBe(401);
});

test('test_createEvent_invalidToken_is401', async () => {
  expect((await create({ authorization: 'garbage' })).status).toBe(401);
});

test('test_createEvent_magicLinkWithoutManagerRole_is403', async () => {
  const token = signMagicLink({ subject: 'coach', roles: ['coach'] });
  expect((await create({ authorization: token })).status).toBe(403);
});
