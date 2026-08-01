import { test, expect } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { confirmRegistration } from '../../src/application/confirm-registration.js';
import { InMemoryRegistrationRepository } from '../fakes.js';

// Authorization moved to the requireOrganizer middleware (S2.4); this use-case only owns
// the state transition + event, so the tests cover those.
test('test_confirmRegistration_happyPath', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  const publisher = new RecordingEventPublisher();
  const r = await confirmRegistration({ repo, publisher })({ registrationId: 'reg-1', organizationId: 'org-1' });
  expect(r.status).toBe('Confirmed');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationConfirmed', registrationId: 'reg-1' }));
});

test('test_confirmRegistration_alreadyResolvedRejected', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Confirmed' });
  await expect(confirmRegistration({ repo, publisher: new RecordingEventPublisher() })({ registrationId: 'reg-1', organizationId: 'org-1' }))
    .rejects.toThrow(DomainError);
});

test('test_confirmRegistration_notFoundRejected', async () => {
  const repo = new InMemoryRegistrationRepository();
  await expect(confirmRegistration({ repo, publisher: new RecordingEventPublisher() })({ registrationId: 'missing', organizationId: 'org-1' }))
    .rejects.toThrow(DomainError);
});
