import type { Auth0Config } from './auth0.js';

/**
 * S2.1 — build the Auth0 config from environment (injected per-env by the CDK ApiStack).
 * Returns undefined when Auth0 is not configured (local/dev/tests), so handlers fall back
 * to the magic-link-only bridge. See the Auth0 setup runbook.
 */
export function auth0ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Auth0Config | undefined {
  const issuer = env.AUTH0_ISSUER;
  const audience = env.AUTH0_AUDIENCE;
  if (!issuer || !audience) return undefined;
  return {
    issuer,
    audience,
    jwksUri: env.AUTH0_JWKS_URI,
    rolesClaim: env.AUTH0_ROLES_CLAIM,
    orgClaim: env.AUTH0_ORG_CLAIM,
  };
}
