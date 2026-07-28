import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(process.env.EVENT_BUS_NAME ?? 'playfusion-pilot');
const app = new Hono();
const body = z.object({ type: z.enum(['squadra', 'atleta']), categoria: z.string() });

app.post('/participants', async (c) => {
  const b = body.parse(await c.req.json());
  const participantId = randomUUID();
  await db.send(new PutCommand({ TableName: 'o4-participants', Item: { participantId, ...b } }));
  await publisher.publish('ParticipantCreated', { participantId, type: b.type, categoria: b.categoria }, c.req.header('x-organization-id') ?? 'org-pilot');
  return c.json({ participantId }, 201);
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
