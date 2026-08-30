import { DomainError, checkpoint } from '@playfusion/platform-lib';
import type { MembershipDirectory } from '../ports.js';
import { validateInvite, assertCanChangeRole, assertCanRemove, type Member, type Invitation } from '../membership.js';

type Deps = { directory: MembershipDirectory };

export const listMembers = (d: Deps) => (organizationId: string): Promise<Member[]> => d.directory.listMembers(organizationId);

// S21 admin (platform_admin, cross-tenant).
export const adminListOrganizations = (d: Deps) => () => d.directory.listOrganizations();
export const adminGetOrganization = (d: Deps) => async (organizationId: string): Promise<{ id: string; name: string; members: Member[] }> => {
  const [name, members] = await Promise.all([d.directory.getOrganizationName(organizationId), d.directory.listMembers(organizationId)]);
  return { id: organizationId, name, members };
};
export const listInvitations = (d: Deps) => (organizationId: string): Promise<Invitation[]> => d.directory.listInvitations(organizationId);

/** Invite a member: validate, then create an Auth0 Organization invitation (hosted acceptance). */
export const invite = (d: Deps) => async (cmd: { organizationId: string; name: string; email: string; role: string }): Promise<Invitation> => {
  checkpoint('inviteMember', 'START', { organizationId: cmd.organizationId, role: cmd.role });
  const v = validateInvite(cmd);
  const inv = await d.directory.createInvitation({ organizationId: cmd.organizationId, ...v });
  checkpoint('inviteMember', 'STOP', { invitationId: inv.invitationId });
  return inv;
};

/** Revoke a pending invitation. Idempotent. */
export const revokeInvitation = (d: Deps) => async (organizationId: string, invitationId: string): Promise<void> => {
  await d.directory.revokeInvitation(organizationId, invitationId);
};

export const changeMemberRole = (d: Deps) => async (cmd: { organizationId: string; memberId: string; role: string }): Promise<Member> => {
  checkpoint('changeMemberRole', 'START', { memberId: cmd.memberId, role: cmd.role });
  const members = await d.directory.listMembers(cmd.organizationId);
  if (!members.some((m) => m.memberId === cmd.memberId)) throw new DomainError('MEMBER_NOT_FOUND', `member ${cmd.memberId} does not exist`, 404);
  const role = assertCanChangeRole(members, cmd.memberId, cmd.role); // throws LAST_OWNER / INVALID_MEMBER
  const updated = await d.directory.setMemberRole(cmd.organizationId, cmd.memberId, role);
  checkpoint('changeMemberRole', 'STOP', { memberId: cmd.memberId });
  return updated;
};

export const removeMember = (d: Deps) => async (cmd: { organizationId: string; memberId: string }): Promise<void> => {
  checkpoint('removeMember', 'START', { memberId: cmd.memberId });
  const members = await d.directory.listMembers(cmd.organizationId);
  if (!members.some((m) => m.memberId === cmd.memberId)) throw new DomainError('MEMBER_NOT_FOUND', `member ${cmd.memberId} does not exist`, 404);
  assertCanRemove(members, cmd.memberId); // throws LAST_OWNER
  await d.directory.removeMember(cmd.organizationId, cmd.memberId);
  checkpoint('removeMember', 'STOP', { memberId: cmd.memberId });
};
