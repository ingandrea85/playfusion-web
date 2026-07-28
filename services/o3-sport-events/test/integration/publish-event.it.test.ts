import { test, expect } from 'vitest';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566'; process.env.EVENT_BUS_NAME = 'playfusion-pilot';
const { app } = await import('../../src/handler.js') as any;

test('test_publishEvent_persistsAndReturnsPublished', async () => {
  const res = await app.request('/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport: 'calcio', categorie: ['U15'], dates: { from: '2027-06-01', to: '2027-06-03' } }) });
  expect(res.status).toBe(201);
  expect(await res.json()).toMatchObject({ status: 'Published' });
});
