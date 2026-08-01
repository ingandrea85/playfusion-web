import { test, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { makeDocClient, resourceName, signMagicLink } from '@playfusion/platform-lib';
import { PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
// Test-to-test relative import (not src-to-src), so ADR-002's BC-boundary ESLint rule
// (scoped to `files: ['packages/**/*.ts']`) does not apply here — this mirrors how
// packages/o12-payments/test/integration/payment-first.it.test.ts already reaches into
// another BC's package from its own test dir.
import { spawnO2, type SpawnedO2 } from '../../services/o5-registration/test/integration/spawn-o2.js';
import { runPb1Setup } from '../../workflow/pb-1-orchestrator.js';

// This test exercises PB-1 "Bundle Enrollment" Setup steps 1-6 end-to-end via the L2
// orchestrator (workflow/pb-1-orchestrator.ts), the fallback execution engine for
// workflow/pb-1-setup.asl.json (see that file's + provision.ts's header comments for the
// decision-4 rationale: Step Functions has no reachable compute target to invoke the
// automatic Task states against in this pilot's architecture).
//
// The orchestrator only SEQUENCES + WAITS/POLLS; it never itself creates the domain
// events that resume its "wait" steps. This test plays the role of "the real world":
// it independently calls O5's apply endpoint (the actual trigger for RegistrationApplied)
// and O12's pay endpoint + delivers ParticipationFeePaid to O5's consumer (mirroring
// packages/o12-payments/test/integration/payment-first.it.test.ts), interleaved with the
// orchestrator's own run so its polls have something to find.
//
// Unique refs per run: re-run-safe against a PERSISTENT LocalStack (this suite is run
// twice consecutively as part of verification).
const sport = 'Volleyball';
const categorie = ['U15'];
// `from` carries a run-unique marker (LocalStack is persistent across the two consecutive
// verification runs) so this test's Scan-based lookup below can never match a stale event
// row left over from a previous run.
const runMarker = randomUUID();
const dates = { from: `2026-09-01#${runMarker}`, to: '2026-09-30' };

let o2: SpawnedO2;
let approverToken: string;

beforeAll(async () => {
  o2 = await spawnO2();
  process.env.O2_BASE_URL = o2.baseUrl;

  const magicLinkRes = await fetch(`${o2.baseUrl}/identities/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contact: `${randomUUID()}@example.com`, roles: ['RegistrationManager'] }),
  });
  ({ token: approverToken } = await magicLinkRes.json());
}, 20_000);

afterAll(async () => {
  await o2.stop();
});

test('test_pb1Setup_stepsOneToSix_reachConfirmedAfterApplyAndPay', async () => {
  const participantRef = 'team-pb1-' + randomUUID();

  // Pre-existing collaborator data the orchestrator's steps rely on (participant
  // directory row), mirroring registration-flow.it.test.ts's beforeAll seeding.
  const db = makeDocClient();
  await db.send(new PutCommand({ TableName: resourceName('o5-participants'), Item: { participantRef } }));

  // Fire the orchestrator: it will run steps 1-3 (CreateEvent, OpenRegistrationWindow),
  // then block in step 4's poll waiting for a RegistrationApplied-backed row to appear.
  const resultPromise = runPb1Setup({ sport, categorie, dates, participantRef, approverToken });

  // The orchestrator's own result only resolves once the ENTIRE flow (through step 6)
  // completes, which itself requires this test to drive the apply + payment events below
  // — so sportEventId can't be read off resultPromise yet. o3-events has no secondary
  // index to look a row up by anything other than sportEventId (which this test doesn't
  // know ahead of time, by design — CreateEvent generates it), so poll via a small Scan
  // filtered on this run's unique (sport, dates) tuple; acceptable against a tiny
  // LocalStack table in an integration test.
  const o5 = (await import('../../services/o5-registration/src/handler.js') as any).app;
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const sportEventId: string = await (async () => {
    for (let i = 0; i < 30; i++) {
      const res = await db.send(new ScanCommand({ TableName: resourceName('o3-events'), FilterExpression: '#s = :sport', ExpressionAttributeNames: { '#s': 'sport' }, ExpressionAttributeValues: { ':sport': sport } }));
      const created = (res.Items ?? []).find((it: any) => it.dates?.from === dates.from && it.dates?.to === dates.to);
      if (created) return created.sportEventId as string;
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error('test_pb1Setup: timed out waiting for CreateEvent to land in o3-events');
  })();

  // The event's existence (above) only proves step 1 (CreateEvent) landed — it does NOT
  // prove step 3 (OpenRegistrationWindow) has finished yet, since the orchestrator runs
  // steps 1 and 3 as two separate sequential awaits. Applying before the window row is
  // durably 'Open' would spuriously 422 (WINDOW_CLOSED: apply-registration.ts treats a
  // missing window row the same as a closed one). Poll o5-windows directly (a plain Get
  // by sportEventId, no GSI needed) until state is 'Open' before applying.
  await (async () => {
    for (let i = 0; i < 30; i++) {
      const res = await db.send(new GetCommand({ TableName: resourceName('o5-windows'), Key: { sportEventId } }));
      if (res.Item?.state === 'Open') return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`test_pb1Setup: timed out waiting for o5-windows[${sportEventId}] to become Open`);
  })();

  // Step 4 trigger: apply for real (this IS the actual RegistrationApplied event source,
  // published for real via EventBridgeEventPublisher inside applyRegistration).
  const applyRes = await o5.request('/registrations', {
    method: 'POST',
    // S2.4: apply needs a valid magic-link (the coach's enrollment link).
    headers: { 'content-type': 'application/json', authorization: signMagicLink({ subject: 'pb1-coach', roles: ['coach'] }) },
    body: JSON.stringify({ participantRef, sportEventId, categoria: 'U15' }),
  });
  expect(applyRes.status).toBe(201);
  const { registrationId } = await applyRes.json();

  // Give the orchestrator a beat to observe the applied row and complete step 5
  // (ConfirmTeam, a real REST call with approverToken) BEFORE this test drives payment —
  // this exercises the intended sequential PB-1 Setup narrative (apply -> human confirm
  // -> fee paid) rather than relying on onFeePaid's already-Confirmed no-op guard. Poll
  // o5-registrations directly for status 'Confirmed' with a short timeout.
  for (let i = 0; i < 30; i++) {
    const row = await db.send(new GetCommand({ TableName: resourceName('o5-registrations'), Key: { registrationId } }));
    if (row.Item?.status === 'Confirmed') break;
    await new Promise((r) => setTimeout(r, 200));
  }

  // Deliver RegistrationApplied to O12's consumer (mirrors payment-first.it.test.ts),
  // then pay, then deliver ParticipationFeePaid to O5's consumer — this is what would
  // resume step 6's wait in a real deployment. Step 5 (ConfirmTeam) has already flipped
  // status to 'Confirmed' by this point (awaited above), so onFeePaid's reaction here is
  // expected to be a harmless no-op (see on-fee-paid.ts: skips unless status is exactly
  // 'Applied') — step 6's poll only cares that the final status still reads 'Confirmed'.
  const o12Consumer = (await import('../../services/o12-payments/src/consumer.js') as any).handler;
  const o12 = (await import('../../services/o12-payments/src/handler.js') as any).app;
  const o5Consumer = (await import('../../services/o5-registration/src/consumer.js') as any).handler;

  await o12Consumer({
    'detail-type': 'RegistrationApplied',
    detail: { registrationId, participantRef, envelope: { organizationId: 'org-pilot', eventId: 'pb1-e1-' + randomUUID(), correlationId: 'pb1-c-' + registrationId } },
  });
  await o12.request(`/payments/${registrationId}/pay`, { method: 'POST' });
  await o5Consumer({
    'detail-type': 'ParticipationFeePaid',
    detail: { registrationId, envelope: { organizationId: 'org-pilot', eventId: 'pb1-e2-' + randomUUID(), correlationId: 'pb1-c-' + registrationId } },
  });

  const result = await resultPromise;

  expect(result.sportEventId).toBe(sportEventId);
  expect(result.registrationId).toBe(registrationId);
  expect(result.status).toBe('Confirmed');

  const stored = await db.send(new GetCommand({ TableName: resourceName('o5-registrations'), Key: { registrationId } }));
  expect(stored.Item).toMatchObject({ status: 'Confirmed' });
}, 30_000);
