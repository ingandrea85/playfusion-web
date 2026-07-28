import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError } from '@playfusion/platform-lib';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(process.env.EVENT_BUS_NAME ?? 'playfusion-pilot');
const app = new Hono();

app.post('/payments/:registrationId/pay', async (c) => {
  const registrationId = c.req.param('registrationId');
  const paymentRef = randomUUID();
  await db.send(new UpdateCommand({ TableName: 'o12-fees', Key: { registrationId }, UpdateExpression: 'SET #s = :s, paymentRef = :p', ExpressionAttributeNames: { '#s': 'status' }, ExpressionAttributeValues: { ':s': 'Paid', ':p': paymentRef } }));
  await publisher.publish('ParticipationFeePaid', { registrationId, paidAt: new Date().toISOString(), paymentRef }, c.req.header('x-organization-id') ?? 'org-pilot');
  return c.json({ registrationId, status: 'Paid', paymentRef });
});
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
