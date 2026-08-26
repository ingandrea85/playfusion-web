import { DomainError } from '@playfusion/platform-lib';

// S19 (O2) — per-tenant membership & roles. Members of an org = users whose organizationId matches
// (no join entity; 1 user = 1 org). Roles: OWNER (billing/brand/members), ORGANIZER (operates
// events), DIRECTOR (records results only). Invariant: an org always keeps >= 1 OWNER.
// NOTE: this registry records the INTENDED roles; token-level RBAC still comes from Auth0 claims.
// Provisioning members into Auth0 (Management API) is deferred (mirrors the mockup's demo-lever design).
export type OrgRole = 'OWNER' | 'ORGANIZER' | 'DIRECTOR';
export const ORG_ROLES: OrgRole[] = ['OWNER', 'ORGANIZER', 'DIRECTOR'];

export interface Member {
  memberId: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrgRole;
  createdAt: string;
}

export interface Invitation {
  invitationId: string;
  organizationId: string;
  name: string;
  email: string;
  role: OrgRole;
  status: 'PENDING' | 'ACCEPTED';
  createdAt: string;
}

const isRole = (r: string): r is OrgRole => (ORG_ROLES as string[]).includes(r);

function validate(input: { name: string; email: string; role: string }): { name: string; email: string; role: OrgRole } {
  const name = input.name.trim();
  const email = input.email.trim();
  if (!name) throw new DomainError('INVALID_MEMBER', 'name is required', 422);
  if (!email) throw new DomainError('INVALID_MEMBER', 'email is required', 422);
  if (!isRole(input.role)) throw new DomainError('INVALID_MEMBER', `role must be one of ${ORG_ROLES.join('/')}`, 422);
  return { name, email, role: input.role };
}

export function makeInvitation(input: { invitationId: string; organizationId: string; name: string; email: string; role: string; createdAt: string }): Invitation {
  const v = validate(input);
  return { invitationId: input.invitationId, organizationId: input.organizationId, ...v, status: 'PENDING', createdAt: input.createdAt };
}

/** A member created by accepting an invitation — same name/email/role, born in the org. */
export function memberFromInvitation(inv: Invitation, memberId: string, createdAt: string): Member {
  return { memberId, organizationId: inv.organizationId, name: inv.name, email: inv.email, role: inv.role, createdAt };
}

/** True when `memberId` is the only OWNER left in `members`. */
export function isLastOwner(members: Member[], memberId: string): boolean {
  const owners = members.filter((m) => m.role === 'OWNER');
  return owners.length === 1 && owners[0]!.memberId === memberId;
}

/** Guard a role change: demoting the last OWNER is forbidden. */
export function assertCanChangeRole(members: Member[], memberId: string, newRole: string): OrgRole {
  if (!isRole(newRole)) throw new DomainError('INVALID_MEMBER', `role must be one of ${ORG_ROLES.join('/')}`, 422);
  const target = members.find((m) => m.memberId === memberId);
  if (target && target.role === 'OWNER' && newRole !== 'OWNER' && isLastOwner(members, memberId)) {
    throw new DomainError('LAST_OWNER', 'an organization must keep at least one owner', 409);
  }
  return newRole;
}

/** Guard a removal: removing the last OWNER is forbidden. */
export function assertCanRemove(members: Member[], memberId: string): void {
  const target = members.find((m) => m.memberId === memberId);
  if (target && target.role === 'OWNER' && isLastOwner(members, memberId)) {
    throw new DomainError('LAST_OWNER', 'an organization must keep at least one owner', 409);
  }
}
