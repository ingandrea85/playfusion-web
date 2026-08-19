import { test, expect } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { addTeam } from '../../src/application/add-team.js';
import { removeTeam } from '../../src/application/remove-team.js';
import { InMemoryRegistrationRepository } from '../fakes.js';

const cmd = (over: Partial<Parameters<ReturnType<typeof addTeam>>[0]> = {}) =>
  ({ registrationId: 'reg-1', participantRef: 'pref-1', sportEventId: 'evt-1', categoria: 'U15', teamName: 'Aquile', organizationId: 'org-1', ...over });

test('test_addTeam_bornConfirmedWithName_andPublishesConfirmed', async () => {
  const repo = new InMemoryRegistrationRepository();
  const publisher = new RecordingEventPublisher();
  const r = await addTeam({ repo, publisher })(cmd());
  expect(r.status).toBe('Confirmed');
  expect(r.teamName).toBe('Aquile');
  expect(publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationConfirmed', registrationId: 'reg-1' }));
});

test('test_addTeam_trimsName', async () => {
  const repo = new InMemoryRegistrationRepository();
  const r = await addTeam({ repo, publisher: new RecordingEventPublisher() })(cmd({ teamName: '  Volpi  ' }));
  expect(r.teamName).toBe('Volpi');
});

test('test_addTeam_rejectsEmptyName', async () => {
  const repo = new InMemoryRegistrationRepository();
  await expect(addTeam({ repo, publisher: new RecordingEventPublisher() })(cmd({ teamName: '   ' })))
    .rejects.toThrow(DomainError);
});

test('test_addTeam_rejectsDuplicateNamePerCategory_caseInsensitive', async () => {
  const repo = new InMemoryRegistrationRepository();
  const publisher = new RecordingEventPublisher();
  await addTeam({ repo, publisher })(cmd({ registrationId: 'a', participantRef: 'pa', teamName: 'Aquile' }));
  await expect(addTeam({ repo, publisher })(cmd({ registrationId: 'b', participantRef: 'pb', teamName: 'aquile' })))
    .rejects.toThrow(DomainError);
});

test('test_addTeam_sameNameDifferentCategory_ok', async () => {
  const repo = new InMemoryRegistrationRepository();
  const publisher = new RecordingEventPublisher();
  await addTeam({ repo, publisher })(cmd({ registrationId: 'a', participantRef: 'pa', categoria: 'U15', teamName: 'Aquile' }));
  const r = await addTeam({ repo, publisher })(cmd({ registrationId: 'b', participantRef: 'pb', categoria: 'U17', teamName: 'Aquile' }));
  expect(r.categoria).toBe('U17');
});

test('test_removeTeam_deletes', async () => {
  const repo = new InMemoryRegistrationRepository();
  await repo.save({ registrationId: 'reg-1', participantRef: 'p', sportEventId: 'evt-1', categoria: 'U15', status: 'Confirmed', teamName: 'Aquile' });
  await removeTeam({ repo })({ registrationId: 'reg-1' });
  expect(await repo.get('reg-1')).toBeUndefined();
});

test('test_removeTeam_notFound', async () => {
  const repo = new InMemoryRegistrationRepository();
  await expect(removeTeam({ repo })({ registrationId: 'missing' })).rejects.toThrow(DomainError);
});
