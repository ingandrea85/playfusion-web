import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S11.4 — acceptance E2E for tie-break policy + manual resolution (O8) against a REAL deployed
// env (stg). Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// create (Calcio, explicit tieBreak) → confirm 2 teams → generate (1 match) → record+finish a
// draw → standings report the pair as `unresolved` → setTieOverride resolves it (rows ordered,
// unresolved empty, audit present) → correcting the result to a win self-invalidates the override.
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
const recordAndFinish = async (eventId: string, matchId: string, homeScore: number, awayScore: number, org: string) => {
  expect((await post(`/o7/events/${eventId}/matches/${matchId}/result`, { homeScore, awayScore }, { authorization: org })).status).toBe(200);
  expect((await post(`/o7/events/${eventId}/matches/${matchId}/finish`, undefined, { authorization: org })).status).toBe(200);
};

run('test_e2e_tiebreak_unresolvedThenManualOverrideThenSelfInvalidate', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' }, tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'] }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 2; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  // Generate → a single group of 2 → exactly 1 match.
  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 1) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches).toHaveLength(1);
  const m = matches[0];

  // A 1-1 draw → both teams level on points/GD/GF and the head-to-head is drawn → residual tie.
  await recordAndFinish(sportEventId, m.id, 1, 1, org);
  let standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(standings).toHaveLength(1);
  const cat: string = standings[0].categoryId, group: string = standings[0].groupLabel;
  expect(standings[0].rows).toHaveLength(2);
  expect(standings[0].rows.every((r: any) => r.points === 1)).toBe(true);
  expect(standings[0].unresolved).toEqual([[m.home, m.away].sort()]);
  expect(standings[0].override).toBeUndefined();

  // Organizer forces an order (reverse of the name-sorted pair) → the tie is resolved and audited.
  const forced = [...standings[0].unresolved[0]].reverse();
  const ovPath = `/o7/events/${sportEventId}/standings/${encodeURIComponent(cat)}/${encodeURIComponent(group)}/override`;
  expect((await put(ovPath, { order: forced }, { authorization: org })).status).toBe(200);
  standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(standings[0].rows.map((r: any) => r.team)).toEqual(forced);
  expect(standings[0].unresolved).toEqual([]);
  expect(standings[0].override.order).toEqual(forced);
  expect(typeof standings[0].override.resolvedBy).toBe('string');
  expect(standings[0].override.resolvedBy.length).toBeGreaterThan(0);
  expect(typeof standings[0].override.resolvedAt).toBe('string');

  // Correcting the result to a clear win breaks the tie → the override no longer matches and is
  // silently dropped (self-invalidation): the sporting order stands, no audit surfaced.
  await recordAndFinish(sportEventId, m.id, 3, 0, org);
  standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(standings[0].unresolved).toEqual([]);
  expect(standings[0].override).toBeUndefined();
  expect(standings[0].rows[0]).toMatchObject({ team: m.home, points: 3 });
  expect(standings[0].rows[1]).toMatchObject({ team: m.away, points: 0 });
}, 120_000);
