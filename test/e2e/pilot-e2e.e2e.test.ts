import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S0.14 — pilot acceptance E2E against a REAL deployed environment (stg on AWS).
// Skip-gated: runs only when API_BASE_URL points at a deployed API Gateway stage
// (e.g. https://xxxx.execute-api.eu-south-1.amazonaws.com/prod). Without it, this test
// skips, so `npm test` / CI stay green. Run it with:
//   API_BASE_URL=<deployed-url> npm run test:e2e
// Routes follow the S0.7 ApiStack mount: /<bc>/{proxy+} → the BC's Hono app.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const post = (path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function seedAndOpen() {
  const participantRef = 'e2e-' + randomUUID();
  await post('/o4/participants', { participantId: participantRef }); // O4 participant directory
  const evt = await j(await post('/o3/events', { sport: 'Volleyball', categorie: ['U15'], dates: { from: '2026-09-01', to: '2026-09-30' } }));
  await post(`/o5/events/${evt.sportEventId}/registration-window:open`);
  return { participantRef, sportEventId: evt.sportEventId };
}

async function approverToken(): Promise<string> {
  const res = await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }));
  return res.token as string;
}

run('test_e2e_applyThenConfirm_reachesConfirmed (criteria 1,2)', async () => {
  const { participantRef, sportEventId } = await seedAndOpen();
  const apply = await post('/o5/registrations', { participantRef, sportEventId, categoria: 'U15' });
  expect(apply.status).toBe(201);
  const applied = await j(apply);
  expect(applied).toMatchObject({ status: 'Applied' });

  const token = await approverToken();
  const confirm = await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: token });
  expect(confirm.status).toBe(200);
  expect(await j(confirm)).toMatchObject({ status: 'Confirmed' });
}, 30_000);

run('test_e2e_applyThenReject_reachesRejected (criterion 4: rejection)', async () => {
  const { participantRef, sportEventId } = await seedAndOpen();
  const applied = await j(await post('/o5/registrations', { participantRef, sportEventId, categoria: 'U15' }));
  const token = await approverToken();
  const reject = await post(`/o5/registrations/${applied.registrationId}/reject`, { reason: 'e2e' }, { authorization: token });
  expect(reject.status).toBe(200);
  expect(await j(reject)).toMatchObject({ status: 'Rejected' });
}, 30_000);
