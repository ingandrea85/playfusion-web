import { test, expect } from 'vitest';
import { RecordingEventPublisher } from '../src/recording-event-publisher.js';

test('test_recordingPublisher_recordsNameAndFlattenedPayload', async () => {
  const pub = new RecordingEventPublisher();
  await pub.publish('RegistrationConfirmed', { registrationId: 'reg-1' }, 'org-1');
  expect(pub.published).toContainEqual(expect.objectContaining({ name: 'RegistrationConfirmed', registrationId: 'reg-1' }));
});
