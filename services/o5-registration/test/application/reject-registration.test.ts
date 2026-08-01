import { test, expect } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { rejectRegistration } from '../../src/application/reject-registration.js';
import { InMemoryRegistrationRepository } from '../fakes.js';

// Authorization moved to the requireOrganizer middleware (S2.4).
test('test_rejectRegistration_happyPath', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  const publisher = new RecordingEventPublisher();
  const r = await rejectRegistration({ repo, publisher })({ registrationId: 'reg-1', reason: 'roster incompleto', organizationId: 'org-1' });
  expect(r.status).toBe('Rejected');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationRejected', registrationId: 'reg-1' }));
});

test('test_rejectRegistration_alreadyResolvedRejected', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Rejected' });
  await expect(rejectRegistration({ repo, publisher: new RecordingEventPublisher() })({ registrationId: 'reg-1', reason: 'late', organizationId: 'org-1' }))
    .rejects.toThrow(DomainError);
});
