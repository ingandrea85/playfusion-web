import { test, expect } from 'vitest';
import { listEvents, getEvent } from '../src/read-model.js';
import { InMemoryEventStore } from './fakes.js';
import type { SportEvent } from '../src/domain.js';

const ev = (id: string, org: string): SportEvent => ({
  sportEventId: id, organizationId: org, sport: 'calcio',
  categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' }, status: 'Published',
});

test('test_listEvents_returnsOnlyEventsForThatOrg', async () => {
  const store = new InMemoryEventStore();
  await store.add(ev('evt-1', 'org-1'));
  await store.add(ev('evt-2', 'org-1'));
  await store.add(ev('evt-3', 'org-2'));
  const res = await listEvents(store)('org-1');
  expect(res.map(e => e.sportEventId).sort()).toEqual(['evt-1', 'evt-2']);
});

test('test_listEvents_dropsInternalOrgId', async () => {
  const store = new InMemoryEventStore();
  await store.add(ev('evt-1', 'org-1'));
  const [row] = await listEvents(store)('org-1');
  expect(row).not.toHaveProperty('organizationId');
  expect(row).toMatchObject({ sportEventId: 'evt-1', categorie: ['U15'] });
});

test('test_listEvents_emptyWhenOrgHasNoEvents', async () => {
  const store = new InMemoryEventStore();
  await store.add(ev('evt-1', 'org-1'));
  expect(await listEvents(store)('org-none')).toEqual([]);
});

test('test_getEvent_returnsDetailWithCategories', async () => {
  const store = new InMemoryEventStore();
  await store.add(ev('evt-1', 'org-1'));
  const res = await getEvent(store)('evt-1');
  expect(res).toMatchObject({ sportEventId: 'evt-1', sport: 'calcio', categorie: ['U15'], status: 'Published' });
  expect(res).not.toHaveProperty('organizationId');
});

test('test_getEvent_undefinedWhenMissing', async () => {
  const store = new InMemoryEventStore();
  expect(await getEvent(store)('missing')).toBeUndefined();
});
