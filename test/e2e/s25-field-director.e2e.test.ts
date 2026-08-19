import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S25.4 — acceptance E2E for field directors against a REAL deployed env (stg). A director
// token (per field) can record results only for its field, only for its event.
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
async function token(roles: string[], purpose?: string): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles, purpose }))).token as string;
}
async function makeEventWithMatches(org: string): Promise<{ id: string; matches: any[] }> {
  const id = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-04' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${id}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 4; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId: id, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }
  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${id}/schedule:generate`, { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${id}/matches`));
    if (matches.length >= 6) break;
    await sleep(750);
  } while (Date.now() < deadline);
  return { id, matches };
}

run('test_e2e_fieldDirector_recordsOwnFieldOnly', async () => {
  const org = await token(['RegistrationManager']);
  const { id, matches } = await makeEventWithMatches(org);
  expect(matches.length).toBe(6);
  const fields = [...new Set(matches.map((m: any) => m.field))];
  expect(fields.length).toBeGreaterThanOrEqual(2); // matches span both fields

  const field1 = matches[0].field as string;
  const dirTok = (await j(await post(`/o7/events/${id}/director-token`, { field: field1 }, { authorization: org }))).token as string;
  const mine = matches.find((m: any) => m.field === field1)!;
  const other = matches.find((m: any) => m.field !== field1)!;

  // Director records a result on its own field → 200.
  expect((await post(`/o7/events/${id}/matches/${mine.id}/result`, { homeScore: 3, awayScore: 1 }, { authorization: `Bearer ${dirTok}` })).status).toBe(200);
  // ...but not on another field → 403.
  expect((await post(`/o7/events/${id}/matches/${other.id}/result`, { homeScore: 1, awayScore: 0 }, { authorization: `Bearer ${dirTok}` })).status).toBe(403);

  // A director token for a DIFFERENT event can't touch this event → 403.
  const other2 = await makeEventWithMatches(org);
  const foreignTok = (await j(await post(`/o7/events/${other2.id}/director-token`, { field: 'Campo A' }, { authorization: org }))).token as string;
  expect((await post(`/o7/events/${id}/matches/${mine.id}/result`, { homeScore: 0, awayScore: 0 }, { authorization: `Bearer ${foreignTok}` })).status).toBe(403);
}, 180_000);
