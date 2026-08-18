import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S8.5 — acceptance E2E for the O6 Gironi editor against a REAL deployed env (stg). Skip-gated
// on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// Exercises the exact REST the E1 gironi editor calls: create event → open window → confirm 4
// teams → o3 draw (2 groups) → move a team across groups → o7 generate → assert the calendar
// follows the composition → lock (draw becomes a no-op).
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

run('test_e2e_gironi_drawMoveGenerateLock', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, undefined, { authorization: org });
  for (let i = 0; i < 4; i++) await confirmTeam(org, sportEventId, 'U10');

  // Draw 2 groups. Eventually consistent on the confirm projection → poll until 4 teams land.
  let comp: any;
  const deadline = Date.now() + 25_000;
  do {
    comp = await j(await post(`/o3/events/${sportEventId}/gironi:draw`, { categoria: 'U10', groupsCount: 2 }, { authorization: org }));
    const total = comp.groups.reduce((n: number, g: any) => n + g.teams.length, 0);
    if (total === 4) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(comp.groups).toHaveLength(2);
  expect(comp.groups.reduce((n: number, g: any) => n + g.teams.length, 0)).toBe(4);
  expect(comp.locked).toBe(false);

  // Public read matches.
  const gironi = await j(await get(`/o3/events/${sportEventId}/gironi`));
  expect(gironi.U10.groups).toHaveLength(2);

  // Move every team into Girone A (so B empties) and save → the composition drives generation.
  const allTeams = comp.groups.flatMap((g: any) => g.teams) as string[];
  const moved = [{ label: 'Girone A', teams: allTeams }, { label: 'Girone B', teams: [] as string[] }];
  const saved = await j(await put(`/o3/events/${sportEventId}/gironi/U10`, { groups: moved, locked: false }, { authorization: org }));
  expect(saved.groups[0].teams).toHaveLength(4);

  // Generate → all 4 teams in one group → C(4,2) = 6 matches, all Girone A.
  await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 2, legs: 'SINGLE' }, { authorization: org }));
  const matches = await j(await get(`/o7/events/${sportEventId}/matches`));
  expect(matches).toHaveLength(6);
  expect(matches.every((m: any) => m.groupLabel === 'Girone A')).toBe(true);

  // Lock → draw is now a no-op (composition preserved).
  await put(`/o3/events/${sportEventId}/gironi/U10`, { groups: moved, locked: true }, { authorization: org });
  const afterLockDraw = await j(await post(`/o3/events/${sportEventId}/gironi:draw`, { categoria: 'U10', groupsCount: 3 }, { authorization: org }));
  expect(afterLockDraw.locked).toBe(true);
  expect(afterLockDraw.groups).toHaveLength(2); // unchanged, not re-split into 3
}, 120_000);
