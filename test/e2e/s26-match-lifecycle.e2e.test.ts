import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S26.6 — acceptance E2E for the match lifecycle against a REAL deployed env (stg).
// Verifies: only FINISHED counts in standings (LIVE does not); cancel excludes a match;
// a field director may start/record/finish their field but may NOT correct a FINISHED match
// nor cancel (organizer-only).
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
const groupOf = (standings: any[], m: any) => standings.find((g: any) => g.categoryId === m.categoryId && g.groupLabel === m.groupLabel);

run('test_e2e_onlyFinishedCounts_and_cancelExcludes', async () => {
  const org = await token(['RegistrationManager']);
  const { id, matches } = await makeEventWithMatches(org);
  expect(matches.length).toBe(6);
  const m = matches[0];

  // start → LIVE
  expect((await j(await post(`/o7/events/${id}/matches/${m.id}/start`, undefined, { authorization: org }))).status).toBe('LIVE');
  // record a live score → does NOT count yet
  await post(`/o7/events/${id}/matches/${m.id}/result`, { homeScore: 3, awayScore: 0 }, { authorization: org });
  let g = groupOf(await j(await get(`/o7/events/${id}/standings`)), m);
  expect(g.rows.every((row: any) => row.played === 0)).toBe(true);

  // finish → counts
  expect((await j(await post(`/o7/events/${id}/matches/${m.id}/finish`, undefined, { authorization: org }))).status).toBe('FINISHED');
  g = groupOf(await j(await get(`/o7/events/${id}/standings`)), m);
  expect(g.rows.find((row: any) => row.team === m.home)).toMatchObject({ points: 3, played: 1 });

  // cancel → excluded again
  expect((await j(await post(`/o7/events/${id}/matches/${m.id}/cancel`, undefined, { authorization: org }))).status).toBe('CANCELLED');
  g = groupOf(await j(await get(`/o7/events/${id}/standings`)), m);
  expect(g.rows.every((row: any) => row.played === 0)).toBe(true);
}, 180_000);

run('test_e2e_director_startFinishOwnField_butNoCorrectFinished_noCancel', async () => {
  const org = await token(['RegistrationManager']);
  const { id, matches } = await makeEventWithMatches(org);
  const field1 = matches[0].field as string;
  const dirTok = (await j(await post(`/o7/events/${id}/director-token`, { field: field1 }, { authorization: org }))).token as string;
  const dir = { authorization: `Bearer ${dirTok}` };
  const mine = matches.find((m: any) => m.field === field1)!;

  expect((await post(`/o7/events/${id}/matches/${mine.id}/start`, undefined, dir)).status).toBe(200);
  expect((await post(`/o7/events/${id}/matches/${mine.id}/result`, { homeScore: 2, awayScore: 1 }, dir)).status).toBe(200);
  expect((await post(`/o7/events/${id}/matches/${mine.id}/finish`, undefined, dir)).status).toBe(200);
  // director cannot re-open/correct a FINISHED match → 403
  expect((await post(`/o7/events/${id}/matches/${mine.id}/result`, { homeScore: 5, awayScore: 0 }, dir)).status).toBe(403);
  // director cannot cancel (organizer-only)
  expect([401, 403]).toContain((await post(`/o7/events/${id}/matches/${mine.id}/cancel`, undefined, dir)).status);
}, 180_000);
