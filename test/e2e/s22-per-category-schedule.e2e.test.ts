import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S22.4 — acceptance E2E for per-category schedule config against a REAL deployed env (stg).
// Skip-gated on API_BASE_URL. Run: API_BASE_URL=<deployed-url> npm run test:e2e
// Two categories generated with DIFFERENT fields + legs → each category's matches land on
// its own field, with its own leg count.
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
run('test_e2e_perCategorySchedule_placesEachCategoryOnItsOwnFields', async () => {
  const org = await token(['RegistrationManager']);
  const catA = `A${randomUUID().slice(0, 4)}`;
  const catB = `B${randomUUID().slice(0, 4)}`;
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: [catA, catB], dates: { from: '2026-09-01', to: '2026-09-03' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { [catA]: 8, [catB]: 8 } }, { authorization: org });

  // Confirm 2 teams per category (coach magic-link apply, then organizer confirm).
  for (const cat of [catA, catA, catB, catB]) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `${cat}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: cat }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  const config = {
    dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE',
    fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10,
    byCategory: {
      [catA]: { fields: ['Campo Nord'], periods: 1, periodMinutes: 10, breakMinutes: 0, legs: 'SINGLE' },
      [catB]: { fields: ['Campo Sud'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'HOME_AWAY' },
    },
  };

  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, config, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 3) break; // catA: 1 match; catB: 2 (home/away)
    await sleep(750);
  } while (Date.now() < deadline);

  const a = matches.filter((m: any) => m.categoryId === catA);
  const b = matches.filter((m: any) => m.categoryId === catB);
  expect(a).toHaveLength(1);            // 2 teams, single group, single leg → 1 match
  expect(b).toHaveLength(2);            // 2 teams, home & away → 2 matches
  expect(a.every((m: any) => m.field === 'Campo Nord')).toBe(true);
  expect(b.every((m: any) => m.field === 'Campo Sud')).toBe(true);
  // Distinct fields → both categories can start at the facility opening time on their own field.
  expect(a[0].time).toBe('09:00');
  expect(b.some((m: any) => m.time === '09:00')).toBe(true);
}, 120_000);
