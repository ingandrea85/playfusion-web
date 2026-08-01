import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  SFNClient, CreateActivityCommand, CreateStateMachineCommand,
  StartExecutionCommand, DescribeExecutionCommand, GetExecutionHistoryCommand,
} from '@aws-sdk/client-sfn';

// S0.8 acceptance: the PB-1 Setup ASL (workflow/pb-1-setup.asl.json), deployed by the CDK
// WorkflowStack, is a REAL, engine-valid, executable Step Functions state machine — not just
// a JSON spec (the gap ADR-010 could previously only simulate via the in-process
// orchestrator). This test reproduces exactly what WorkflowStack builds — the two Activities
// substituted into the definition — creates the state machine on the Step Functions engine
// (LocalStack), starts an execution, and asserts it walks the Setup step graph to a terminal
// state. The automatic Task states call the API Gateway via apigateway:invoke; with no API
// deployed on this LocalStack the first Task fails and the ASL's own Catch routes it to
// HumanReview → terminal, which still proves the engine executes the state graph and the
// error-routing wired in the ASL. The happy-path functional walk of steps 1-6 is covered by
// pb-1-setup.it.test.ts (the L2 orchestrator running the identical sequence).
const __dirname = dirname(fileURLToPath(import.meta.url));
const ASL_PATH = resolve(__dirname, '..', '..', 'workflow', 'pb-1-setup.asl.json');
const sfn = new SFNClient({ endpoint: process.env.AWS_ENDPOINT_URL });

async function terminalStatus(executionArn: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const { status } = await sfn.send(new DescribeExecutionCommand({ executionArn }));
    if (status && status !== 'RUNNING') return status;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('execution did not reach a terminal state in time');
}

test('test_pb1StateMachine_deploysAndExecutionWalksSetupSteps', async () => {
  const run = randomUUID().slice(0, 8);
  const applied = await sfn.send(new CreateActivityCommand({ name: `pb1-applied-${run}` }));
  const fee = await sfn.send(new CreateActivityCommand({ name: `pb1-fee-${run}` }));

  // Reproduce WorkflowStack's definitionSubstitutions on the real ASL file.
  const definition = readFileSync(ASL_PATH, 'utf8')
    .replaceAll('${RegistrationAppliedActivityArn}', applied.activityArn!)
    .replaceAll('${FeePaidActivityArn}', fee.activityArn!);

  // Engine-level validation: a plain JSON file would not survive CreateStateMachine.
  const sm = await sfn.send(new CreateStateMachineCommand({
    name: `pb1-setup-${run}`,
    definition,
    roleArn: 'arn:aws:iam::000000000000:role/pb1-test',
  }));
  expect(sm.stateMachineArn).toBeTruthy();

  const exec = await sfn.send(new StartExecutionCommand({
    stateMachineArn: sm.stateMachineArn,
    input: JSON.stringify({
      apiHost: 'localhost:9', // no API deployed here → CreateEvent Task fails, Catch routes on
      stage: 'local',
      organizationId: 'org-pilot',
      createEventPayload: { sport: 'Volleyball', categorie: ['U15'], dates: { from: 'a', to: 'b' } },
      approverToken: 'test-token',
    }),
  }));
  expect(exec.executionArn).toBeTruthy();

  const status = await terminalStatus(exec.executionArn!);
  expect(status).toBe('SUCCEEDED');

  // The execution actually entered the Setup step graph starting at CreateEvent.
  const history = await sfn.send(new GetExecutionHistoryCommand({ executionArn: exec.executionArn!, maxResults: 100 }));
  const entered = history.events!
    .filter((e) => e.stateEnteredEventDetails)
    .map((e) => e.stateEnteredEventDetails!.name);
  expect(entered).toContain('CreateEvent');
});
