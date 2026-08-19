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

import { verifyMagicLink } from '@playfusion/platform-lib';
import { getEnrollToken } from '../../src/application/get-enroll-token.js';

test('test_openWindow_mintsACoachEnrollmentTokenReturnedAndPersisted', async () => {
  const windows = new InMemoryWindowRepository();
  const publisher = new RecordingEventPublisher();
  const opened = await openWindow({ windows, publisher })({ sportEventId: 'evt-1', organizationId: 'org-1' });
  expect(opened.enrollToken).toBeTruthy();
  // A valid coach magic-link (verifiable via the shared kernel that requireMagicLink uses).
  const identity = verifyMagicLink(opened.enrollToken!, { purpose: 'coach-enrollment' });
  expect(identity?.roles).toContain('coach');
  // Persisted + readable by the organizer-only read.
  expect((await getEnrollToken({ windows })('evt-1')).enrollToken).toBe(opened.enrollToken);
});

test('test_openWindow_keepsTheSameEnrollTokenAcrossReopen', async () => {
  const windows = new InMemoryWindowRepository();
  const publisher = new RecordingEventPublisher();
  const first = await openWindow({ windows, publisher })({ sportEventId: 'evt-1', organizationId: 'org-1' });
  const second = await openWindow({ windows, publisher })({ sportEventId: 'evt-1', organizationId: 'org-1', capacities: { U10: 4 } });
  expect(second.enrollToken).toBe(first.enrollToken); // stable link
});

test('test_getEnrollToken_undefinedBeforeAnyOpen', async () => {
  const windows = new InMemoryWindowRepository();
  expect((await getEnrollToken({ windows })('evt-x')).enrollToken).toBeUndefined();
});
