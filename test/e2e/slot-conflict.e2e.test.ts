import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Regression E2E: a team must never play two matches at the same (day, time). Reproduces the
// reported bug (home/away legs on different fields at the same time) against real stg.
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

run('test_e2e_noTeamPlaysTwiceInTheSameSlot_homeAway', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-05' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 4; i++) {
    const coach = await token(['coach'], 'coach-enrollment');
    const applied = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: org });
  }

  // 1 girone of 4, home & away → 12 matches; each team plays 6 → forces many distinct slots.
  let matches: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${sportEventId}/schedule:generate`, { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'HOME_AWAY' }, { authorization: org }));
    matches = await j(await get(`/o7/events/${sportEventId}/matches`));
    if (matches.length >= 12) break;
    await sleep(750);
  } while (Date.now() < deadline);
  expect(matches).toHaveLength(12);

  // No team appears twice in the same (day, time); no field double-booked.
  const bySlot = new Map<string, Set<string>>();
  const fieldSeen = new Set<string>();
  for (const m of matches) {
    const slot = `${m.day} ${m.time}`;
    const teams = bySlot.get(slot) ?? new Set<string>();
    expect(teams.has(m.home)).toBe(false);
    expect(teams.has(m.away)).toBe(false);
    teams.add(m.home); teams.add(m.away); bySlot.set(slot, teams);
    const fk = `${slot} ${m.field}`;
    expect(fieldSeen.has(fk)).toBe(false);
    fieldSeen.add(fk);
  }
}, 120_000);
