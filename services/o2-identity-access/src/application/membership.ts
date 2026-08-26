import { DomainError, checkpoint } from '@playfusion/platform-lib';
import type { MemberRepository, InvitationRepository } from '../ports.js';
import { makeInvitation, memberFromInvitation, assertCanChangeRole, assertCanRemove, type Member, type Invitation } from '../membership.js';

type Deps = { members: MemberRepository; invitations: InvitationRepository; now?: () => string };
const clock = (d: Deps) => (d.now ?? (() => new Date().toISOString()))();

export const listMembers = (d: Deps) => (organizationId: string): Promise<Member[]> => d.members.listByOrg(organizationId);
export const listInvitations = (d: Deps) => (organizationId: string): Promise<Invitation[]> => d.invitations.listByOrg(organizationId);

export const invite = (d: Deps) => async (cmd: { invitationId: string; organizationId: string; name: string; email: string; role: string }): Promise<Invitation> => {
  checkpoint('inviteMember', 'START', { organizationId: cmd.organizationId, role: cmd.role });
  const inv = makeInvitation({ ...cmd, createdAt: clock(d) });
  await d.invitations.save(inv);
  checkpoint('inviteMember', 'STOP', { invitationId: inv.invitationId });
  return inv;
};

/** Demo lever: accept a PENDING invitation → create the member, mark the invitation ACCEPTED. */
export const acceptInvitation = (d: Deps) => async (cmd: { invitationId: string; memberId: string }): Promise<Member> => {
  checkpoint('acceptInvitation', 'START', { invitationId: cmd.invitationId });
  const inv = await d.invitations.get(cmd.invitationId);
  if (!inv) throw new DomainError('INVITATION_NOT_FOUND', `invitation ${cmd.invitationId} does not exist`, 404);
  const member = memberFromInvitation(inv, cmd.memberId, clock(d));
  await d.members.save(member);
  await d.invitations.save({ ...inv, status: 'ACCEPTED' });
  checkpoint('acceptInvitation', 'STOP', { memberId: member.memberId });
  return member;
};

/** Revoke a pending invitation. Idempotent. */
export const revokeInvitation = (d: Deps) => async (invitationId: string): Promise<void> => {
  await d.invitations.delete(invitationId);
};

export const changeMemberRole = (d: Deps) => async (cmd: { memberId: string; role: string }): Promise<Member> => {
  checkpoint('changeMemberRole', 'START', { memberId: cmd.memberId, role: cmd.role });
  const member = await d.members.get(cmd.memberId);
  if (!member) throw new DomainError('MEMBER_NOT_FOUND', `member ${cmd.memberId} does not exist`, 404);
  const members = await d.members.listByOrg(member.organizationId);
  const role = assertCanChangeRole(members, cmd.memberId, cmd.role); // throws LAST_OWNER / INVALID_MEMBER
  const updated = { ...member, role };
  await d.members.save(updated);
  checkpoint('changeMemberRole', 'STOP', { memberId: cmd.memberId });
  return updated;
};

export const removeMember = (d: Deps) => async (memberId: string): Promise<void> => {
  checkpoint('removeMember', 'START', { memberId });
  const member = await d.members.get(memberId);
  if (!member) throw new DomainError('MEMBER_NOT_FOUND', `member ${memberId} does not exist`, 404);
  const members = await d.members.listByOrg(member.organizationId);
  assertCanRemove(members, memberId); // throws LAST_OWNER
  await d.members.delete(memberId);
  checkpoint('removeMember', 'STOP', { memberId });
};
