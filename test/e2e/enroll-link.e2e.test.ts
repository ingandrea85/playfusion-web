import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E for the coach enrollment link (generated at window open, sent by the
// organizer). Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// Flow: organizer opens the window → gets the enrollToken → a coach applies using that token
// (Bearer, as the E3 SPA does) → the team lands in the organizer inbox. Also asserts the
// public window read never leaks the token.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function postUntil(path: string, body: unknown, expected: number, headers: Record<string, string> = {}, timeoutMs = 25_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) { await sleep(500); last = await post(path, body, headers); }
  return last;
}
async function organizerToken(): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }))).token as string;
}

run('test_e2e_enrollLink_organizerOpensCoachApplies', async () => {
  const org = await organizerToken();
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;

  // Open the window → the response carries the coach enrollment token.
  const opened = await j(await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org }));
  expect(opened.state).toBe('Open');
  const enrollToken = opened.enrollToken as string;
  expect(enrollToken).toBeTruthy();

  // Organizer can re-read it; the public window read must NOT leak it.
  expect((await j(await get(`/o5/events/${sportEventId}/enroll-token`, { authorization: org }))).enrollToken).toBe(enrollToken);
  const publicWindow = await j(await get(`/o5/events/${sportEventId}/registration-window`));
  expect(publicWindow.enrollToken).toBeUndefined();

  // Coach applies with the enroll token exactly as the E3 SPA does (Bearer).
  const applyRes = await postUntil('/o5/registrations', { participantRef: 'Falchi Rossi', sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${enrollToken}` });
  expect(applyRes.status).toBe(201);
  const registrationId = (await j(applyRes)).registrationId as string;

  // Lands in the organizer inbox (Applied).
  const inbox = await j(await get(`/o5/events/${sportEventId}/registrations?state=Applied`, { authorization: org }));
  expect(inbox.some((r: any) => r.registrationId === registrationId)).toBe(true);

  // Applying without the token is rejected (the gate still holds).
  expect((await post('/o5/registrations', { participantRef: 'NoToken', sportEventId, categoria: 'U10' })).status).toBe(401);
}, 90_000);
