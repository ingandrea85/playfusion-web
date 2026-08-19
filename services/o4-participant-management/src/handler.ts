import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from 'hono/aws-lambda';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError, busName, resourceName } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const app = new Hono();
// Actual (non-preflight) responses need CORS headers too: API Gateway's
// defaultCorsPreflightOptions only answers OPTIONS, so browsers block GET/POST replies
// unless the Lambda sets Access-Control-Allow-Origin itself.
app.use('*', cors({ origin: '*', allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'], allowMethods: ['GET', 'POST', 'PUT', 'OPTIONS'] }));
const body = z.object({ type: z.enum(['squadra', 'atleta']), categoria: z.string() });

app.post('/participants', async (c) => {
  const b = body.parse(await c.req.json());
  const participantId = randomUUID();
  await db.send(new PutCommand({ TableName: resourceName('o4-participants'), Item: { participantId, ...b } }));
  await publisher.publish('ParticipantCreated', { participantId, type: b.type, categoria: b.categoria }, c.req.header('x-organization-id') ?? 'org-pilot');
  return c.json({ participantId }, 201);
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o4/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
