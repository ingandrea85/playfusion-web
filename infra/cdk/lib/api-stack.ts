import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { RestApi, LambdaIntegration, Cors } from 'aws-cdk-lib/aws-apigateway';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import type { DataStack } from './data-stack.js';
import { EVENT_SOURCE, busName } from './naming.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVICES = resolve(__dirname, '..', '..', '..', 'services');

/** Non-secret Auth0 organizer-login config (S2.1); empty issuer/audience = disabled. */
export interface Auth0EnvConfig {
  readonly issuer?: string;
  readonly audience?: string;
  readonly jwksUri?: string;
  readonly rolesClaim?: string;
  readonly orgClaim?: string;
}

export interface ApiStackProps extends StackProps {
  readonly appEnv: string;
  readonly data: DataStack;
  readonly auth0?: Auth0EnvConfig;
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
  { key: 'o2-identity-access', route: 'o2', tables: ['o2-identities', 'o2-members', 'o2-invitations'] },
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
  // O7 scheduling (S7): reads o3/o5 over HTTP (PF_API_BASE_URL), no consumer.
  { key: 'o7-scheduling', route: 'o7', tables: ['o7-schedules', 'o7-matches', 'o7-tie-overrides', 'o7-resources'] },
  // O9 communications (S15): organizer announcements, public read. No consumer (SYSTEM/auto deferred).
  { key: 'o9-communications', route: 'o9', tables: ['o9-announcements'] },
  // O1 organization (S18): per-tenant brand identity, public read + organizer write. No consumer.
  { key: 'o1-organization', route: 'o1', tables: ['o1-organizations'] },
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
    const commonEnv: Record<string, string> = { PF_ENV: env, EVENT_BUS_NAME: busName(env) };
    // S2.1: pass Auth0 organizer-login config to every BC's requireOrganizer middleware.
    // Empty issuer/audience (no tenant yet) leaves the middleware on the magic-link bridge.
    if (props.auth0?.issuer && props.auth0?.audience) {
      commonEnv.AUTH0_ISSUER = props.auth0.issuer;
      commonEnv.AUTH0_AUDIENCE = props.auth0.audience;
      if (props.auth0.jwksUri) commonEnv.AUTH0_JWKS_URI = props.auth0.jwksUri;
      if (props.auth0.rolesClaim) commonEnv.AUTH0_ROLES_CLAIM = props.auth0.rolesClaim;
      if (props.auth0.orgClaim) commonEnv.AUTH0_ORG_CLAIM = props.auth0.orgClaim;
    }
    // Shared magic-link secret for the cross-BC bridge (S2.3/S2.4). Injected by the
    // deployer via env (never committed); absent → all BCs fall back to the dev default.
    if (process.env.PF_TOKEN_SECRET) commonEnv.PF_TOKEN_SECRET = process.env.PF_TOKEN_SECRET;

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
          // pino (and other CJS deps) use dynamic require() of node builtins,
          // unsupported in an ESM bundle. Reintroduce require via createRequire.
          banner: "import{createRequire}from'module';const require=createRequire(import.meta.url);",
        },
      });

    const api = new RestApi(this, 'api', {
      restApiName: `playfusion2-api-${env}`,
      // Browser SPAs (E1/E3 on CloudFront) call this API cross-origin. Preflight must allow the
      // auth + org + correlation headers the rest-client sends. On stg the CloudFront domain is
      // not known at synth time, so allow any origin; tighten to the exact domain in pr.
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        // DELETE is used by o5 removeTeam (S14), o9 delete (S15), o1 reset (S18), o2 member/invite (S19);
        // without it the browser preflight blocks those calls (e2e raw-fetch never exercises preflight).
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['content-type', 'authorization', 'x-organization-id', 'x-correlation-id'],
      },
    });

    // Cross-BC HTTP contract (ADR-002: no code imports): handlers that must reach O2's
    // verify endpoint get its base URL here. Built from restApiId (not api.url) to avoid a
    // Lambda→Stage→Deployment→Method→Lambda circular dependency; stage name is the default 'prod'.
    const o2BaseUrl = `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod/o2`;
    // Stage root (no BC suffix): O7 prefixes /o3 and /o5 itself to read events + confirmed
    // teams over HTTP (ADR-002 no code imports). Same restApiId construction as o2BaseUrl to
    // avoid the Lambda→Stage→Deployment circular dependency.
    const apiBaseUrl = `https://${api.restApiId}.execute-api.${this.region}.amazonaws.com/prod`;

    for (const bc of BCS) {
      const handler = lambda(`${bc.route}-handler`, resolve(SERVICES, bc.key, 'src/handler.ts'));
      handler.addEnvironment('O2_BASE_URL', o2BaseUrl);
      handler.addEnvironment('PF_API_BASE_URL', apiBaseUrl);
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
