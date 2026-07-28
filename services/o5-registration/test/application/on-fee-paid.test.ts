import { test, expect } from 'vitest';
import { RecordingEventPublisher } from '@playfusion/platform-lib';
import { onFeePaid } from '../../src/application/on-fee-paid.js';
import { InMemoryRegistrationRepository } from '../fakes.js';

test('test_onFeePaid_autoConfirmsAppliedRegistration', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  const publisher = new RecordingEventPublisher();
  await onFeePaid({ repo, publisher })({ registrationId: 'reg-1', organizationId: 'org-1' });
  const updated = await repo.get('reg-1');
  expect(updated?.status).toBe('Confirmed');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationConfirmed', registrationId: 'reg-1' }));
});

test('test_onFeePaid_idempotentWhenAlreadyConfirmed', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Confirmed' });
  const publisher = new RecordingEventPublisher();
  await onFeePaid({ repo, publisher })({ registrationId: 'reg-1', organizationId: 'org-1' });
  expect(publisher.published).toHaveLength(0);
});

test('test_onFeePaid_skipsUnknownRegistration', async () => {
  const repo = new InMemoryRegistrationRepository();
  const publisher = new RecordingEventPublisher();
  await onFeePaid({ repo, publisher })({ registrationId: 'missing', organizationId: 'org-1' });
  expect(publisher.published).toHaveLength(0);
});
