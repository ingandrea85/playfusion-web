import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Identity } from './identity.js';

// Shared-kernel magic-link token (S2.3). O2 mints it for password-less enrollment;
// consumers verify it against the same shared secret without importing O2 code
// (ADR-002). Hardened over the pilot's token: versioned, expiring, timing-safe compare,
// optional purpose binding. Symmetric HMAC (single issuer = O2); organizer login uses
// asymmetric Auth0 JWTs instead (see auth0.ts).
const secret = () => process.env.PF_TOKEN_SECRET ?? 'dev-secret';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type MagicLinkClaims = {
  subject: string;
  roles?: string[];
  organizationId?: string;
  purpose?: string;
  ttlSeconds?: number;
  now?: number; // seconds; injectable for tests
};

type Payload = { v: 1; sub: string; roles: string[]; org?: string; purpose?: string; iat: number; exp: number };

export function signMagicLink(claims: MagicLinkClaims): string {
  const iat = claims.now ?? Math.floor(Date.now() / 1000);
  const payload: Payload = {
    v: 1, sub: claims.subject, roles: claims.roles ?? [], org: claims.organizationId,
    purpose: claims.purpose, iat, exp: iat + (claims.ttlSeconds ?? DEFAULT_TTL_SECONDS),
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMagicLink(token: string, opts: { purpose?: string; now?: number } = {}): Identity | null {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = createHmac('sha256', secret()).update(body).digest('base64url');
  const given = Buffer.from(sig);
  const want = Buffer.from(expected);
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  let payload: Payload;
  try { payload = JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
  if (payload.v !== 1 || typeof payload.exp !== 'number') return null;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  if (opts.purpose && payload.purpose !== opts.purpose) return null;
  return { subject: payload.sub, roles: payload.roles ?? [], organizationId: payload.org, source: 'magic-link' };
}
