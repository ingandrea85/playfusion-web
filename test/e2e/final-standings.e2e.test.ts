import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E: once the finals are played, the progressive final ranking fills 1º..Nº.
// SPLIT (1 group of 4, bracket 2): complete groups → complete the final + the final-group match →
// GET /final-standings gives four decided positions (no "pending"). Skip-gated on API_BASE_URL.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (m: string, p: string, b?: unknown, h: Record<string, string> = {}) =>
  fetch(`${API}${p}`, { method: m, headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...h }, body: b === undefined ? undefined : JSON.stringify(b) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const get = (p: string) => req('GET', p);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function postUntil(path: string, body: unknown, expected: number, headers: Record<string, string> = {}, timeoutMs = 25_000): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) { await sleep(500); last = await post(path, body, headers); }
  return last;
}
const tok = async (roles: string[], purpose?: string): Promise<string> =>
  (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles, purpose }))).token as string;
const recordAndFinish = async (id: string, mid: string, hs: number, as: number, org: string) => {
  expect((await post(`/o7/events/${id}/matches/${mid}/result`, { homeScore: hs, awayScore: as }, { authorization: org })).status).toBe(200);
  expect((await post(`/o7/events/${id}/matches/${mid}/finish`, undefined, { authorization: org })).status).toBe(200);
};

run('test_e2e_finalStandings_fillsPodiumWhenFinalsPlayed', async () => {
  const org = 'Bearer ' + await tok(['RegistrationManager']);
  const id = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-01' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${id}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 4; i++) {
    const coach = await tok(['coach'], 'coach-enrollment');
    const ap = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId: id, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${ap.registrationId}/confirm`, undefined, { authorization: org });
  }

  let all: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${id}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE', finalsType: 'SPLIT_GROUP_FINALS', finalsTeamsToBracket: 2 }, { authorization: org }));
    all = await j(await get(`/o7/events/${id}/matches`));
    if (all.some((m) => m.phase === 'FINAL') && all.some((m) => m.phase === 'FINAL_GROUP')) break;
    await sleep(750);
  } while (Date.now() < deadline);

  for (const m of all.filter((m) => (m.phase ?? 'GROUP') === 'GROUP')) {
    const homeWins = String(m.home) < String(m.away);
    await recordAndFinish(id, m.id, homeWins ? 1 : 0, homeWins ? 0 : 1, org);
  }
  const resolved = await j(await get(`/o7/events/${id}/matches`));
  await recordAndFinish(id, resolved.find((m: any) => m.phase === 'FINAL').id, 1, 0, org);
  await recordAndFinish(id, resolved.find((m: any) => m.phase === 'FINAL_GROUP').id, 1, 0, org);

  const [cat] = await j(await get(`/o7/events/${id}/final-standings`));
  expect(cat.rows.map((r: any) => r.position)).toEqual([1, 2, 3, 4]);
  expect(cat.rows.every((r: any) => typeof r.team === 'string' && !r.pending)).toBe(true); // fully decided
}, 120_000);
