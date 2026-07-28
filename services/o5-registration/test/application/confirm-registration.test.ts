import { test, expect } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { confirmRegistration } from '../../src/application/confirm-registration.js';
import { InMemoryRegistrationRepository, AllowAllAuthorizer, DenyAllAuthorizer } from '../fakes.js';

test('test_confirmRegistration_happyPath', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  const publisher = new RecordingEventPublisher();
  const r = await confirmRegistration({ repo, publisher, authorizer: new AllowAllAuthorizer() })({ registrationId: 'reg-1', approverToken: 't', organizationId: 'org-1' });
  expect(r.status).toBe('Confirmed');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationConfirmed', registrationId: 'reg-1' }));
});

test('test_confirmRegistration_notAuthorized', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', status: 'Applied' });
  await expect(
    confirmRegistration({ repo, publisher: new RecordingEventPublisher(), authorizer: new DenyAllAuthorizer() })({ registrationId: 'reg-1', approverToken: 't', organizationId: 'org-1' }),
  ).rejects.toThrow(DomainError);
});
