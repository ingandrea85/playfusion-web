import { describe, it, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { DataStack } from '../infra/cdk/lib/data-stack.js';
import { HostingStack } from '../infra/cdk/lib/hosting-stack.js';

// S0.10 acceptance: `cdk synth -c env=stg` and `-c env=pr` produce two isolated resource
// sets — no name pinned to a single env. We synth the same stacks in-memory for both env
// tokens (via aws-cdk-lib assertions, no CLI) and assert every physical name carries the
// env token and the two sets are disjoint.
function physicalNames(env: string): string[] {
  // A separate App per stack: Template.fromStack synthesizes the whole App, so two stacks
  // in one App would trigger a second synth of an already-synthesized tree.
  const data = Template.fromStack(new DataStack(new App(), `data-${env}`, { appEnv: env }));
  const hosting = Template.fromStack(new HostingStack(new App(), `hosting-${env}`, { appEnv: env }));
  const tableNames = Object.values(data.findResources('AWS::DynamoDB::Table'))
    .map((r) => r.Properties.TableName as string);
  const busNames = Object.values(data.findResources('AWS::Events::EventBus'))
    .map((r) => r.Properties.Name as string);
  const bucketNames = Object.values(hosting.findResources('AWS::S3::Bucket'))
    .map((r) => r.Properties.BucketName as string)
    .filter((n): n is string => typeof n === 'string');
  return [...tableNames, ...busNames, ...bucketNames];
}

describe('S0.10 env parametrization', () => {
  it('produces disjoint, env-tokened resource sets for stg and pr', () => {
    const stg = physicalNames('stg');
    const pr = physicalNames('pr');

    expect(stg.length).toBeGreaterThan(0);
    expect(stg.every((n) => n.endsWith('-stg'))).toBe(true);
    expect(pr.every((n) => n.endsWith('-pr'))).toBe(true);

    // No physical name is shared across the two environments.
    const overlap = stg.filter((n) => pr.includes(n));
    expect(overlap).toEqual([]);
  });
});
