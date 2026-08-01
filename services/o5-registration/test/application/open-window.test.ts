import { test, expect } from 'vitest';
import { RecordingEventPublisher } from '@playfusion/platform-lib';
import { openWindow } from '../../src/application/open-window.js';
import { InMemoryWindowRepository } from '../fakes.js';

test('test_openWindow_persistsPerCategoryCapacities', async () => {
  const windows = new InMemoryWindowRepository();
  const publisher = new RecordingEventPublisher();
  await openWindow({ windows, publisher })({ sportEventId: 'evt-1', organizationId: 'org-1', capacities: { U10: 8, U12: 6 } });
  expect(await windows.get('evt-1')).toMatchObject({ state: 'Open', capacities: { U10: 8, U12: 6 } });
});

test('test_openWindow_opensWithoutCapacitiesWhenNoneGiven', async () => {
  const windows = new InMemoryWindowRepository();
  const publisher = new RecordingEventPublisher();
  await openWindow({ windows, publisher })({ sportEventId: 'evt-1', organizationId: 'org-1' });
  const w = await windows.get('evt-1');
  expect(w?.state).toBe('Open');
  expect(w?.capacities).toBeUndefined();
});
