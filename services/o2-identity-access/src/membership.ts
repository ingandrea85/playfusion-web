import { DomainError } from '@playfusion/platform-lib';

// T3 (O2) — per-tenant membership & roles backed by **Auth0 Organizations** (single source of truth).
// A member of an org = an Auth0 organization member; roles come from the org member's Auth0 roles.
// Two membership roles only:
//   OWNER     — account owner: billing/brand/members (Auth0 role `tenant_admin`)
//   ORGANIZER — operates events (Auth0 role `organizer`)
// Directors are NOT org members: they enter via the magic-link identity flow (see token.ts), so
// DIRECTOR is not part of the membership model. Invariant: an org always keeps >= 1 OWNER.
export type OrgRole = 'OWNER' | 'ORGANIZER';
export const ORG_ROLES: OrgRole[] = ['OWNER', 'ORGANIZER'];

export interface Member {
  memberId: string;       // Auth0 user_id
  organizationId: string; // Auth0 org id
  name: string;
  email: string;
  role: OrgRole;
  createdAt: string;
}

export interface Invitation {
  invitationId: string;   // Auth0 invitation id
  organizationId: string;
  name: string;
  email: string;
  role: OrgRole;
  status: 'PENDING';      // Auth0 org invitations we surface are always pending (accept/expiry is hosted)
  createdAt: string;
}

const isRole = (r: string): r is OrgRole => (ORG_ROLES as string[]).includes(r);

/** Parse a role string into an OrgRole, or throw INVALID_MEMBER (422). */
export function parseRole(role: string): OrgRole {
  if (!isRole(role)) throw new DomainError('INVALID_MEMBER', `role must be one of ${ORG_ROLES.join('/')}`, 422);
  return role;
}

/** Validate invitation input (trim name/email, check role) before it reaches Auth0. */
export function validateInvite(input: { name: string; email: string; role: string }): { name: string; email: string; role: OrgRole } {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new DomainError('INVALID_MEMBER', 'name is required', 422);
  if (!email) throw new DomainError('INVALID_MEMBER', 'email is required', 422);
  return { name, email, role: parseRole(input.role) };
}

/** True when `memberId` is the only OWNER left in `members`. */
export function isLastOwner(members: Member[], memberId: string): boolean {
  const owners = members.filter((m) => m.role === 'OWNER');
  return owners.length === 1 && owners[0]!.memberId === memberId;
}

/** Guard a role change: demoting the last OWNER is forbidden. */
export function assertCanChangeRole(members: Member[], memberId: string, newRole: string): OrgRole {
  const role = parseRole(newRole);
  const target = members.find((m) => m.memberId === memberId);
  if (target && target.role === 'OWNER' && role !== 'OWNER' && isLastOwner(members, memberId)) {
    throw new DomainError('LAST_OWNER', 'an organization must keep at least one owner', 409);
  }
  return role;
}

/** Guard a removal: removing the last OWNER is forbidden. */
export function assertCanRemove(members: Member[], memberId: string): void {
  const target = members.find((m) => m.memberId === memberId);
  if (target && target.role === 'OWNER' && isLastOwner(members, memberId)) {
    throw new DomainError('LAST_OWNER', 'an organization must keep at least one owner', 409);
  }
}
