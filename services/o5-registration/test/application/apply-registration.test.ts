import { test, expect, beforeEach } from 'vitest';
import { RecordingEventPublisher, DomainError } from '@playfusion/platform-lib';
import { applyRegistration } from '../../src/application/apply-registration.js';
import { InMemoryRegistrationRepository, InMemoryWindowRepository, InMemoryParticipantDirectory } from '../fakes.js';

function deps() {
  const repo = new InMemoryRegistrationRepository();
  const windows = new InMemoryWindowRepository();
  const participants = new InMemoryParticipantDirectory();
  const publisher = new RecordingEventPublisher();
  return { repo, windows, participants, publisher };
}
const cmd = { registrationId: 'reg-1', participantRef: 'team-7', sportEventId: 'evt-1', categoria: 'U15', organizationId: 'org-1' };

test('test_applyRegistration_happyPath', async () => {
  const d = deps();
  await d.windows.save({ sportEventId: 'evt-1', state: 'Open' });
  await d.participants.add('team-7');
  const r = await applyRegistration(d)(cmd);
  expect(r.status).toBe('Applied');
  expect(d.publisher.published).toContainEqual(expect.objectContaining({ name: 'RegistrationApplied', registrationId: 'reg-1' }));
});

test('test_applyRegistration_eventClosed', async () => {
  const d = deps();
  await d.windows.save({ sportEventId: 'evt-1', state: 'Closed' });
  await d.participants.add('team-7');
  await expect(applyRegistration(d)(cmd)).rejects.toThrow(DomainError);
});

test('test_applyRegistration_selfEnrollsUnknownParticipant', async () => {
  // Coach self-enrollment: an unknown team is registered on the fly and applied (matches the
  // open public form; the token gate + organizer confirm/reject are the guardrails).
  const d = deps();
  await d.windows.save({ sportEventId: 'evt-1', state: 'Open' });
  const r = await applyRegistration(d)(cmd);
  expect(r.status).toBe('Applied');
  expect(await d.participants.exists('team-7')).toBe(true);
});

test('test_applyRegistration_doubleApply', async () => {
  const d = deps();
  await d.windows.save({ sportEventId: 'evt-1', state: 'Open' });
  await d.participants.add('team-7');
  await applyRegistration(d)(cmd);
  await expect(applyRegistration(d)({ ...cmd, registrationId: 'reg-2' })).rejects.toThrow(DomainError);
});
