import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S13.6 — acceptance E2E for the Playfusion-1-aligned finals (SPLIT_GROUP_FINALS: bracket + final
// group) + qualifier resolution, against a REAL deployed env (stg). Skip-gated on API_BASE_URL.
// create → finals-config SPLIT (bracket=2) → confirm 4 teams (1 group) → generate → matches carry a
// FINAL (1ª vs 2ª) + a FINAL_GROUP (3ª vs 4ª) with placeholders → complete the group (deterministic:
// the alphabetically-first team wins, so a strict 1>2>3>4 order) → placeholders resolve to real teams
// and the FINAL_GROUP produces its own standings. (Winner propagation is unit-tested.)
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

run('test_e2e_splitGroupFinals_bracketPlusFinalGroup_resolves', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  // Finals format now lives on the schedule config (Calendario), passed at generate time.
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 4; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  // Generate: 4 teams, 1 group → 6 group fixtures + 1 FINAL (1ª-2ª) + 1 FINAL_GROUP (3ª-4ª).
  let all: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsDate: '2026-09-03', finalsType: 'SPLIT_GROUP_FINALS', finalsTeamsToBracket: 2 }, { authorization: org }));
    all = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (all.some((m) => m.phase === 'FINAL') && all.some((m) => m.phase === 'FINAL_GROUP')) break;
    await sleep(750);
  } while (Date.now() < deadline);
  const groupMatches = all.filter((m) => m.phase === 'GROUP' || m.phase == null);
  const bracket = all.filter((m) => m.phase === 'FINAL');
  const finalGroup = all.filter((m) => m.phase === 'FINAL_GROUP');
  expect(groupMatches).toHaveLength(6);
  expect(bracket).toHaveLength(1);
  expect(finalGroup).toHaveLength(1);
  expect(bracket[0].home).toMatch(/^1ª/);
  expect(bracket[0].away).toMatch(/^2ª/);
  expect(bracket[0].homeResolved ?? null).toBeNull(); // not resolved before the group is complete

  // Deterministic group results: the alphabetically-first participantRef wins every match → strict
  // 1>2>3>4 order (no ties), so every placeholder resolves.
  for (const m of groupMatches) {
    const homeWins = String(m.home) < String(m.away);
    await recordAndFinish(sportEventId, m.id, homeWins ? 1 : 0, homeWins ? 0 : 1, org);
  }

  const standings = await j(await get(`/o7/events/${sportEventId}/standings`));
  const groupA = standings.find((g: any) => g.groupLabel !== 'Girone finale');
  const order = groupA.rows.map((r: any) => r.team); // strict order 1st..4th
  expect(order).toHaveLength(4);

  const resolved = await j(await get(`/o7/events/${sportEventId}/matches`));
  const rBracket = resolved.find((m: any) => m.phase === 'FINAL');
  const rFinalGroup = resolved.find((m: any) => m.phase === 'FINAL_GROUP');
  expect(rBracket.homeResolved).toBe(order[0]);
  expect(rBracket.awayResolved).toBe(order[1]);
  // FINAL_GROUP seeds 3ª vs 4ª → the two lowest-ranked teams.
  expect([rFinalGroup.homeResolved, rFinalGroup.awayResolved].sort()).toEqual([order[2], order[3]].sort());

  // The final group is its own standings table (real teams), initially all zero.
  const finalGroupStanding = standings.find((g: any) => g.groupLabel === 'Girone finale');
  expect(finalGroupStanding).toBeDefined();
  expect(finalGroupStanding.rows.map((r: any) => r.team).sort()).toEqual([order[2], order[3]].sort());

  // Play the final-group match → its standings reflect a 3-point winner.
  await recordAndFinish(sportEventId, rFinalGroup.id, 2, 1, org);
  const after = await j(await get(`/o7/events/${sportEventId}/standings`));
  const fg = after.find((g: any) => g.groupLabel === 'Girone finale');
  expect(Math.max(...fg.rows.map((r: any) => r.points))).toBe(3);
}, 120_000);
