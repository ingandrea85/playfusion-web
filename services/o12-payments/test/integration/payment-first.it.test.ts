import { test, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
import { makeDocClient, resourceName, busName, EVENT_SOURCE, signMagicLink } from '@playfusion/platform-lib';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, CreateQueueCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
const o5 = (await import('../../../o5-registration/src/handler.js') as any).app;
const o5Consumer = (await import('../../../o5-registration/src/consumer.js') as any).handler;
const o12Consumer = (await import('../../src/consumer.js') as any).handler;
const o12 = (await import('../../src/handler.js') as any).app;

// Criterion 3 observability harness: route the derived bus (the one
// O5's consumer/publisher actually uses) to an SQS queue we can poll, mirroring
// packages/platform-lib/test/integration/eventbridge-event-publisher.it.test.ts.
// Re-run safe: CreateQueue/PutRule/PutTargets all tolerate/upsert on repeat runs.
const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const BUS = busName();
const QUEUE = 'o12-payment-first-it-q';

async function ignoreExists(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const text = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
    if (!text.includes('exist')) throw err;
  }
}

// Unique refs per run: a persistent LocalStack must not collide with a previous run's
// rows (double-apply guard / idempotency store would otherwise fire spuriously).
const sportEventId = 'evt-e2e-' + randomUUID();
const participantRef = 'team-e2e-' + randomUUID();

let queueUrl: string;

beforeAll(async () => {
  const db = makeDocClient();
  await db.send(new PutCommand({ TableName: resourceName('o5-windows'), Item: { sportEventId, state: 'Open' } }));
  await db.send(new PutCommand({ TableName: resourceName('o5-participants'), Item: { participantRef } }));

  const eb = new EventBridgeClient({ endpoint });
  const sqs = new SQSClient({ endpoint });
  await ignoreExists(() => sqs.send(new CreateQueueCommand({ QueueName: QUEUE })));
  const q = await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE }));
  queueUrl = q.QueueUrl!;
  const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }));
  await eb.send(new PutRuleCommand({ Name: 'o12-payment-first-it-all', EventBusName: BUS, EventPattern: JSON.stringify({ source: [EVENT_SOURCE] }) }));
  await eb.send(new PutTargetsCommand({ Rule: 'o12-payment-first-it-all', EventBusName: BUS, Targets: [{ Id: 't1', Arn: attrs.Attributes!.QueueArn! }] }));
}, 20_000);

// Poll the SQS queue until a message whose detail matches the predicate is found (or
// timeout), draining/discarding non-matching messages so back-to-back runs and other
// tests sharing the same rule/queue don't strand unrelated events in the way.
async function pollForDetail(predicate: (detail: any) => boolean, attempts = 15): Promise<any> {
  const sqs = new SQSClient({ endpoint });
  for (let i = 0; i < attempts; i++) {
    const msgs = await sqs.send(new ReceiveMessageCommand({ QueueUrl: queueUrl, WaitTimeSeconds: 2, MaxNumberOfMessages: 10 }));
    for (const m of msgs.Messages ?? []) {
      const detail = JSON.parse(m.Body!).detail;
      await sqs.send(new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: m.ReceiptHandle! }));
      if (predicate(detail)) return detail;
    }
  }
  return undefined;
}

test('test_paymentFirst_autoConfirmsOnFeePaid', async () => {
  // apply
  const applyRes = await o5.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json', authorization: signMagicLink({ subject: 'it-coach', roles: ['coach'] }) }, body: JSON.stringify({ participantRef, sportEventId, categoria: 'U15' }) });
  const { registrationId } = await applyRes.json();
  // O12 reacts to RegistrationApplied (simulated delivery of the event to the consumer)
  await o12Consumer({ 'detail-type': 'RegistrationApplied', detail: { registrationId, participantRef, envelope: { organizationId: 'org-pilot', eventId: 'e1-' + randomUUID(), correlationId: 'c1' } } });
  // pay → ParticipationFeePaid
  await o12.request(`/payments/${registrationId}/pay`, { method: 'POST' });
  // O5 consumer reacts to ParticipationFeePaid → auto-confirm (NO O2 authorizer token: this
  // is an internal event reaction via the consumer, not the REST /confirm endpoint, so it
  // bypasses the RegistrationManager claim check that guards the REST path).
  await o5Consumer({ 'detail-type': 'ParticipationFeePaid', detail: { registrationId, envelope: { organizationId: 'org-pilot', eventId: 'e2-' + randomUUID(), correlationId: 'c1' } } });

  const db = makeDocClient();
  const stored = await db.send(new GetCommand({ TableName: resourceName('o5-registrations'), Key: { registrationId } }));
  expect(stored.Item).toMatchObject({ status: 'Confirmed' });

  // Criterion 3: RegistrationConfirmed must be observable on the REAL bus (not just in
  // DynamoDB), delivered by the real EventBridgeEventPublisher inside onFeePaid.
  const detail = await pollForDetail((d) => d?.registrationId === registrationId);
  expect(detail).toMatchObject({ registrationId });
  expect(detail.envelope).toMatchObject({ organizationId: 'org-pilot' });
  expect(detail.envelope.eventId).toBeTruthy();
}, 30_000);

test('test_o5Consumer_isIdempotentOnDuplicateFeePaid', async () => {
  // delivering the same ParticipationFeePaid (same eventId) twice must not throw / double-apply
  const evt = { 'detail-type': 'ParticipationFeePaid', detail: { registrationId: 'noop', envelope: { organizationId: 'org-pilot', eventId: 'dup-' + randomUUID(), correlationId: 'c' } } };
  await o5Consumer(evt);
  await expect(o5Consumer(evt)).resolves.toBeUndefined();
});
