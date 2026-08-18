import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S9.4 — acceptance E2E for the O7 reschedule slice against a REAL deployed env (stg).
// Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// Exercises the exact REST the E1 calendar editor calls: create → open window → confirm 3
// teams → generate → reschedule a match to a free slot (reflected in GET matches) →
// reschedule onto another match's slot → 409 SLOT_CONFLICT.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const put = (p: string, b?: unknown, h: Record<string, string> = {}) => req('PUT', p, b, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function postUntil(path: string, body: unknown, expected: number, headers: Record<string, string> = {}, timeoutMs = 25_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) { await sleep(500); last = await post(path, body, headers); }
  return last;
}
async function token(roles: string[], purpose?: string): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles, purpose }))).token as string;
}
async function confirmTeam(org: string, sportEventId: string, categoria: string): Promise<void> {
  const participantRef = (await j(await post('/o4/participants', { type: 'squadra', categoria }))).participantId as string;
  const applyRes = await postUntil('/o5/registrations', { participantRef, sportEventId, categoria }, 201, { authorization: await token(['coach'], 'coach-enrollment') });
  expect(applyRes.status).toBe(201);
  const registrationId = (await j(applyRes)).registrationId as string;
  expect((await post(`/o5/registrations/${registrationId}/confirm`, undefined, { authorization: org })).status).toBe(200);
}

run('test_e2e_reschedule_movesMatchAndBlocksConflict', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, undefined, { authorization: org });
  for (let i = 0; i < 3; i++) await confirmTeam(org, sportEventId, 'U10'); // 3 teams → 3 fixtures

  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 3) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches.length).toBe(3);

  const m1 = matches[0];
  const m2 = matches.find((m: any) => m.field !== m1.field || m.time !== m1.time);
  expect(m2).toBeTruthy();

  // Reschedule m1 to a clearly free slot → reflected in GET matches.
  const free = { day: '2026-09-02', time: '15:30', field: 'Campo A' };
  const okRes = await put(`/o7/events/${sportEventId}/matches/${m1.id}`, free, { authorization: org });
  expect(okRes.status).toBe(200);
  expect(await j(okRes)).toMatchObject({ id: m1.id, ...free });
  const after = await j(await get(`/o7/events/${sportEventId}/matches`));
  expect(after.find((m: any) => m.id === m1.id)).toMatchObject(free);
  expect(after.find((m: any) => m.id === m2.id)).toMatchObject({ day: m2.day, time: m2.time, field: m2.field }); // untouched

  // Reschedule m1 onto m2's (day,time,field) → 409 SLOT_CONFLICT; m1 stays put.
  const conflictRes = await put(`/o7/events/${sportEventId}/matches/${m1.id}`, { day: m2.day, time: m2.time, field: m2.field }, { authorization: org });
  expect(conflictRes.status).toBe(409);
  expect((await j(conflictRes)).code).toBe('SLOT_CONFLICT');
  const final = await j(await get(`/o7/events/${sportEventId}/matches`));
  expect(final.find((m: any) => m.id === m1.id)).toMatchObject(free); // unchanged by the rejected move
}, 120_000);
