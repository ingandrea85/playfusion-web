#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { DataStack } from '../lib/data-stack.js';
import { ApiStack } from '../lib/api-stack.js';
import { WorkflowStack } from '../lib/workflow-stack.js';
import { HostingStack } from '../lib/hosting-stack.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Env token from CDK context (`-c env=stg|pr|local`), default local (LocalStack/synth).
// Non-secret per-env config lives in env/<token>.json; credentials/account come from the
// standard AWS chain via CDK_DEFAULT_ACCOUNT/REGION (populated by the CLI/CI), reusing the
// previous playfuse-infra pattern. No secrets in the repo.
const app = new App();
const envToken: string = app.node.tryGetContext('env') ?? 'local';
const cfg = JSON.parse(
  readFileSync(resolve(__dirname, '..', 'env', `${envToken}.json`), 'utf-8'),
) as {
  env: string; region?: string; environmentName?: string;
  auth0?: { issuer?: string; audience?: string; jwksUri?: string; rolesClaim?: string; orgClaim?: string };
};

const stackEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: cfg.region ?? process.env.CDK_DEFAULT_REGION ?? 'eu-south-1',
};

const data = new DataStack(app, `playfusion2-data-${envToken}`, { env: stackEnv, appEnv: envToken });
new ApiStack(app, `playfusion2-api-${envToken}`, { env: stackEnv, appEnv: envToken, data, auth0: cfg.auth0 });
new WorkflowStack(app, `playfusion2-workflow-${envToken}`, { env: stackEnv, appEnv: envToken });
new HostingStack(app, `playfusion2-hosting-${envToken}`, { env: stackEnv, appEnv: envToken });
