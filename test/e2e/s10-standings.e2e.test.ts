import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S10.5 — acceptance E2E for live standings (O8) against a REAL deployed env (stg).
// Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// create → open → confirm 3 teams → generate → record results → GET standings recomputed &
// ordered; then correct a result → standings recompute.
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
const points = (standings: any[]): number[] => standings[0].rows.map((r: any) => r.points);

run('test_e2e_standings_recomputeAndReorder', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 3; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  // Generate → a single group of 3 → 3 matches (pairs t0-t1, t0-t2, t1-t2).
  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 3) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches).toHaveLength(3);

  // Home wins every match → in a 3-team round-robin the points are exactly 6 / 3 / 0.
  for (const m of matches) expect((await post(`/o7/events/${sportEventId}/matches/${m.id}/result`, { homeScore: 1, awayScore: 0 }, { authorization: org })).status).toBe(200);
  let standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(standings).toHaveLength(1);
  expect(standings[0].rows).toHaveLength(3);
  expect(points(standings)).toEqual([6, 3, 0]);
  expect(standings[0].rows[0]).toMatchObject({ played: 2, won: 2, goalDiff: 2 });

  // Correct the first match to a 1-1 draw → recompute: top points drops from 6 to 4.
  expect((await post(`/o7/events/${sportEventId}/matches/${matches[0].id}/result`, { homeScore: 1, awayScore: 1 }, { authorization: org })).status).toBe(200);
  standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(Math.max(...points(standings))).toBe(4);
}, 120_000);
