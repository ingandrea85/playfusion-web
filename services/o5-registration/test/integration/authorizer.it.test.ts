import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeDocClient, resourceName, signMagicLink } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { spawnO2, type SpawnedO2 } from './spawn-o2.js';

// S2.4: apply requires a valid magic-link; a coach link (no manager role) is enough.
const coachToken = signMagicLink({ subject: 'it-coach', roles: ['coach'] });

// HttpClaimAuthorizer is constructed at O5 handler module-load time from process.env.O2_BASE_URL,
// so a REAL O2 process must be listening and the env var set BEFORE the dynamic import below.
let o2: SpawnedO2;
let app: any;

const sportEventId = 'evt-' + randomUUID();
const participantRefWithRole = 'team-' + randomUUID();
const participantRefWithoutRole = 'team-' + randomUUID();

beforeAll(async () => {
  o2 = await spawnO2();
  process.env.O2_BASE_URL = o2.baseUrl;
  ({ app } = await import('../../src/handler.js'));

  const db = makeDocClient();
  await db.send(new PutCommand({ TableName: resourceName('o5-windows'), Item: { sportEventId, state: 'Open' } }));
  await db.send(new PutCommand({ TableName: resourceName('o5-participants'), Item: { participantRef: participantRefWithRole } }));
  await db.send(new PutCommand({ TableName: resourceName('o5-participants'), Item: { participantRef: participantRefWithoutRole } }));
}, 20_000);

afterAll(async () => {
  await o2.stop();
});

async function issueToken(roles: string[]): Promise<string> {
  const res = await fetch(`${o2.baseUrl}/identities/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact: `${randomUUID()}@example.com`, roles }),
  });
  const { token } = await res.json();
  return token;
}

test('test_confirm_withoutRegistrationManagerRole_returns403NotAuthorized', async () => {
  const applyRes = await app.request('/registrations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: coachToken },
    body: JSON.stringify({ participantRef: participantRefWithoutRole, sportEventId, categoria: 'U15' }),
  });
  expect(applyRes.status).toBe(201);
  const { registrationId } = await applyRes.json();

  const token = await issueToken([]);
  const confirmRes = await app.request(`/registrations/${registrationId}/confirm`, {
    method: 'POST',
    headers: { authorization: token },
  });
  expect(confirmRes.status).toBe(403);
  expect(await confirmRes.json()).toMatchObject({ code: 'FORBIDDEN' });
});

test('test_confirm_withRegistrationManagerRole_returns200Confirmed', async () => {
  const applyRes = await app.request('/registrations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: coachToken },
    body: JSON.stringify({ participantRef: participantRefWithRole, sportEventId, categoria: 'U15' }),
  });
  expect(applyRes.status).toBe(201);
  const { registrationId } = await applyRes.json();

  const token = await issueToken(['RegistrationManager']);
  const confirmRes = await app.request(`/registrations/${registrationId}/confirm`, {
    method: 'POST',
    headers: { authorization: token },
  });
  expect(confirmRes.status).toBe(200);
  expect(await confirmRes.json()).toMatchObject({ status: 'Confirmed' });
});
