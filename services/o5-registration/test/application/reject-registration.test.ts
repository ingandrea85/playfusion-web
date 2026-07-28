import { test, expect } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { rejectRegistration } from '../../src/application/reject-registration.js';
import { InMemoryRegistrationRepository, AllowAllAuthorizer, DenyAllAuthorizer } from '../fakes.js';

test('test_rejectRegistration_happyPath', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  const publisher = new RecordingEventPublisher();
  const r = await rejectRegistration({ repo, publisher, authorizer: new AllowAllAuthorizer() })({ registrationId: 'reg-1', reason: 'roster incompleto', approverToken: 't', organizationId: 'org-1' });
  expect(r.status).toBe('Rejected');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationRejected', registrationId: 'reg-1' }));
});

test('test_rejectRegistration_notAuthorized', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  await expect(
    rejectRegistration({ repo, publisher: new RecordingEventPublisher(), authorizer: new DenyAllAuthorizer() })({ registrationId: 'reg-1', reason: 'late', approverToken: 't', organizationId: 'org-1' }),
  ).rejects.toThrow(DomainError);
});
