import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { randomUUID } from 'node:crypto';
import { withCorrelation, makeDocClient, EventBridgeEventPublisher, toHttpError, busName, resourceName } from '@playfusion/platform-lib';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDbFeeStore } from './adapters/dynamodb-fee-store.js';
import { listFees } from './read-model.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());
const app = new Hono();
const feeStore = new DynamoDbFeeStore(db);

app.post('/payments/:registrationId/pay', async (c) => {
  const registrationId = c.req.param('registrationId');
  const paymentRef = randomUUID();
  await db.send(new UpdateCommand({ TableName: resourceName('o12-fees'), Key: { registrationId }, UpdateExpression: 'SET #s = :s, paymentRef = :p', ExpressionAttributeNames: { '#s': 'status' }, ExpressionAttributeValues: { ':s': 'Paid', ':p': paymentRef } }));
  await publisher.publish('ParticipationFeePaid', { registrationId, paidAt: new Date().toISOString(), paymentRef }, c.req.header('x-organization-id') ?? 'org-pilot');
  return c.json({ registrationId, status: 'Paid', paymentRef });
});
// S4: fee status per event (read side). Public projection [{registrationId,status}].
app.get('/events/:id/fees', async (c) => c.json(await listFees(feeStore)(c.req.param('id'))));
app.onError((err, c) => { const e = toHttpError(err); return c.json(JSON.parse(e.body), e.statusCode as any); });

export { app };
const inner = handle(app);
export const handler = (event: any, ctx: any) => {
  // API Gateway mounts this BC at /o12/{proxy+}; route on the proxied sub-path only.
  if (event?.pathParameters?.proxy != null) event.path = `/${event.pathParameters.proxy}`;
  return withCorrelation(event.headers?.['x-correlation-id'] ?? randomUUID(), () => inner(event, ctx));
};
