import { test, expect } from 'vitest';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
const { app } = await import('../../src/handler.js') as any;

test('test_createParticipant_persistsAndReturnsParticipantId', async () => {
  const res = await app.request('/participants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'squadra', categoria: 'U15' }) });
  expect(res.status).toBe(201);
  const json = await res.json();
  expect(json).toHaveProperty('participantId');
});
