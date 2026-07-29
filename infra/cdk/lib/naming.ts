// Env-parametrized physical naming (ADR-012, S0.10). The env token is derived from CDK
// context (`-c env=stg|pr|local`) and threaded to every construct — no name is hard-coded
// to a single environment. Mirrors @playfusion/platform-lib's naming so the deployed
// resources match what the Lambda runtime resolves at request time.
export const EVENT_SOURCE = 'playfusion2';

export function resourceName(base: string, env: string): string {
  return `playfusion2-${base}-${env}`;
}

export function busName(env: string): string {
  return resourceName('bus', env);
}
