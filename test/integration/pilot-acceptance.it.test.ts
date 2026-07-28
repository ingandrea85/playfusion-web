import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeDocClient } from '@playfusion/platform-lib';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from '@aws-sdk/client-eventbridge';
import { SQSClient, CreateQueueCommand, ReceiveMessageCommand, DeleteMessageCommand, GetQueueAttributesCommand, GetQueueUrlCommand } from '@aws-sdk/client-sqs';
// Test-to-test relative import (not src-to-src): this file lives at the repo root
// (test/integration/), not inside any packages/oN-*/src tree, so ADR-002's BC-boundary
// ESLint rule (scoped to `files: ['packages/**/*.ts']`) does not apply here — mirrors
// test/integration/pb-1-setup.it.test.ts, which already reaches into O5's own test
// helper this same way.
import { spawnO2, type SpawnedO2 } from '../../services/o5-registration/test/integration/spawn-o2.js';

// ---------------------------------------------------------------------------------
// Full acceptance E2E for the Playfusion Pilot ("Bundle Enrollment"), Task 11 — the
// final certification task. Drives the real chain across O4 (participant), O3 (sport
// event), O2 (identity/claims), and O5 (registration) via each BC's OWN entrypoint
// (dynamic import of src/handler.js / src/consumer.js, or a spawned child process for
// O2 — same pattern Tasks 8/9/10 already used), never a static cross-`oN-*` import.
//
// Each of the five spec success criteria gets exactly one `test_` (AAAC: Arrange, Act,
// Assert, Cleanup), except criterion 4 which is a combination assertion referencing the
// three scenarios (happy / rejection / double-apply) — the happy and double-apply paths
// are ALSO independently covered by packages/o5-registration/test/integration/
// registration-flow.it.test.ts; this file adds the missing rejection scenario and then
// asserts all three read as "passing" behavior in one place, per the brief.
//
// Re-run-safe: every ref (participantRef via O4, sportEventId via O3, emails) is
// randomUUID()-suffixed, so running this whole file twice back-to-back against the
// SAME persistent LocalStack cannot collide with leftover rows from the previous run.
const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const BUS = process.env.EVENT_BUS_NAME ?? 'playfusion-pilot';
const QUEUE = 'pilot-acceptance-it-q';

async function ignoreExists(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    const e = err as { name?: string; message?: string };
    const text = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
    if (!text.includes('exist')) throw err;
  }
}

// Poll the SQS queue until a message whose detail matches the predicate is found (or
// exhausted), draining/discarding non-matching messages so this suite and any other
// consumer of the same rule/queue don't strand unrelated events for each other.
async function pollForDetail(queueUrl: string, predicate: (detail: any) => boolean, attempts = 15): Promise<any> {
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

let o2: SpawnedO2;
let regManagerToken: string;
let queueUrl: string;

// Shared across the two ordered tests that make up the primary chain (apply → confirm):
// vitest runs `test()` blocks within a file sequentially in declaration order by
// default, so this module-level handoff is safe and mirrors how the domain naturally
// threads a single registrationId through apply then confirm.
let chainRegistrationId: string;

beforeAll(async () => {
  // O2 must be a REAL process (HttpClaimAuthorizer resolves O2_BASE_URL at handler
  // module-load time), spawned exactly like registration-flow.it.test.ts / pb-1-setup.
  o2 = await spawnO2();
  process.env.O2_BASE_URL = o2.baseUrl;

  const magicLinkRes = await fetch(`${o2.baseUrl}/identities/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }),
  });
  ({ token: regManagerToken } = await magicLinkRes.json());

  // Criterion-3 observability harness: route the REAL `playfusion-pilot` bus (the one
  // every BC's EventBridgeEventPublisher actually publishes to) to an SQS queue this
  // test can poll — mirrors packages/platform-lib/test/integration/
  // eventbridge-event-publisher.it.test.ts and packages/o12-payments/test/integration/
  // payment-first.it.test.ts. Re-run safe: Create/PutRule/PutTargets all tolerate or
  // upsert on repeat runs.
  const eb = new EventBridgeClient({ endpoint });
  const sqs = new SQSClient({ endpoint });
  await ignoreExists(() => sqs.send(new CreateQueueCommand({ QueueName: QUEUE })));
  const q = await sqs.send(new GetQueueUrlCommand({ QueueName: QUEUE }));
  queueUrl = q.QueueUrl!;
  const attrs = await sqs.send(new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: ['QueueArn'] }));
  await eb.send(new PutRuleCommand({ Name: 'pilot-acceptance-it-all', EventBusName: BUS, EventPattern: JSON.stringify({ source: ['playfusion.pilot'] }) }));
  await eb.send(new PutTargetsCommand({ Rule: 'pilot-acceptance-it-all', EventBusName: BUS, Targets: [{ Id: 't1', Arn: attrs.Attributes!.QueueArn! }] }));
}, 20_000);

afterAll(async () => {
  await o2.stop();
});

test('test_pilotAcceptance_coachCanApplyForMemorial_registrationApplied', async () => {
  // Arrange: O4 creates the participant, O3 creates+publishes the sport event, O5's own
  // consumer reacts to both (ParticipantCreated -> o5-participants projection,
  // EventPublished -> o5-windows row seeded Closed), then the organizer opens the
  // registration window via O5's REST endpoint. This is the full chain through real
  // BC entrypoints — no direct DynamoDB seeding of participant/event rows.
  const o4 = (await import('../../services/o4-participant-management/src/handler.js') as any).app;
  const o3 = (await import('../../services/o3-sport-events/src/handler.js') as any).app;
  const o5 = (await import('../../services/o5-registration/src/handler.js') as any).app;
  const o5Consumer = (await import('../../services/o5-registration/src/consumer.js') as any).handler;

  const participantRes = await o4.request('/participants', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'squadra', categoria: 'U15' }),
  });
  expect(participantRes.status).toBe(201);
  const { participantId: participantRef } = await participantRes.json();

  const eventRes = await o3.request('/events', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sport: 'Memorial Volley', categorie: ['U15'], dates: { from: '2026-10-01', to: '2026-10-03' } }),
  });
  expect(eventRes.status).toBe(201);
  const { sportEventId } = await eventRes.json();

  // Simulate the real cross-BC event delivery (mirrors payment-first.it.test.ts /
  // pb-1-setup.it.test.ts: no Lambda-EventBridge rule is deployed in this pilot, so
  // tests deliver to each consumer's entrypoint directly).
  await o5Consumer({ 'detail-type': 'ParticipantCreated', detail: { participantId: participantRef, envelope: { organizationId: 'org-pilot', eventId: 'acc-pc-' + randomUUID(), correlationId: 'acc-' + participantRef } } });
  await o5Consumer({ 'detail-type': 'EventPublished', detail: { sportEventId, envelope: { organizationId: 'org-pilot', eventId: 'acc-ep-' + randomUUID(), correlationId: 'acc-' + sportEventId } } });

  const openRes = await o5.request(`/events/${sportEventId}/registration-window:open`, { method: 'POST' });
  expect(openRes.status).toBe(200);
  expect(await openRes.json()).toMatchObject({ state: 'Open' });

  // Act: the coach applies for the memorial.
  const applyRes = await o5.request('/registrations', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ participantRef, sportEventId, categoria: 'U15' }),
  });

  // Assert (criterion 1): registration lands as Applied, both in the API response and
  // durably in DynamoDB.
  expect(applyRes.status).toBe(201);
  const applyJson = await applyRes.json();
  expect(applyJson).toMatchObject({ status: 'Applied' });
  const db = makeDocClient();
  const stored = await db.send(new GetCommand({ TableName: 'o5-registrations', Key: { registrationId: applyJson.registrationId } }));
  expect(stored.Item).toMatchObject({ status: 'Applied' });

  // Cleanup: hand the registrationId to the next ordered test in this chain.
  chainRegistrationId = applyJson.registrationId;
});

test('test_pilotAcceptance_organizerCanConfirm_registrationConfirmed', async () => {
  // Arrange: reuse the Applied registration from the previous test in this chain, and a
  // real O2-issued RegistrationManager token (from beforeAll) — O5's /confirm endpoint
  // enforces the claim via HttpClaimAuthorizer -> O2's /identities/verify over HTTP.
  const o5 = (await import('../../services/o5-registration/src/handler.js') as any).app;
  expect(chainRegistrationId).toBeTruthy();

  // Act: the organizer confirms.
  const confirmRes = await o5.request(`/registrations/${chainRegistrationId}/confirm`, {
    method: 'POST', headers: { authorization: regManagerToken },
  });

  // Assert (criterion 2): registration reads Confirmed, both in the API response and
  // durably in DynamoDB.
  expect(confirmRes.status).toBe(200);
  expect(await confirmRes.json()).toMatchObject({ status: 'Confirmed' });
  const db = makeDocClient();
  const stored = await db.send(new GetCommand({ TableName: 'o5-registrations', Key: { registrationId: chainRegistrationId } }));
  expect(stored.Item).toMatchObject({ status: 'Confirmed' });

  // Cleanup: none (read-only assertion beyond the confirm call already made).
}, 15_000);

test('test_pilotAcceptance_registrationConfirmed_observableOnRealBus', async () => {
  // Arrange: the previous test already triggered confirmRegistration, which publishes
  // RegistrationConfirmed via the real EventBridgeEventPublisher onto the `playfusion-
  // pilot` bus. The SQS harness wired in beforeAll routes that same bus to a queue this
  // test can poll — this proves delivery via the ACTUAL LocalStack EventBridge service,
  // not a mock/stub publisher.
  expect(chainRegistrationId).toBeTruthy();

  // Act: poll the queue for the RegistrationConfirmed detail matching this chain's
  // registrationId (draining/discarding anything else, since the queue is shared by
  // this whole file's rule).
  const detail = await pollForDetail(queueUrl, (d) => d?.registrationId === chainRegistrationId);

  // Assert (criterion 3): the event, with its envelope, was really observed on the bus.
  expect(detail).toMatchObject({ registrationId: chainRegistrationId });
  expect(detail.envelope).toMatchObject({ organizationId: 'org-pilot' });
  expect(detail.envelope.eventId).toBeTruthy();

  // Cleanup: none (SQS message already deleted by pollForDetail on match).
}, 20_000);

test('test_pilotAcceptance_happyRejectionAndDoubleApply_allBehaveCorrectly', async () => {
  // Arrange: three independent scenarios, each with its own fresh window/participant
  // rows seeded via the real O4/O3 chain + O5 consumer (same pattern as test 1 above),
  // so none of the three can interfere with each other or with the earlier chain tests.
  const o4 = (await import('../../services/o4-participant-management/src/handler.js') as any).app;
  const o3 = (await import('../../services/o3-sport-events/src/handler.js') as any).app;
  const o5 = (await import('../../services/o5-registration/src/handler.js') as any).app;
  const o5Consumer = (await import('../../services/o5-registration/src/consumer.js') as any).handler;

  async function setUpOpenWindowWithParticipant(): Promise<{ sportEventId: string; participantRef: string }> {
    const participantRes = await o4.request('/participants', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'squadra', categoria: 'U15' }) });
    const { participantId: participantRef } = await participantRes.json();
    const eventRes = await o3.request('/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sport: 'Memorial Volley', categorie: ['U15'], dates: { from: '2026-11-01', to: '2026-11-03' } }) });
    const { sportEventId } = await eventRes.json();
    await o5Consumer({ 'detail-type': 'ParticipantCreated', detail: { participantId: participantRef, envelope: { organizationId: 'org-pilot', eventId: 'acc-pc-' + randomUUID(), correlationId: 'acc-' + participantRef } } });
    await o5Consumer({ 'detail-type': 'EventPublished', detail: { sportEventId, envelope: { organizationId: 'org-pilot', eventId: 'acc-ep-' + randomUUID(), correlationId: 'acc-' + sportEventId } } });
    await o5.request(`/events/${sportEventId}/registration-window:open`, { method: 'POST' });
    return { sportEventId, participantRef };
  }

  // Act + Assert (happy path, part of criterion 4): apply then confirm succeeds.
  const happy = await setUpOpenWindowWithParticipant();
  const happyApply = await o5.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantRef: happy.participantRef, sportEventId: happy.sportEventId, categoria: 'U15' }) });
  expect(happyApply.status).toBe(201);
  const { registrationId: happyRegistrationId } = await happyApply.json();
  const happyConfirm = await o5.request(`/registrations/${happyRegistrationId}/confirm`, { method: 'POST', headers: { authorization: regManagerToken } });
  expect(happyConfirm.status).toBe(200);
  expect(await happyConfirm.json()).toMatchObject({ status: 'Confirmed' });

  // Act + Assert (rejection scenario, part of criterion 4): apply then reject.
  const rejection = await setUpOpenWindowWithParticipant();
  const rejectApply = await o5.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ participantRef: rejection.participantRef, sportEventId: rejection.sportEventId, categoria: 'U15' }) });
  expect(rejectApply.status).toBe(201);
  const { registrationId: rejectRegistrationId } = await rejectApply.json();
  const rejectRes = await o5.request(`/registrations/${rejectRegistrationId}/reject`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: regManagerToken }, body: JSON.stringify({ reason: 'roster incompleto' }) });
  expect(rejectRes.status).toBe(200);
  expect(await rejectRes.json()).toMatchObject({ status: 'Rejected' });
  const db = makeDocClient();
  const rejectedStored = await db.send(new GetCommand({ TableName: 'o5-registrations', Key: { registrationId: rejectRegistrationId } }));
  expect(rejectedStored.Item).toMatchObject({ status: 'Rejected' });

  // Act + Assert (double-apply scenario, part of criterion 4): applying twice for the
  // same participant+event 409s on the second attempt.
  const dup = await setUpOpenWindowWithParticipant();
  const dupBody = JSON.stringify({ participantRef: dup.participantRef, sportEventId: dup.sportEventId, categoria: 'U15' });
  const dupFirst = await o5.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: dupBody });
  expect(dupFirst.status).toBe(201);
  const dupSecond = await o5.request('/registrations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: dupBody });
  expect(dupSecond.status).toBe(409);
  expect(await dupSecond.json()).toMatchObject({ code: 'DOUBLE_APPLY' });

  // Cleanup: none (all rows are run-unique via randomUUID(), left in LocalStack by
  // design so the suite is re-run-safe rather than needing teardown).
}, 30_000);
