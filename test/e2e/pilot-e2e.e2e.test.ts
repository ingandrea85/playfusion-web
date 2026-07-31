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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Some steps are eventually consistent: a participant only lands in O5's local
// directory after O4's ParticipantCreated event flows O4 → EventBridge → o5-consumer.
// Poll the action until it returns the expected status (or time out and return the
// last response so the assertion reports the real failure).
async function postUntil(
  path: string,
  body: unknown,
  expected: number,
  { headers = {}, timeoutMs = 25_000, intervalMs = 500 }: { headers?: Record<string, string>; timeoutMs?: number; intervalMs?: number } = {},
): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) {
    await sleep(intervalMs);
    last = await post(path, body, headers);
  }
  return last;
}

async function seedAndOpen() {
  // O4 owns the participant identity: it assigns the participantId. Use the one it
  // returns as the registration's participantRef (the event carries this same id to O5).
  const participant = await j(await post('/o4/participants', { type: 'atleta', categoria: 'U15' }));
  const participantRef = participant.participantId as string;
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
  // Apply is eventually consistent on the participant directory — poll until it propagates.
  const apply = await postUntil('/o5/registrations', { participantRef, sportEventId, categoria: 'U15' }, 201);
  expect(apply.status).toBe(201);
  const applied = await j(apply);
  expect(applied).toMatchObject({ status: 'Applied' });

  const token = await approverToken();
  const confirm = await post(`/o5/registrations/${applied.registrationId}/confirm`, undefined, { authorization: token });
  expect(confirm.status).toBe(200);
  expect(await j(confirm)).toMatchObject({ status: 'Confirmed' });
}, 40_000);

run('test_e2e_applyThenReject_reachesRejected (criterion 4: rejection)', async () => {
  const { participantRef, sportEventId } = await seedAndOpen();
  const apply = await postUntil('/o5/registrations', { participantRef, sportEventId, categoria: 'U15' }, 201);
  expect(apply.status).toBe(201);
  const applied = await j(apply);

  const token = await approverToken();
  const reject = await post(`/o5/registrations/${applied.registrationId}/reject`, { reason: 'e2e' }, { authorization: token });
  expect(reject.status).toBe(200);
  expect(await j(reject)).toMatchObject({ status: 'Rejected' });
}, 40_000);
