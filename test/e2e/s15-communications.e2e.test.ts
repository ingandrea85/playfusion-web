import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E (S15 · O9 communications): an organizer publishes announcements (event-wide and
// category-scoped); the public GET returns them pinned-first; delete removes one. Skip-gated on API_BASE_URL.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': 'org-pilot', ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
const del = (p: string, h: Record<string, string> = {}) => req('DELETE', p, undefined, h);
async function token(roles: string[], purpose?: string): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles, purpose }))).token as string;
}

run('test_e2e_communications_publishListDelete', async () => {
  const org = await token(['RegistrationManager']);
  const sportEventId = (await j(await post('/o3/events', { sport: 'Calcio', categorie: ['U10', 'U12'], dates: { from: '2026-09-01', to: '2026-09-02' } }, { authorization: org }))).sportEventId as string;

  // event-wide (categoryId null), then a pinned category-scoped one
  const wide = await j(await post(`/o9/events/${sportEventId}/announcements`, { title: 'Benvenuti', body: 'Il torneo inizia alle 9.' }, { authorization: org }));
  await post(`/o9/events/${sportEventId}/announcements`, { categoryId: 'U10', title: 'Cambio campo', body: 'U10 gioca sul Campo B', pinned: true }, { authorization: org });

  // public read: two announcements, pinned first
  const list = await j(await get(`/o9/events/${sportEventId}/announcements`));
  expect(list).toHaveLength(2);
  expect(list[0].pinned).toBe(true);
  expect(list[0].categoryId).toBe('U10');
  expect(list.some((a: any) => a.categoryId === null && a.title === 'Benvenuti')).toBe(true);

  // delete the event-wide one → only the scoped one remains
  const d = await del(`/o9/announcements/${wide.announcementId}`, { authorization: org });
  expect(d.status).toBe(204);
  const after = await j(await get(`/o9/events/${sportEventId}/announcements`));
  expect(after).toHaveLength(1);
  expect(after[0].title).toBe('Cambio campo');
}, 120_000);
