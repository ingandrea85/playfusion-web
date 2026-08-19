import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E: categories of ONE tournament can have DIFFERENT finals formats (config moved from
// the event to the per-category schedule config, Calendario). Skip-gated on API_BASE_URL.
// 2 categories → generate with byCategory finals: U10 = SINGLE_GROUP_CROSSOVER, U12 = none →
// U10 has a bracket, U12 has none.
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

run('test_e2e_perCategoryFinalsFormats', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8, U12: 8 } }, { authorization: org });
  for (const cat of ['U10', 'U12']) {
    for (let i = 0; i < 2; i++) {
      const coach = await token(['coach'], 'coach-enrollment');
      const applied = await j(await postUntil('/o5/registrations', { participantRef: `${cat}-${i}-${randomUUID().slice(0, 4)}`, sportEventId, categoria: cat }, 201, { authorization: `Bearer ${coach}` }));
      await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
    }
  }

  const cat = (over: Record<string, unknown>) => ({ fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE', ...over });
  let all: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, {
      fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsDate: '2026-09-03',
      byCategory: { U10: cat({ finalsType: 'SINGLE_GROUP_CROSSOVER' }), U12: cat({}) },
    }, { authorization: org }));
    all = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (all.some((m) => m.categoryId === 'U10' && m.phase === 'FINAL')) break;
    await sleep(750);
  } while (Date.now() < deadline);

  const u10Finals = all.filter((m) => m.categoryId === 'U10' && (m.phase === 'FINAL' || m.phase === 'FINAL_GROUP'));
  const u12Finals = all.filter((m) => m.categoryId === 'U12' && (m.phase === 'FINAL' || m.phase === 'FINAL_GROUP'));
  expect(u10Finals.length).toBeGreaterThan(0); // U10 configured with a finals format
  expect(u12Finals).toHaveLength(0);           // U12 configured with none
}, 120_000);
