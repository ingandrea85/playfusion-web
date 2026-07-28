import { test, expect, beforeAll } from 'vitest';
import { EventBridgeClient, CreateEventBusCommand, PutRuleCommand, PutTargetsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, CreateQueueCommand, ReceiveMessageCommand, GetQueueAttributesCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
import { EventBridgeEventPublisher } from '../../src/eventbridge-event-publisher.js';
import { EVENT_SOURCE } from '../../src/naming.js';

// Observability harness: route the bus to an SQS queue we can poll, so the test can
// assert the event was really delivered by the emulated bus (not a mock).
const BUS = 'pf-eb-it';
const QUEUE = 'pf-eb-it-q';
const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';

// Re-run safety: the integration stack persists across test runs (Tasks 4-9 + CI
// re-run against a live LocalStack), so setup must tolerate pre-existing resources.
// Mirrors the provisioning `ignoreExists` pattern: swallow "already exists" errors,
// rethrow everything else. PutRule/PutTargets already upsert, so only the bus and
// queue creates need guarding.
async function ignoreExists(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const text = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
    if (!text.includes('exist')) throw err;
  }
}

test('test_eventBridgePublisher_deliversEventWithEnvelopeToBus', async () => {
  const eb = new EventBridgeClient({ endpoint });
  const sqs = new SQSClient({ endpoint });
  await ignoreExists(() => eb.send(new CreateEventBusCommand({ Name: BUS })));
  await ignoreExists(() => sqs.send(new CreateQueueCommand({ QueueName: QUEUE })));
  const q = await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE }));
  const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: q.QueueUrl!, AttributeNames: ['QueueArn'] }));
  await eb.send(new PutRuleCommand({ Name: 'all', EventBusName: BUS, EventPattern: JSON.stringify({ source: [EVENT_SOURCE] }) }));
  await eb.send(new PutTargetsCommand({ Rule: 'all', EventBusName: BUS, Targets: [{ Id: 't1', Arn: attrs.Attributes!.QueueArn! }] }));

  const publisher = new EventBridgeEventPublisher(BUS, eb);
  await publisher.publish('RegistrationConfirmed', { registrationId: 'reg-it-1' }, 'org-it');

  // poll
  let detail: any;
  for (let i = 0; i < 10 && !detail; i++) {
    const msgs = await sqs.send(new ReceiveMessageCommand({ QueueUrl: q.QueueUrl!, WaitTimeSeconds: 2, MaxNumberOfMessages: 1 }));
    if (msgs.Messages?.length) detail = JSON.parse(msgs.Messages[0].Body!).detail;
  }
  expect(detail).toMatchObject({ registrationId: 'reg-it-1' });
  expect(detail.envelope).toMatchObject({ organizationId: 'org-it' });
  expect(detail.envelope.eventId).toBeTruthy();
});
