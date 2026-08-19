import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S24.3 — acceptance E2E for per-match team edit (level B) against a REAL deployed env (stg).
// Skip-gated on API_BASE_URL. create → confirm 3 teams → generate → edit a match's teams
// (swap, result reset) → same-team 422 → unconfirmed team 422.
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

run('test_e2e_editTeams_swapResetsScore_andValidatesLevelB', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 3; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 3) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches.length).toBe(3);
  const m0 = matches[0];

  // Record a result, then swap the teams → teams change ⇒ score reset.
  expect((await post(`/o7/events/${sportEventId}/matches/${m0.id}/result`, { homeScore: 2, awayScore: 0 }, { authorization: org })).status).toBe(200);
  const edited = await j(await put(`/o7/events/${sportEventId}/matches/${m0.id}`, { day: m0.day, time: m0.time, field: m0.field, home: m0.away, away: m0.home }, { authorization: org }));
  expect(edited).toMatchObject({ home: m0.away, away: m0.home, homeScore: null, awayScore: null });
  const after = (await j(await get(`/o7/events/${sportEventId}/matches`))).find((m: any) => m.id === m0.id);
  expect(after).toMatchObject({ home: m0.away, away: m0.home });

  // Same team → 422; unconfirmed team → 422 (level B).
  expect((await put(`/o7/events/${sportEventId}/matches/${m0.id}`, { day: m0.day, time: m0.time, field: m0.field, home: m0.home, away: m0.home }, { authorization: org })).status).toBe(422);
  expect((await put(`/o7/events/${sportEventId}/matches/${m0.id}`, { day: m0.day, time: m0.time, field: m0.field, home: m0.home, away: 'Squadra Inventata' }, { authorization: org })).status).toBe(422);
}, 120_000);
