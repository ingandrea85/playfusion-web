import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E: a drawn knockout (FINAL) match blocks the next round's "Vincente <slot>"; the
// organizer decrees who advances and the bracket resolves. Skip-gated on API_BASE_URL.
// 8 teams → 4 groups of 2 (PLACEMENT) → complete groups → tier-0 semis resolve → draw a semifinal →
// the final's Vincente stays a placeholder → decide-winner → the final resolves to the decreed team.
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

run('test_e2e_decideWinner_advancesDrawnKnockout', async () => {
  const org = 'Bearer ' + await tok(['RegistrationManager']);
  const id = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-01' } }, { authorization: org }))).sportEventId as string;
  await post(`/o5/events/${id}/registration-window:open`, { capacities: { U10: 8 } }, { authorization: org });
  for (let i = 0; i < 8; i++) {
    const coach = await tok(['coach'], 'coach-enrollment');
    const ap = await j(await postUntil('/o5/registrations', { participantRef: `T${i}-${randomUUID().slice(0, 5)}`, sportEventId: id, categoria: 'U10' }, 201, { authorization: `Bearer ${coach}` }));
    await post(`/o5/registrations/${ap.registrationId}/confirm`, undefined, { authorization: org });
  }

  // 4 groups of 2 → PLACEMENT tier 0 = 2 semifinals + 1 final (Vincente T1-SF1 vs Vincente T1-SF2).
  let all: any[] = [];
  const deadline = Date.now() + 25_000;
  do {
    await j(await post(`/o7/events/${id}/schedule:generate`, { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 4, legs: 'SINGLE', finalsType: 'PLACEMENT' }, { authorization: org }));
    all = await j(await get(`/o7/events/${id}/matches`));
    if (all.some((m) => m.slot === 'T1-F1')) break;
    await sleep(750);
  } while (Date.now() < deadline);
  const groups = all.filter((m) => (m.phase ?? 'GROUP') === 'GROUP');
  expect(groups.length).toBe(4); // 4 groups × 1 match
  for (const m of groups) await recordAndFinish(id, m.id, 1, 0, org); // decisive, no ties

  // Semifinals now have their seeds resolved. Draw SF1, then verify the final stays blocked.
  const sf1 = (await j(await get(`/o7/events/${id}/matches`))).find((m: any) => m.slot === 'T1-SF1');
  expect(sf1.homeResolved && sf1.awayResolved).toBeTruthy();
  await recordAndFinish(id, sf1.id, 1, 1, org); // drawn semifinal

  let fin = (await j(await get(`/o7/events/${id}/matches`))).find((m: any) => m.slot === 'T1-F1');
  expect(fin.home).toBe('Vincente T1-SF1');
  expect(fin.homeResolved ?? null).toBeNull(); // drawn semi, no decree → still a placeholder

  // Decree the home side of SF1 → the final's "Vincente T1-SF1" resolves to that team.
  expect((await post(`/o7/events/${id}/matches/${sf1.id}/decide-winner`, { winner: 'HOME' }, { authorization: org })).status).toBe(200);
  fin = (await j(await get(`/o7/events/${id}/matches`))).find((m: any) => m.slot === 'T1-F1');
  expect(fin.homeResolved).toBe(sf1.homeResolved); // advanced the decreed team
}, 120_000);
