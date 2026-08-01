import { createRemoteJWKSet, jwtVerify, type JWTPayload, type KeyLike, type JWK, type JWTVerifyGetKey } from 'jose';
import type { Identity } from './identity.js';
import { UnauthorizedError } from './errors.js';

/** Auth0 organizer-login config (S2.1). Non-secret; sourced from env per environment. */
export interface Auth0Config {
  issuer: string;   // e.g. https://<tenant>.eu.auth0.com/  (trailing slash matters)
  audience: string; // the API identifier the SPA requests a token for
  jwksUri?: string; // default: `${issuer}.well-known/jwks.json`
  rolesClaim?: string; // Auth0 custom claims are namespaced; default 'https://playfusion/roles'
  orgClaim?: string;   // default 'org_id' (Auth0 Organizations)
}

// The key input jwtVerify accepts: a resolved key or a JWKS resolver. Injectable so tests
// verify against a local key without reaching Auth0's JWKS endpoint.
export type KeyInput = KeyLike | Uint8Array | JWK | JWTVerifyGetKey;

/**
 * S2.2 — a verifier for Auth0 RS256 JWTs. Validates signature (via JWKS), issuer and
 * audience, and projects the token into an {@link Identity}. Throws {@link UnauthorizedError}
 * (401) on any failure.
 */
export function createAuth0Verifier(config: Auth0Config, deps: { keyResolver?: KeyInput } = {}) {
  const keys: KeyInput = deps.keyResolver
    ?? createRemoteJWKSet(new URL(config.jwksUri ?? `${config.issuer}.well-known/jwks.json`));
  const rolesClaim = config.rolesClaim ?? 'https://playfusion/roles';
  const orgClaim = config.orgClaim ?? 'org_id';

  return async function verify(token: string): Promise<Identity> {
    if (!token) throw new UnauthorizedError('missing token');
    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, keys as any, { issuer: config.issuer, audience: config.audience }));
    } catch {
      throw new UnauthorizedError('invalid token');
    }
    const rolesRaw = payload[rolesClaim];
    const roles = Array.isArray(rolesRaw) ? rolesRaw.map(String) : [];
    const org = typeof payload[orgClaim] === 'string' ? (payload[orgClaim] as string) : undefined;
    return { subject: String(payload.sub ?? ''), roles, organizationId: org, source: 'auth0' };
  };
}
