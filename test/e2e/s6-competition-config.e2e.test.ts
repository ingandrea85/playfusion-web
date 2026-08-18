import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S6.4 — acceptance E2E for the O6 Competition config slice against a REAL deployed
// environment (stg on AWS). Skip-gated on API_BASE_URL, so `npm test`/CI stay green.
// Run it with:
//   API_BASE_URL=<deployed-url> npm run test:e2e
// Exercises the exact REST the E1 create-event form and Panoramica call: create an event
// with the full competition config (Playbook + name/location/start date+time + a custom
// tie-break policy) -> read it back via o3.getEvent -> assert every field persisted.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, {
    method,
    headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) => req('POST', path, body, headers);
const get = (path: string, headers: Record<string, string> = {}) => req('GET', path, undefined, headers);

async function organizerToken(): Promise<string> {
  const res = await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }));
  return res.token as string;
}

run('test_e2e_competitionConfig_createPersistsAndReadsBack', async () => {
  const org = await organizerToken();

  // E1 create-event: full competition config, PB-1, custom tie-break order (points implied first).
  const input = {
    sport: 'Calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-02' },
    name: 'Torneo Estivo Memorial', location: 'Centro Sportivo · Rivalta (TO)', startTime: '09:00',
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE'], playbook: 'PB-1',
  };
  const created = await j(await post('/o3/events', input, { authorization: org }));
  expect(created).toMatchObject({ status: 'Published' });
  const sportEventId = created.sportEventId as string;

  // Panoramica reads o3.getEvent — every persisted field must round-trip.
  const detail = await j(await get(`/o3/events/${sportEventId}`));
  expect(detail).toMatchObject({
    sportEventId, sport: 'Calcio', categorie: ['U10', 'U12'],
    dates: { from: '2026-09-01', to: '2026-09-02' }, status: 'Published',
    name: 'Torneo Estivo Memorial', location: 'Centro Sportivo · Rivalta (TO)', startTime: '09:00',
    tieBreak: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE'], playbook: 'PB-1',
  });
}, 60_000);

run('test_e2e_competitionConfig_playbookDefaultsToPB1', async () => {
  const org = await organizerToken();
  // A minimal (pre-S6-shape) create still works; the read contract always exposes a playbook.
  const created = await j(await post('/o3/events', { sport: 'Basket', categorie: ['U14'], dates: { from: '2026-10-01', to: '2026-10-02' } }, { authorization: org }));
  const detail = await j(await get(`/o3/events/${created.sportEventId}`));
  expect(detail.playbook).toBe('PB-1');
}, 60_000);
