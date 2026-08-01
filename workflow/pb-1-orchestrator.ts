// PB-1 "Bundle Enrollment" — Setup steps 1-6, L2 local-orchestrator fallback.
//
// WHY THIS FILE EXISTS (decision-4 gate finding): workflow/pb-1-setup.asl.json documents
// the intended Step Functions shape for PB-1 Setup, but Step Functions cannot actually
// EXECUTE the automatic Task states in this pilot's architecture. Every bounded context
// (O2/O3/O4/O5/O12) is an in-process Hono `app` — none is deployed as a Lambda or fronted
// by an API Gateway REST API/stage anywhere in this repo or in the LocalStack setup. The
// ASL's Task states target arn:aws:states:::apigateway:invoke (the only http-shaped
// connector LocalStack Community's ASL parser recognizes — arn:aws:states:::http:invoke
// is rejected at CreateStateMachine time with "Unknown service: http"), but there is no
// deployed API Gateway for it to invoke against, and arn:aws:states:::lambda:invoke would
// need a real Lambda ARN that also doesn't exist. The Activity/GetActivityTask/
// SendTaskSuccess callback pattern used for the wait states DOES work on LocalStack
// Community — the blocker is exclusively "no reachable compute target for the automatic
// steps", not the wait/callback semantics. See scripts/provision.ts's SFN block for the
// same finding documented at the provisioning layer.
//
// This module sequences the identical steps 1-6 in-process instead, calling each BC's
// exported Hono `app` (dynamically imported, matching the established pattern in
// packages/o12-payments/test/integration/payment-first.it.test.ts) directly via
// `app.request(...)`, and polling DynamoDB read models in place of a real Step Functions
// task-token callback channel for the two "wait for a domain event" steps.
//
// BC boundary note: this file lives under workflow/ at the repo root, NOT under
// packages/**, so ESLint's no-restricted-imports rule (scoped to `files: ['packages/**/*.ts']`
// in eslint.config.js) does not apply to it. Dynamic import of each BC's compiled
// entrypoint (rather than a static cross-package import) is still used here for
// consistency with the rest of the codebase's established idiom for driving multiple BCs
// from a single test/orchestration file.

import { randomUUID } from 'node:crypto';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { makeDocClient, checkpoint, resourceName } from '@playfusion/platform-lib';

export type Pb1SetupInput = {
  sport: string;
  categorie: string[];
  dates: { from: string; to: string };
  participantRef: string;
  organizationId?: string;
  /**
   * Token asserting the RegistrationManager role, required by O5's confirm-registration
   * use case (see packages/o5-registration/src/application/confirm-registration.ts, which
   * calls authorizer.hasRegistrationManagerRole(approverToken) and throws
   * NotAuthorizedError if it doesn't hold). Obtaining this token means talking to O2 (a
   * magic-link exchange), which is a concern this orchestrator deliberately keeps OUT of
   * itself — the caller (e.g. the integration test, mirroring
   * packages/o5-registration/test/integration/registration-flow.it.test.ts's spawnO2()
   * helper) is responsible for spawning/calling O2 and passing the resulting token in.
   * This keeps the orchestrator itself free of O2-spawning concerns and mirrors how the
   * existing tests separate that responsibility.
   */
  approverToken?: string;
};

export type Pb1SetupResult = {
  sportEventId: string;
  registrationId: string;
  status: string;
};

type PollOptions = { intervalMs?: number; timeoutMs?: number };

async function pollUntil<T>(
  label: string,
  fn: () => Promise<T | undefined>,
  { intervalMs = 300, timeoutMs = 10_000 }: PollOptions = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await fn();
    if (result !== undefined) return result;
    if (Date.now() >= deadline) {
      throw new Error(`pb-1-orchestrator: timed out after ${timeoutMs}ms waiting for ${label}`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export async function runPb1Setup(input: Pb1SetupInput): Promise<Pb1SetupResult> {
  const organizationId = input.organizationId ?? 'org-pilot';
  const db = makeDocClient();

  checkpoint('pb-1-orchestrator', 'START', { sport: input.sport, participantRef: input.participantRef });

  // Steps 1-2 (combined): O3 POST /events creates the sport event + categorie, publishing
  // EventPublished.
  const o3 = (await import('../services/o3-sport-events/src/handler.js') as any).app;
  const createEventRes = await o3.request('/events', {
    method: 'POST',
    // S2.4: create-event/open-window are organizer mutations; the same approverToken
    // (a RegistrationManager magic-link) authorizes them via the bridge.
    headers: { 'content-type': 'application/json', 'x-organization-id': organizationId, ...(input.approverToken ? { authorization: input.approverToken } : {}) },
    body: JSON.stringify({ sport: input.sport, categorie: input.categorie, dates: input.dates }),
  });
  if (createEventRes.status !== 201) {
    throw new Error(`pb-1-orchestrator: CreateEvent failed with status ${createEventRes.status}: ${await createEventRes.text()}`);
  }
  const { sportEventId } = await createEventRes.json();
  checkpoint('pb-1-orchestrator', 'STEP', { step: 'CreateEvent', sportEventId });

  // Step 3: O5 POST /events/{sportEventId}/registration-window:open.
  const o5 = (await import('../services/o5-registration/src/handler.js') as any).app;
  const openWindowRes = await o5.request(`/events/${sportEventId}/registration-window:open`, {
    method: 'POST',
    headers: { 'x-organization-id': organizationId, ...(input.approverToken ? { authorization: input.approverToken } : {}) },
  });
  if (openWindowRes.status !== 200) {
    throw new Error(`pb-1-orchestrator: OpenRegistrationWindow failed with status ${openWindowRes.status}: ${await openWindowRes.text()}`);
  }
  checkpoint('pb-1-orchestrator', 'STEP', { step: 'OpenRegistrationWindow', sportEventId });

  // Step 4: "wait for application". L2 equivalent of the ASL's `.waitForTaskToken`
  // Activity resumed by RegistrationApplied — this orchestrator does NOT itself apply
  // (a real participant/team applying is what resumes the ASL's WaitForApplication
  // Activity task); instead it polls the o5-registrations read model (via the pe-index
  // GSI, keyed on `participantRef#sportEventId`, exactly as
  // DynamoDbRegistrationRepository.findByParticipantAndEvent does) until a row with
  // status 'Applied' for this participantRef+sportEventId appears, standing in for a
  // real callback channel.
  // Note: this polls for the row's mere EXISTENCE (any status), not specifically status
  // 'Applied'. A row only ever gets created by applyRegistration with status 'Applied'
  // (see domain/registration.ts), so existence IS the RegistrationApplied signal — the
  // status may already have raced ahead to 'Confirmed' by the time this poll observes it
  // (e.g. in a test that delivers ConfirmTeam/ParticipationFeePaid back-to-back without
  // yielding), which is a harmless, valid outcome, not a reason to keep waiting.
  const pe = `${input.participantRef}#${sportEventId}`;
  const applied = await pollUntil(
    `RegistrationApplied (participantRef=${input.participantRef}, sportEventId=${sportEventId})`,
    async () => {
      const res = await db.send(new QueryCommand({
        TableName: resourceName('o5-registrations'),
        IndexName: 'pe-index',
        KeyConditionExpression: 'pe = :pe',
        ExpressionAttributeValues: { ':pe': pe },
      }));
      return res.Items?.[0];
    },
  );
  const registrationId = applied.registrationId as string;
  checkpoint('pb-1-orchestrator', 'STEP', { step: 'WaitForApplication', registrationId, observedStatus: applied.status });

  // Step 5: O5 POST /registrations/{registrationId}/confirm. This is the human-in-the-loop
  // step: confirmRegistration requires a RegistrationManager-authorized approverToken (see
  // packages/o5-registration/src/application/confirm-registration.ts). The token itself is
  // obtained by the caller (see Pb1SetupInput.approverToken doc above), not by this file.
  // Skip the REST call if the registration is already past 'Applied' (e.g. it raced ahead
  // to 'Confirmed' via ParticipationFeePaid before this orchestrator got here) — O5's
  // confirmRegistration domain guard (confirmDomain) would otherwise reject a
  // non-'Applied' registration with a 409 RegistrationAlreadyResolvedError, which is not a
  // real failure of PB-1 Setup, just a already-satisfied step.
  if (applied.status === 'Applied') {
    const confirmRes = await o5.request(`/registrations/${registrationId}/confirm`, {
      method: 'POST',
      headers: input.approverToken ? { authorization: input.approverToken } : {},
    });
    if (confirmRes.status !== 200) {
      throw new Error(`pb-1-orchestrator: ConfirmTeam failed with status ${confirmRes.status}: ${await confirmRes.text()}`);
    }
    checkpoint('pb-1-orchestrator', 'STEP', { step: 'ConfirmTeam', registrationId });
  } else {
    checkpoint('pb-1-orchestrator', 'STEP', { step: 'ConfirmTeam', registrationId, skipped: true, reason: `already ${applied.status}` });
  }

  // Step 6: "wait for ParticipationFeePaid". L2 equivalent of the ASL's second
  // `.waitForTaskToken` Activity, resumed by ParticipationFeePaid (O12 pay -> O5's
  // onFeePaid consumer sets status 'Confirmed' again — a no-op transition confirming the
  // fee-paid reaction landed). Poll o5-registrations directly by registrationId until the
  // status reads 'Confirmed'.
  const finalReg = await pollUntil(
    `ParticipationFeePaid (registrationId=${registrationId})`,
    async () => {
      const res = await db.send(new GetCommand({ TableName: resourceName('o5-registrations'), Key: { registrationId } }));
      return res.Item?.status === 'Confirmed' ? res.Item : undefined;
    },
  );
  checkpoint('pb-1-orchestrator', 'STOP', { step: 'WaitForFeePaid', registrationId, status: finalReg.status });

  return { sportEventId, registrationId, status: finalReg.status as string };
}

// Standalone CLI entry (tsx-runnable): tsx workflow/pb-1-orchestrator.ts
// Not used by the integration test (which imports runPb1Setup directly), but kept for
// manual/local exercising the same way scripts/provision.ts is run standalone.
if (process.argv[1] && new URL(process.argv[1], 'file://').href === import.meta.url) {
  runPb1Setup({
    sport: 'Volleyball',
    categorie: ['U15'],
    dates: { from: '2026-09-01', to: '2026-09-30' },
    participantRef: 'team-cli-' + randomUUID(),
  })
    .then((result) => {
      console.log('pb-1-orchestrator: setup complete', result);
    })
    .catch((err) => {
      console.error('pb-1-orchestrator: setup failed', err);
      process.exitCode = 1;
    });
}
