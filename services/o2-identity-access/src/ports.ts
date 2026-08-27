import type { Member, Invitation, OrgRole } from './membership.js';

/**
 * The membership directory: the org's members + invitations, backed by Auth0 Organizations.
 * The application layer enforces the last-owner invariant on top of these primitives, so the
 * adapter stays a thin proxy over the Management API (and a fake in tests).
 */
export interface MembershipDirectory {
  listMembers(organizationId: string): Promise<Member[]>;
  listInvitations(organizationId: string): Promise<Invitation[]>;
  createInvitation(input: { organizationId: string; name: string; email: string; role: OrgRole }): Promise<Invitation>;
  revokeInvitation(organizationId: string, invitationId: string): Promise<void>;
  setMemberRole(organizationId: string, memberId: string, role: OrgRole): Promise<Member>;
  removeMember(organizationId: string, memberId: string): Promise<void>;
}
