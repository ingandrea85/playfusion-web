import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S7.5 — acceptance E2E for the O7 Scheduling slice against a REAL deployed environment
// (stg on AWS). Skip-gated on API_BASE_URL, so `npm test`/CI stay green. Run it with:
//   API_BASE_URL=<deployed-url> npm run test:e2e
// Exercises the exact REST the E1 schedule screen and E3 calendar call: create event ->
// open window -> confirm a few teams -> o7 generate -> approve -> publish, asserting the
// fixtures round-trip via GET matches and the status machine via GET schedule. o7 reads
// the confirmed teams (o5) and event (o3) over HTTP inside generate.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => req('POST', path, body, headers);
const get = (path: string, headers: Record<string, string> = {}) => req('GET', path, undefined, headers);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postUntil(path: string, body: unknown, expected: number, headers: Record<string, string> = {}, timeoutMs = 25_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) { await sleep(500); last = await post(path, body, headers); }
  return last;
}
async function token(roles: string[], purpose?: string): Promise<string> {
  const res = await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles, purpose }));
  return res.token as string;
}

async function confirmTeam(org: string, sportEventId: string, categoria: string): Promise<string> {
  const participant = await j(await post('/o4/participants', { type: 'squadra', categoria }));
  const participantRef = participant.participantId as string;
  const applyRes = await postUntil('/o5/registrations', { participantRef, sportEventId, categoria }, 201, { authorization: await token(['coach'], 'coach-enrollment') });
  expect(applyRes.status).toBe(201);
  const registrationId = (await j(applyRes)).registrationId as string;
  const confirm = await post(`/o5/registrations/${registrationId}/confirm`, undefined, { authorization: org });
  expect(confirm.status).toBe(200);
  return registrationId;
}

run('test_e2e_scheduling_generateApprovePublishRoundTrip', async () => {
  const org = await token(['RegistrationManager']);

  // E1: create a PB-1 event and open the window.
  const evt = await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }));
  const sportEventId = evt.sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, undefined, { authorization: org });

  // Confirm 3 teams in U10 → a single-leg round-robin is 3 matches.
  await confirmTeam(org, sportEventId, 'U10');
  await confirmTeam(org, sportEventId, 'U10');
  await confirmTeam(org, sportEventId, 'U10');

  const config = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' };

  // Generate — o7 reads o5 confirmed teams + o3 event over HTTP. Eventually consistent on
  // the confirm projection, so poll until at least the expected fixtures appear.
  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    const gen = await j(await post(`/o7/events/${sportEventId}/schedule:generate`, config, { authorization: org }));
    expect(gen.status).toBe('GENERATED');
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 3) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches.length).toBe(3);
  expect(matches.every((m: any) => m.categoryId === 'U10' && m.groupLabel === 'Girone A')).toBe(true);
  expect(matches.every((m: any) => m.home && m.away && m.day && m.time && m.field)).toBe(true);

  // Approve locks the config; a subsequent generate is a no-op that keeps APPROVED.
  expect((await j(await post(`/o7/events/${sportEventId}/schedule:approve`, undefined, { authorization: org }))).status).toBe('APPROVED');
  expect((await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { ...config, fields: ['X'] }, { authorization: org }))).status).toBe('APPROVED');

  // Publish opens the public calendar.
  expect((await j(await post(`/o7/events/${sportEventId}/schedule:publish`, undefined, { authorization: org }))).status).toBe('PUBLISHED');

  // Public read: schedule is PUBLISHED and the same fixtures are visible.
  const schedule = await j(await get(`/o7/events/${sportEventId}/schedule`));
  expect(schedule).toMatchObject({ sportEventId, status: 'PUBLISHED' });
  const publicMatches = await j(await get(`/o7/events/${sportEventId}/matches`));
  expect(publicMatches.length).toBe(3);
}, 120_000);

run('test_e2e_scheduling_unscheduledEventReadsAsNone', async () => {
  const org = await token(['RegistrationManager']);
  const evt = await j(await post('/o3/events', { sport: 'Basket', categorie: ['U14'], dates: { from: '2026-10-01', to: '2026-10-02' } }, { authorization: org }));
  const schedule = await j(await get(`/o7/events/${evt.sportEventId}/schedule`));
  expect(schedule.status).toBe('NONE');
  expect(await j(await get(`/o7/events/${evt.sportEventId}/matches`))).toEqual([]);
}, 60_000);
