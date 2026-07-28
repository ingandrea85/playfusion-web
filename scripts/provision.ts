// LocalStack env defaults (set only if unset, so CI/host can override). Mirrors
// test/setup/localstack-env.ts so `npm run provision` is self-sufficient in a clean
// environment (e.g. the VSCode devcontainer), without inline env on the command.
// Must run before the AWS clients below are constructed.
process.env.AWS_ENDPOINT_URL ??= 'http://localhost:4566';
process.env.AWS_REGION ??= 'us-east-1';
process.env.AWS_ACCESS_KEY_ID ??= 'test';
process.env.AWS_SECRET_ACCESS_KEY ??= 'test';

import { DynamoDBClient, CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { EventBridgeClient, CreateEventBusCommand } from '@aws-sdk/client-eventbridge';
import { readFile } from 'node:fs/promises';
// Single source of truth for physical names (ADR-012). Imported from the lib source
// so `npm run provision` (tsx) stays self-sufficient without a prior build.
import { resourceName, busName } from '../libs/platform-lib/src/naming.js';

const endpoint = process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566';
const ddb = new DynamoDBClient({ endpoint });
const eb = new EventBridgeClient({ endpoint });

// Idempotent: swallow "already exists" style errors, rethrow anything else.
const ignoreExists = (e: any) => {
  const marker = `${e?.name ?? ''} ${e?.message ?? ''}`;
  if (!/exist/i.test(marker)) throw e;
};

await eb.send(new CreateEventBusCommand({ Name: busName() })).catch(ignoreExists);

await ddb.send(new CreateTableCommand({
  TableName: resourceName('o5-registrations'), BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [{ AttributeName: 'registrationId', AttributeType: 'S' }, { AttributeName: 'pe', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'registrationId', KeyType: 'HASH' }],
  GlobalSecondaryIndexes: [{ IndexName: 'pe-index', KeySchema: [{ AttributeName: 'pe', KeyType: 'HASH' }], Projection: { ProjectionType: 'ALL' } }],
})).catch(ignoreExists);

for (const [t, key] of [['o5-windows', 'sportEventId'], ['o5-participants', 'participantRef']] as const) {
  await ddb.send(new CreateTableCommand({
    TableName: resourceName(t), BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: key, AttributeType: 'S' }],
    KeySchema: [{ AttributeName: key, KeyType: 'HASH' }],
  })).catch(ignoreExists);
}

console.log('provision: O5 tables (o5-registrations, o5-windows, o5-participants) + bus ensured on', endpoint);

for (const [t, key] of [['o3-events', 'sportEventId'], ['o4-participants', 'participantId']] as const) {
  await ddb.send(new CreateTableCommand({
    TableName: resourceName(t), BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [{ AttributeName: key, AttributeType: 'S' }],
    KeySchema: [{ AttributeName: key, KeyType: 'HASH' }],
  })).catch(ignoreExists);
}

console.log('provision: O3/O4 tables (o3-events, o4-participants) ensured on', endpoint);

await ddb.send(new CreateTableCommand({
  TableName: resourceName('o2-identities'), BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [{ AttributeName: 'subject', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'subject', KeyType: 'HASH' }],
})).catch(ignoreExists);

console.log('provision: O2 table (o2-identities) ensured on', endpoint);

await ddb.send(new CreateTableCommand({
  TableName: resourceName('o12-fees'), BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [{ AttributeName: 'registrationId', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'registrationId', KeyType: 'HASH' }],
})).catch(ignoreExists);

await ddb.send(new CreateTableCommand({
  TableName: resourceName('o5-processed-events'), BillingMode: 'PAY_PER_REQUEST',
  AttributeDefinitions: [{ AttributeName: 'eventId', AttributeType: 'S' }],
  KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
})).catch(ignoreExists);

console.log('provision: O12/O5-consumer tables (o12-fees, o5-processed-events) ensured on', endpoint);

// NOTE on EventBridge rules (decision-4 pragmatic path): the plan calls for rules
// routing `detail-type` (ParticipationFeePaid/ParticipantCreated/EventPublished → O5
// consumer; RegistrationApplied → O12 consumer) with Lambda targets. No Lambdas are
// deployed in this LocalStack test loop, so PutTargets against a non-existent Lambda
// ARN would fail provisioning outright. Real bus→Lambda rule wiring is a deploy-time
// concern (CDK/SAM, out of scope here). Instead, the integration tests invoke the
// consumer entrypoints (packages/o5-registration/src/consumer.ts,
// packages/o12-payments/src/consumer.ts) DIRECTLY with simulated EventBridge payloads,
// and observe the real `RegistrationConfirmed` publish via the SQS-harness pattern
// (see packages/platform-lib/test/integration/eventbridge-event-publisher.it.test.ts).
// No rules are created here — nothing to provision beyond the tables above.

// ---------------------------------------------------------------------------------
// PB-1 Setup Step Functions state machine (workflow/pb-1-setup.asl.json) — decision-4
// gate finding: Step Functions cannot faithfully EXECUTE this pilot's automatic Task
// states (CreateEvent / OpenRegistrationWindow / ConfirmTeam), because they need to
// call a BC's REST endpoint and this pilot deploys NO Lambda and NO API Gateway
// anywhere (every BC is an in-process Hono `app`, invoked directly in tests). Evidence:
//   - arn:aws:states:::http:invoke is rejected outright by LocalStack Community's ASL
//     parser at CreateStateMachine time ("Unknown service: http").
//   - arn:aws:states:::apigateway:invoke at least parses, but requires a deployed API
//     Gateway REST API + stage to actually invoke against, which does not exist here.
//   - arn:aws:states:::lambda:invoke requires a real deployed Lambda ARN, also absent.
//   - The Activity/GetActivityTask/SendTaskSuccess callback pattern (used for the
//     WaitForApplication / WaitForFeePaid states) DOES work on LocalStack Community —
//     the blocker is exclusively "no reachable compute target for the automatic Task
//     states", not the wait/callback semantics.
// Conclusion (per the coordinator's decision-4 gate spike): do not sink further time
// into making SFN the execution engine here. PB-1 Setup steps 1-6 are actually driven
// by the L2 local-orchestrator fallback (workflow/pb-1-orchestrator.ts), which performs
// the same sequencing in-process and polls DynamoDB read models in place of a real
// task-token callback channel. The block below still registers the ASL artifact (best
// effort) so it stays parse-valid evidence of the intended shape — it must NEVER fail
// `npm run provision`'s exit code if SFN/Activity creation is degraded or impossible.
try {
  const { SFNClient, CreateStateMachineCommand, CreateActivityCommand } = await import('@aws-sdk/client-sfn');
  const sfn = new SFNClient({ endpoint });

  const activityArns: Record<string, string> = {};
  const activities = [
    ['pb-1-registration-applied-activity', 'RegistrationAppliedActivityArn'],
    ['pb-1-fee-paid-activity', 'FeePaidActivityArn'],
  ] as const;

  for (const [activityName, placeholder] of activities) {
    try {
      const created = await sfn.send(new CreateActivityCommand({ name: activityName }));
      if (created.activityArn) activityArns[placeholder] = created.activityArn;
    } catch (err) {
      const e = err as { name?: string; message?: string };
      const text = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
      if (text.includes('exist')) {
        // Idempotent re-run: LocalStack has no GetActivity-by-name lookup, so
        // reconstruct the deterministic ARN shape instead of calling ListActivities.
        activityArns[placeholder] = `arn:aws:states:${process.env.AWS_REGION ?? 'us-east-1'}:000000000000:activity:${activityName}`;
      } else {
        // Defensive: per coordinator rule 4, ANY non-"already exists" failure here must
        // only warn, never fail provisioning.
        console.warn(`provision: CreateActivity(${activityName}) degraded (${text || 'unknown error'}) — continuing without it`);
      }
    }
  }

  const aslPath = new URL('../workflow/pb-1-setup.asl.json', import.meta.url);
  const aslRaw = await readFile(aslPath, 'utf8');
  let substitutedAsl = aslRaw;
  for (const [, placeholder] of activities) {
    const arn = activityArns[placeholder];
    if (arn) substitutedAsl = substitutedAsl.replaceAll(`\${${placeholder}}`, arn);
  }

  if (substitutedAsl.includes('${')) {
    console.warn('provision: SFN state machine creation skipped (unresolved ${...} placeholder(s) remain in workflow/pb-1-setup.asl.json — activity ARNs unavailable) — PB-1 Setup steps 1-6 are driven by the L2 orchestrator (workflow/pb-1-orchestrator.ts) instead');
  } else {
    await sfn.send(new CreateStateMachineCommand({
      name: 'pb-1-setup',
      definition: substitutedAsl,
      roleArn: 'arn:aws:iam::000000000000:role/pb-1-setup-role', // dummy: LocalStack does not enforce IAM
    })).catch((err: unknown) => {
      const e = err as { name?: string; message?: string };
      const text = `${e.name ?? ''} ${e.message ?? ''}`.toLowerCase();
      if (!text.includes('exist')) throw err;
    });
    console.log('provision: pb-1-setup state machine registered on', endpoint, '(artifact-only — PB-1 Setup steps 1-6 are actually executed by workflow/pb-1-orchestrator.ts, see its header comment / ADR rationale above)');
  }
} catch (err) {
  const e = err as { name?: string; message?: string };
  console.warn(`provision: SFN state machine creation skipped/degraded (${e.name ?? ''} ${e.message ?? ''}) — PB-1 Setup steps 1-6 are driven by the L2 orchestrator (workflow/pb-1-orchestrator.ts) instead`);
}
