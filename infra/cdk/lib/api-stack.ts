import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration } from 'aws-cdk-lib/aws-apigateway';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import type { DataStack } from './data-stack.js';
import { EVENT_SOURCE, busName } from './naming.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES = resolve(__dirname, '..', '..', '..', 'services');

export interface ApiStackProps extends StackProps {
  readonly appEnv: string;
  readonly data: DataStack;
}

// One Bounded Context = one mono-Lambda (ADR-002). `tables` are the primary stores the
// command handler reads/writes; consumers additionally use the idempotency store.
interface BcSpec {
  key: string;      // services/<key>
  route: string;    // API Gateway base path
  tables: string[];
  consumer?: { tables: string[]; detailTypes: string[] };
}

const BCS: BcSpec[] = [
  { key: 'o2-identity-access', route: 'o2', tables: ['o2-identities'] },
  { key: 'o3-sport-events', route: 'o3', tables: ['o3-events'] },
  { key: 'o4-participant-management', route: 'o4', tables: ['o4-participants'] },
  {
    key: 'o5-registration',
    route: 'o5',
    tables: ['o5-registrations', 'o5-windows', 'o5-participants'],
    consumer: {
      tables: ['o5-registrations', 'o5-windows', 'o5-participants', 'o5-processed-events'],
      detailTypes: ['ParticipationFeePaid', 'ParticipantCreated', 'EventPublished'],
    },
  },
  {
    key: 'o12-payments',
    route: 'o12',
    tables: ['o12-fees'],
    consumer: { tables: ['o12-fees'], detailTypes: ['RegistrationApplied'] },
  },
];

/**
 * S0.7 — one Lambda per Bounded Context fronted by API Gateway REST, plus the event
 * consumers wired as EventBridge rule targets. Handler/consumer source is bundled from
 * services/* with esbuild; the ADR-002 no-cross-BC lint rule (S0.4) guarantees a bundle
 * never pulls another BC's code.
 */
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const env = props.appEnv;
    const commonEnv = { PF_ENV: env, EVENT_BUS_NAME: busName(env) };

    const lambda = (idSuffix: string, entry: string): NodejsFunction =>
      new NodejsFunction(this, idSuffix, {
        entry,
        handler: 'handler',
        runtime: Runtime.NODEJS_20_X,
        timeout: Duration.seconds(30),
        environment: commonEnv,
        bundling: {
          format: OutputFormat.ESM,
          mainFields: ['module', 'main'],
          // The Node 20 Lambda runtime ships the AWS SDK v3; keep it external.
          externalModules: ['@aws-sdk/*'],
        },
      });

    const api = new RestApi(this, 'api', { restApiName: `playfusion2-api-${env}` });

    for (const bc of BCS) {
      const handler = lambda(`${bc.route}-handler`, resolve(SERVICES, bc.key, 'src/handler.ts'));
      for (const t of bc.tables) props.data.tables[t]!.grantReadWriteData(handler);
      props.data.bus.grantPutEventsTo(handler);

      // API Gateway route: /<route>/{proxy+} → the BC's Hono app
      api.root.addResource(bc.route).addProxy({
        defaultIntegration: new LambdaIntegration(handler),
        anyMethod: true,
      });

      if (bc.consumer) {
        const consumer = lambda(`${bc.route}-consumer`, resolve(SERVICES, bc.key, 'src/consumer.ts'));
        for (const t of bc.consumer.tables) props.data.tables[t]!.grantReadWriteData(consumer);
        props.data.bus.grantPutEventsTo(consumer);
        new Rule(this, `${bc.route}-consumer-rule`, {
          eventBus: props.data.bus,
          eventPattern: { source: [EVENT_SOURCE], detailType: bc.consumer.detailTypes },
          targets: [new LambdaFunction(consumer)],
        });
      }
    }
  }
}
