import type { Identity } from './identity.js';
import { verifyMagicLink } from './magic-link.js';
import { UnauthorizedError, ForbiddenError } from './errors.js';

// A structural Hono-style middleware — typed loosely so platform-lib stays free of a
// hono dependency. `c` is the Hono context; `next` continues the chain.
type Ctx = { req: { header(name: string): string | undefined }; set(key: string, value: unknown): void; get(key: string): unknown };
type Middleware = (c: Ctx, next: () => Promise<unknown>) => Promise<unknown>;

const IDENTITY_KEY = 'identity';
export const getIdentity = (c: Ctx): Identity | undefined => c.get(IDENTITY_KEY) as Identity | undefined;

/** Extract the bearer token. Accepts `authorization` (normal callers) or `x-approver-token`
 *  — Step Functions' `apigateway:invoke` forbids the reserved `authorization` header. */
export function bearerToken(c: Ctx): string {
  const raw = c.req.header('authorization') ?? c.req.header('x-approver-token') ?? '';
  return raw.startsWith('Bearer ') ? raw.slice(7) : raw;
}

export type Auth0Verify = (token: string) => Promise<Identity>;

/**
 * S2.4 — organizer routes. Dual-accept during the Auth0 rollout: an Auth0 organizer JWT
 * (the real path) OR an O2 magic-link carrying the RegistrationManager role (transitional
 * bridge that keeps the deployed SFN + pilot green until the tenant exists). 401 when no
 * usable credential is present; 403 when a valid credential lacks the organizer role.
 */
export function requireOrganizer(opts: { auth0?: Auth0Verify; organizerRole?: string; managerRole?: string } = {}): Middleware {
  const organizerRole = opts.organizerRole ?? 'organizer';
  const managerRole = opts.managerRole ?? 'RegistrationManager';
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token) throw new UnauthorizedError('missing token');
    // Bridge path: an O2 magic-link with the manager role.
    const magic = verifyMagicLink(token);
    if (magic) {
      if (!magic.roles.includes(managerRole)) throw new ForbiddenError('actor lacks the organizer role');
      c.set(IDENTITY_KEY, magic);
      return next();
    }
    // Real path: an Auth0 organizer JWT (only when configured).
    if (opts.auth0) {
      const identity = await opts.auth0(token); // throws UnauthorizedError on bad token
      if (!identity.roles.includes(organizerRole)) throw new ForbiddenError('actor lacks the organizer role');
      c.set(IDENTITY_KEY, identity);
      return next();
    }
    throw new UnauthorizedError('invalid token');
  };
}

/**
 * Platform-admin routes (global, cross-tenant) — e.g. the custom finals-format catalog. Requires a
 * valid Auth0 JWT carrying the `platform_admin` role. No magic-link bridge (this is not an
 * organizer/tenant capability). 401 without a usable token; 403 when the role is missing.
 */
export function requirePlatformAdmin(opts: { auth0?: Auth0Verify; adminRole?: string } = {}): Middleware {
  const adminRole = opts.adminRole ?? 'platform_admin';
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token || !opts.auth0) throw new UnauthorizedError('missing token');
    const identity = await opts.auth0(token); // throws UnauthorizedError on bad token
    if (!identity.roles.includes(adminRole)) throw new ForbiddenError('actor is not a platform admin');
    c.set(IDENTITY_KEY, identity);
    return next();
  };
}

/**
 * T4 — organization-owner routes (billing, brand, members). Requires a valid Auth0 JWT carrying the
 * `tenant_admin` (OWNER) role. No magic-link bridge: ownership is a real Auth0 tenant capability, not
 * an operational one. 401 without a usable token; 403 when the owner role is missing (e.g. an
 * ORGANIZER hitting an owner-only endpoint).
 */
export function requireOwner(opts: { auth0?: Auth0Verify; ownerRole?: string } = {}): Middleware {
  const ownerRole = opts.ownerRole ?? 'tenant_admin';
  return async (c, next) => {
    const token = bearerToken(c);
    if (!token || !opts.auth0) throw new UnauthorizedError('missing token');
    const identity = await opts.auth0(token); // throws UnauthorizedError on bad token
    if (!identity.roles.includes(ownerRole)) throw new ForbiddenError('actor is not an organization owner');
    c.set(IDENTITY_KEY, identity);
    return next();
  };
}

/**
 * S2.4 — coach routes (apply). Possession of a valid O2 magic-link is the capability;
 * no role is required. 401 when missing or invalid.
 */
export function requireMagicLink(opts: { purpose?: string } = {}): Middleware {
  return async (c, next) => {
    const identity = verifyMagicLink(bearerToken(c), { purpose: opts.purpose });
    if (!identity) throw new UnauthorizedError('missing or invalid magic-link');
    c.set(IDENTITY_KEY, identity);
    return next();
  };
}
