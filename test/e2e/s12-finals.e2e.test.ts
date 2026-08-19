import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S12.6 — acceptance E2E for finals brackets + qualifier resolution (O6/O8) against a REAL deployed
// env (stg). Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// create (Calcio) → finals-config (SINGLE_GROUP_CROSSOVER, Q2) → confirm 3 teams → generate →
// matches include a FINAL row with placeholders → complete the group (no tie) → the finals slots
// resolve to the ranked teams (on GET matches) → a recorded FINAL result does NOT move the standings.
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
const recordAndFinish = async (eventId: string, matchId: string, hs: number, as: number, org: string) => {
  expect((await post(`/o7/events/${eventId}/matches/${matchId}/result`, { homeScore: hs, awayScore: as }, { authorization: org })).status).toBe(200);
  expect((await post(`/o7/events/${eventId}/matches/${matchId}/finish`, undefined, { authorization: org })).status).toBe(200);
};

run('test_e2e_finals_bracketPlaceholdersThenResolveOnGroupComplete', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  // Finals format now lives on the schedule config (Calendario), passed at generate time.
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 3; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  // Generate → 3 group fixtures + 1 FINAL (Tabellone: 1ª vs 2ª).
  let all: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsDate: '2026-09-03', finalsType: 'SINGLE_GROUP_CROSSOVER' }, { authorization: org }));
    all = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (all.filter((m) => m.phase === 'FINAL').length >= 1) break;
    await sleep(750);
  } while (Date.now() < deadline);
  const groupMatches = all.filter((m) => m.phase !== 'FINAL');
  const finals = all.filter((m) => m.phase === 'FINAL');
  expect(groupMatches).toHaveLength(3);
  expect(finals).toHaveLength(1);
  // Before results: placeholders, not resolved.
  expect(finals[0].home).toMatch(/^1ª Girone/);
  expect(finals[0].away).toMatch(/^2ª Girone/);
  expect(finals[0].homeResolved ?? null).toBeNull();

  // Play the whole group so home wins every match → clear order (points 6 / 3 / 0, no tie).
  for (const m of groupMatches) await recordAndFinish(sportEventId, m.id, 1, 0, org);

  const resolvedAll = await j(await get(`/o7/events/${sportEventId}/standings`));
  const rows = resolvedAll[0].rows.map((r: any) => r.team);
  const finalsResolved = (await j(await get(`/o7/events/${sportEventId}/matches`))).find((m: any) => m.phase === 'FINAL');
  // The Nª Girone placeholders now resolve to the 1st and 2nd ranked teams.
  expect(finalsResolved.homeResolved).toBe(rows[0]);
  expect(finalsResolved.awayResolved).toBe(rows[1]);

  // Recording the FINAL result must NOT move the group standings (finals excluded).
  const pointsBefore = resolvedAll[0].rows.map((r: any) => r.points).join(',');
  await recordAndFinish(sportEventId, finalsResolved.id, 5, 0, org);
  const afterStandings = await j(await get(`/o7/events/${sportEventId}/standings`));
  expect(afterStandings[0].rows.map((r: any) => r.points).join(',')).toBe(pointsBefore);
}, 120_000);
