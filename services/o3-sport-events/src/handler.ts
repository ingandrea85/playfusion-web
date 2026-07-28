import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(process.env.EVENT_BUS_NAME ?? 'playfusion-pilot');
const app = new Hono();
const body = z.object({ sport: z.string(), categorie: z.array(z.string()), dates: z.object({ from: z.string(), to: z.string() }) });

app.post('/events', async (c) => {
  const b = body.parse(await c.req.json());
  const sportEventId = randomUUID();
  await db.send(new PutCommand({ TableName: 'o3-events', Item: { sportEventId, ...b, status: 'Published' } }));
  await publisher.publish('EventPublished', { sportEventId, sport: b.sport, categorie: b.categorie, dates: b.dates }, c.req.header('x-organization-id') ?? 'org-pilot');
  return c.json({ sportEventId, status: 'Published' }, 201);
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
