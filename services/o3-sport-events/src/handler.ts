import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError, busName, resourceName } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbEventStore } from './adapters/dynamodb-event-store.js';
import { listEvents, getEvent } from './read-model.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const store = new DynamoDbEventStore(db);
const app = new Hono();
const orgOf = (c: any) => c.req.header('x-organization-id') ?? 'org-pilot';
const body = z.object({ sport: z.string(), categorie: z.array(z.string()), dates: z.object({ from: z.string(), to: z.string() }) });

app.post('/events', async (c) => {
  const b = body.parse(await c.req.json());
  const sportEventId = randomUUID();
  const organizationId = orgOf(c);
  await db.send(new PutCommand({ TableName: resourceName('o3-events'), Item: { sportEventId, organizationId, ...b, status: 'Published' } }));
  await publisher.publish('EventPublished', { sportEventId, sport: b.sport, categorie: b.categorie, dates: b.dates }, organizationId);
  return c.json({ sportEventId, status: 'Published' }, 201);
});

// S1.2 reads: list per org (E1 dashboard / E3 landing) and event detail + categories.
app.get('/events', async (c) => c.json(await listEvents(store)(orgOf(c))));
app.get('/events/:id', async (c) => {
  const detail = await getEvent(store)(c.req.param('id'));
  if (!detail) return c.json({ error: 'EventNotFound', sportEventId: c.req.param('id') }, 404);
  return c.json(detail);
});

app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o3/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
