import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeDocClient } from '@playfusion/platform-lib';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { spawnO2, type SpawnedO2 } from './spawn-o2.js';

// Unique refs per run: re-running this suite against a PERSISTENT LocalStack must not
// collide with a previous run's rows (the double-apply guard would otherwise fire
// spuriously on the happy-path apply).
const sportEventId = 'evt-' + randomUUID();
const participantRef = 'team-' + randomUUID();
const dupParticipantRef = 'team-dup-' + randomUUID();

// O5's handler builds HttpClaimAuthorizer at MODULE LOAD time from process.env.O2_BASE_URL,
// so a REAL O2 process must be up and O2_BASE_URL set BEFORE the dynamic import of the handler.
let o2: SpawnedO2;
let app: any;
let regManagerToken: string;

beforeAll(async () => {
  o2 = await spawnO2();
  process.env.O2_BASE_URL = o2.baseUrl;
  ({ app } = await import('../../src/handler.js')); // export `app` from handler.ts alongside `handler`

  const magicLinkRes = await fetch(`${o2.baseUrl}/identities/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }),
  });
  ({ token: regManagerToken } = await magicLinkRes.json());

  // provision assumed run via `npm run provision`; seed the collaborators O5 needs:
  const db = makeDocClient();
  await db.send(new PutCommand({ TableName: 'o5-windows', Item: { sportEventId, state: 'Open' } }));
  await db.send(new PutCommand({ TableName: 'o5-participants', Item: { participantRef } }));
  await db.send(new PutCommand({ TableName: 'o5-participants', Item: { participantRef: dupParticipantRef } }));
}, 20_000);

afterAll(async () => {
  await o2.stop();
});

test('test_registrationFlow_applyThenConfirm_happyPath', async () => {
  const applyRes = await app.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: regManagerToken }, body: JSON.stringify({ participantRef, sportEventId, categoria: 'U15' }) });
  expect(applyRes.status).toBe(201);
  const { registrationId } = await applyRes.json();

  const db = makeDocClient();
  const stored = await db.send(new GetCommand({ TableName: 'o5-registrations', Key: { registrationId } }));
  expect(stored.Item).toMatchObject({ status: 'Applied' });

  const confirmRes = await app.request(`/registrations/${registrationId}/confirm`, { method: 'POST', headers: { authorization: regManagerToken } });
  expect(confirmRes.status).toBe(200);
  expect(await confirmRes.json()).toMatchObject({ status: 'Confirmed' });
});

test('test_registrationFlow_doubleApply_rejectedWithConflict', async () => {
  const body = JSON.stringify({ participantRef: dupParticipantRef, sportEventId, categoria: 'U15' });
  const first = await app.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  expect(first.status).toBe(201);
  const second = await app.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  expect(second.status).toBe(409);
  expect(await second.json()).toMatchObject({ code: 'DOUBLE_APPLY' });
});

test('test_registrationFlow_missingField_rejectedWith400', async () => {
  // Missing sportEventId + categoria: fails Zod boundary validation before DynamoDB is touched.
  const res = await app.request('/registrations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ participantRef: 'x' }),
  });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ code: 'VALIDATION' });
});
