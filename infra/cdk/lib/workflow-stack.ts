import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { StateMachine, DefinitionBody, Activity } from 'aws-cdk-lib/aws-stepfunctions';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { resourceName } from './naming.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASL_PATH = resolve(__dirname, '..', '..', '..', 'workflow', 'pb-1-setup.asl.json');

export interface WorkflowStackProps extends StackProps {
  readonly appEnv: string;
}

/**
 * S0.8 — deploy the PB-1 "Bundle Enrollment" Setup ASL (workflow/pb-1-setup.asl.json) as a
 * real Step Functions state machine — the piece ADR-010 could previously only simulate via
 * the in-process orchestrator (workflow/pb-1-orchestrator.ts).
 *
 * The two wait states resume via task-token Activity callbacks (RegistrationApplied /
 * ParticipationFeePaid); their ARNs are substituted into the definition here. The automatic
 * Task states call the S0.7 API Gateway via `apigateway:invoke`, resolving the endpoint from
 * the execution input (`$.apiHost` = the execute-api host, `$.stage` = the API stage) — so the
 * machine is env-agnostic and works against whichever env's API is passed at start time. Paths
 * are BC-prefixed (`/o3/…`, `/o5/…`) to match the ApiStack `/<bc>/{proxy+}` mount.
 */
export class WorkflowStack extends Stack {
  readonly stateMachine: StateMachine;

  constructor(scope: Construct, id: string, props: WorkflowStackProps) {
    super(scope, id, props);
    const env = props.appEnv;

    const registrationApplied = new Activity(this, 'registration-applied-activity', {
      activityName: resourceName('pb-1-registration-applied-activity', env),
    });
    const feePaid = new Activity(this, 'fee-paid-activity', {
      activityName: resourceName('pb-1-fee-paid-activity', env),
    });

    this.stateMachine = new StateMachine(this, 'pb-1-setup', {
      stateMachineName: resourceName('pb-1-setup', env),
      definitionBody: DefinitionBody.fromFile(ASL_PATH),
      definitionSubstitutions: {
        RegistrationAppliedActivityArn: registrationApplied.activityArn,
        FeePaidActivityArn: feePaid.activityArn,
      },
    });

    // The automatic Task states invoke the API Gateway REST API (apigateway:invoke).
    this.stateMachine.addToRolePolicy(
      new PolicyStatement({ actions: ['execute-api:Invoke'], resources: ['*'] }),
    );
  }
}
