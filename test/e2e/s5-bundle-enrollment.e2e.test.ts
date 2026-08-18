import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// S5.4 — acceptance E2E for the E1<->E3 Bundle Enrollment loop against a REAL deployed
// environment (stg on AWS). Skip-gated on API_BASE_URL, so `npm test`/CI stay green.
// Run it with:
//   API_BASE_URL=<deployed-url> npm run test:e2e
// Exercises the exact REST endpoints the E1 (organizer) and E3 (public/coach) SPAs call:
//   create event -> open registrations -> coach applies (E3) -> appears in inbox (E1)
//   -> confirm + fee paid -> shows in the public confirmed participants list (E3).
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll a POST until it returns the expected status (steps like apply and fee projection are
 *  eventually consistent), returning the last response so a failed assertion reports the truth. */
async function postUntil(path: string, body: unknown, expected: number, { headers = {}, timeoutMs = 25_000, intervalMs = 500 }: { headers?: Record<string, string>; timeoutMs?: number; intervalMs?: number } = {}): Promise<Response> {
  const deadline = Date.now() + timeoutMs;
  let last = await post(path, body, headers);
  while (last.status !== expected && Date.now() < deadline) { await sleep(intervalMs); last = await post(path, body, headers); }
  return last;
}

/** Poll a read until predicate holds (e.g. the fee row appears after RegistrationApplied). */
async function getUntil(path: string, ok: (rows: any) => boolean, { headers = {}, timeoutMs = 25_000, intervalMs = 500 }: { headers?: Record<string, string>; timeoutMs?: number; intervalMs?: number } = {}): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  let rows = await j(await get(path, headers));
  while (!ok(rows) && Date.now() < deadline) { await sleep(intervalMs); rows = await j(await get(path, headers)); }
  return rows;
}

async function organizerToken(): Promise<string> {
  const res = await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }));
  return res.token as string;
}
async function coachToken(): Promise<string> {
  const res = await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles: ['coach'], purpose: 'coach-enrollment' }));
  return res.token as string;
}

run('test_e2e_bundleEnrollment_e1e3_fullLoop', async () => {
  const org = await organizerToken();

  // O4 owns participant identity; use the id it assigns as the registration's participantRef.
  const participant = await j(await post('/o4/participants', { type: 'squadra', categoria: 'U15' }));
  const participantRef = participant.participantId as string;

  // E1: organizer creates the event and opens the registration window.
  const evt = await j(await post('/o3/events', { sport: 'Basket', categorie: ['U15'], dates: { from: '2026-09-01', to: '2026-09-30' } }, { authorization: org }));
  const sportEventId = evt.sportEventId as string;
  await post(`/o5/events/${sportEventId}/registration-window:open`, undefined, { authorization: org });

  // E3: coach applies via magic-link. Eventually consistent on the participant directory.
  const applyRes = await postUntil('/o5/registrations', { participantRef, sportEventId, categoria: 'U15' }, 201, { headers: { authorization: await coachToken() } });
  expect(applyRes.status).toBe(201);
  const applied = await j(applyRes);
  expect(applied).toMatchObject({ status: 'Applied' });
  const registrationId = applied.registrationId as string;

  // E1 inbox: the applied team shows in the Applied list (organizer view).
  const inbox = await j(await get(`/o5/events/${sportEventId}/registrations?state=Applied`, { authorization: org }));
  expect(inbox.some((r: any) => r.registrationId === registrationId)).toBe(true);

  // E1: organizer confirms.
  const confirm = await post(`/o5/registrations/${registrationId}/confirm`, undefined, { authorization: org });
  expect(confirm.status).toBe(200);
  expect(await j(confirm)).toMatchObject({ status: 'Confirmed' });

  // Fee: O12 projects a fee row from RegistrationApplied; wait for it, then mark paid.
  await getUntil(`/o12/events/${sportEventId}/fees`, (rows) => Array.isArray(rows) && rows.some((f: any) => f.registrationId === registrationId), { headers: { authorization: org } });
  const pay = await post(`/o12/payments/${registrationId}/pay`, undefined, { authorization: org });
  expect(pay.status).toBe(200);
  const fees = await j(await get(`/o12/events/${sportEventId}/fees`, { authorization: org }));
  expect(fees.find((f: any) => f.registrationId === registrationId)?.status).toBe('Paid');

  // E3 public participants: the confirmed team is publicly visible.
  const publicList = await getUntil(`/o5/events/${sportEventId}/registrations?state=Confirmed`, (rows) => Array.isArray(rows) && rows.some((r: any) => r.registrationId === registrationId));
  expect(publicList.some((r: any) => r.registrationId === registrationId && r.status === 'Confirmed')).toBe(true);
}, 60_000);
