import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E (S18 · O1 brand): an organizer sets the tenant brand; the public GET returns it;
// getEvent exposes organizationId so the portal can resolve it; reset reverts to default (null).
// Skip-gated on API_BASE_URL. Uses a throwaway org id so it never collides with real tenant data.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const org = `e2e-brand-${randomUUID().slice(0, 8)}`;
const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': org, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
const put = (p: string, b?: unknown, h: Record<string, string> = {}) => req('PUT', p, b, h);
const del = (p: string, h: Record<string, string> = {}) => req('DELETE', p, undefined, h);
async function token(roles: string[]): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles }))).token as string;
}

run('test_e2e_brand_setGetReset', async () => {
  const auth = await token(['RegistrationManager']);

  // no brand yet → null
  expect(await j(await get(`/o1/organizations/${org}/brand`))).toBeNull();

  // set brand
  const brand = { logoText: 'Acme Cup', primaryColor: '#0b5fff', accentColor: '#ff6b00' };
  const saved = await j(await put(`/o1/organizations/${org}/brand`, brand, { authorization: auth }));
  expect(saved).toEqual(brand);

  // public read returns it
  expect(await j(await get(`/o1/organizations/${org}/brand`))).toEqual(brand);

  // an event created under this org exposes organizationId (so the portal can resolve the brand)
  const eventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10'], dates: { from: '2026-09-01', to: '2026-09-02' } }, { authorization: auth }))).sportEventId as string;
  const ev = await j(await get(`/o3/events/${eventId}`));
  expect(ev.organizationId).toBe(org);

  // reset → default (null)
  const d = await del(`/o1/organizations/${org}/brand`, { authorization: auth });
  expect(d.status).toBe(204);
  expect(await j(await get(`/o1/organizations/${org}/brand`))).toBeNull();
}, 120_000);
