import { test, expect } from 'vitest';
import { withCorrelation } from '../src/correlation.js';
import { makeEnvelope } from '../src/envelope.js';

test('test_makeEnvelope_stampsCorrelationAndUniqueId', async () => {
  const now = new Date('2027-06-01T10:00:00.000Z');
  const env = await withCorrelation('corr-9', async () => makeEnvelope('org-1', now));
  expect(env).toMatchObject({ organizationId: 'org-1', occurredAt: '2027-06-01T10:00:00.000Z', correlationId: 'corr-9' });
  expect(env.eventId).toMatch(/[0-9a-f-]{36}/);
});
