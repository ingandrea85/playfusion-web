import { describe, it, expect } from 'vitest';
import { makeInvitation, isLastOwner, assertCanChangeRole, assertCanRemove, type Member } from '../src/membership.js';
import { InMemoryMemberRepository, InMemoryInvitationRepository } from './fakes.js';
import { invite, acceptInvitation, revokeInvitation, changeMemberRole, removeMember, listMembers } from '../src/application/membership.js';

const member = (memberId: string, role: Member['role'], org = 'org-1'): Member =>
  ({ memberId, organizationId: org, name: memberId, email: `${memberId}@x.io`, role, createdAt: 't' });

describe('membership domain', () => {
  it('test_makeInvitation_validatesAndDefaultsPending', () => {
    const inv = makeInvitation({ invitationId: 'i1', organizationId: 'org-1', name: ' Marco ', email: ' m@x.io ', role: 'ORGANIZER', createdAt: 't' });
    expect(inv).toMatchObject({ name: 'Marco', email: 'm@x.io', role: 'ORGANIZER', status: 'PENDING' });
  });
  it('test_makeInvitation_rejectsUnknownRole', () => {
    expect(() => makeInvitation({ invitationId: 'i', organizationId: 'o', name: 'x', email: 'x@x', role: 'ADMIN', createdAt: 't' })).toThrowError(/role must be one of/);
  });
  it('test_isLastOwner_trueOnlyForTheSoleOwner', () => {
    const ms = [member('a', 'OWNER'), member('b', 'ORGANIZER')];
    expect(isLastOwner(ms, 'a')).toBe(true);
    expect(isLastOwner([member('a', 'OWNER'), member('b', 'OWNER')], 'a')).toBe(false);
  });
  it('test_assertCanChangeRole_blocksDemotingLastOwner', () => {
    const ms = [member('a', 'OWNER'), member('b', 'ORGANIZER')];
    expect(() => assertCanChangeRole(ms, 'a', 'ORGANIZER')).toThrowError(/at least one owner/);
    expect(assertCanChangeRole([member('a', 'OWNER'), member('b', 'OWNER')], 'a', 'ORGANIZER')).toBe('ORGANIZER');
  });
  it('test_assertCanRemove_blocksRemovingLastOwner', () => {
    expect(() => assertCanRemove([member('a', 'OWNER')], 'a')).toThrowError(/at least one owner/);
  });
});

describe('membership application', () => {
  const deps = () => ({ members: new InMemoryMemberRepository(), invitations: new InMemoryInvitationRepository(), now: () => '2026-01-01T00:00:00.000Z' });

  it('test_invite_thenAccept_createsMemberAndMarksAccepted', async () => {
    const d = deps();
    const inv = await invite(d)({ invitationId: 'i1', organizationId: 'org-1', name: 'Marco', email: 'm@x.io', role: 'ORGANIZER' });
    expect(inv.status).toBe('PENDING');
    const m = await acceptInvitation(d)({ invitationId: 'i1', memberId: 'usr-1' });
    expect(m).toMatchObject({ memberId: 'usr-1', name: 'Marco', role: 'ORGANIZER', organizationId: 'org-1' });
    expect((await d.invitations.get('i1'))!.status).toBe('ACCEPTED');
    expect((await listMembers(d)('org-1')).map((x) => x.memberId)).toEqual(['usr-1']);
  });

  it('test_accept_throwsForUnknownInvitation', async () => {
    await expect(acceptInvitation(deps())({ invitationId: 'nope', memberId: 'm' })).rejects.toThrowError(/does not exist/);
  });

  it('test_revoke_removesPendingInvitation', async () => {
    const d = deps();
    await invite(d)({ invitationId: 'i1', organizationId: 'org-1', name: 'X', email: 'x@x', role: 'DIRECTOR' });
    await revokeInvitation(d)('i1');
    expect(await d.invitations.get('i1')).toBeUndefined();
  });

  it('test_changeMemberRole_blockedForSoleOwner', async () => {
    const d = deps();
    await d.members.save(member('owner', 'OWNER'));
    await expect(changeMemberRole(d)({ memberId: 'owner', role: 'ORGANIZER' })).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('test_changeMemberRole_succeedsWhenAnotherOwnerExists', async () => {
    const d = deps();
    await d.members.save(member('o1', 'OWNER'));
    await d.members.save(member('o2', 'OWNER'));
    const updated = await changeMemberRole(d)({ memberId: 'o1', role: 'DIRECTOR' });
    expect(updated.role).toBe('DIRECTOR');
  });

  it('test_removeMember_blockedForSoleOwnerButOkForOthers', async () => {
    const d = deps();
    await d.members.save(member('owner', 'OWNER'));
    await d.members.save(member('org', 'ORGANIZER'));
    await expect(removeMember(d)('owner')).rejects.toMatchObject({ httpStatus: 409 });
    await removeMember(d)('org');
    expect(await d.members.get('org')).toBeUndefined();
  });

  it('test_removeMember_throwsForUnknownMember', async () => {
    await expect(removeMember(deps())('ghost')).rejects.toThrowError(/does not exist/);
  });
});
