// O2's token is the shared-kernel magic-link (S2.3): hardened (versioned, expiring,
// timing-safe, optional purpose) and verifiable by other BCs without importing O2 code.
// This module keeps O2's original signToken/verifyToken surface as thin adapters.
import { signMagicLink, verifyMagicLink } from '@playfusion/platform-lib';

export const COACH_ENROLLMENT = 'coach-enrollment';

export function signToken(subject: string, roles: string[], opts: { purpose?: string; ttlSeconds?: number } = {}): string {
  return signMagicLink({ subject, roles, purpose: opts.purpose, ttlSeconds: opts.ttlSeconds });
}

export function verifyToken(token: string): { subject: string; roles: string[] } | null {
  const identity = verifyMagicLink(token);
  return identity ? { subject: identity.subject, roles: identity.roles } : null;
}
