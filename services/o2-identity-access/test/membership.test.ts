import { describe, it, expect } from 'vitest';
import { validateInvite, parseRole, isLastOwner, assertCanChangeRole, assertCanRemove, type Member } from '../src/membership.js';
import { FakeMembershipDirectory } from './fakes.js';
import { invite, revokeInvitation, changeMemberRole, removeMember, listMembers, listInvitations } from '../src/application/membership.js';

const member = (memberId: string, role: Member['role'], org = 'org-1'): Member =>
  ({ memberId, organizationId: org, name: memberId, email: `${memberId}@x.io`, role, createdAt: 't' });

describe('membership domain', () => {
  it('test_validateInvite_trimsAndChecksRole', () => {
    expect(validateInvite({ name: ' Marco ', email: ' m@x.io ', role: 'ORGANIZER' })).toEqual({ name: 'Marco', email: 'm@x.io', role: 'ORGANIZER' });
  });
  it('test_parseRole_rejectsUnknownAndDirector', () => {
    expect(() => parseRole('ADMIN')).toThrowError(/role must be one of/);
    // DIRECTOR is no longer a membership role (directors use the magic link)
    expect(() => parseRole('DIRECTOR')).toThrowError(/role must be one of/);
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

describe('membership application (Auth0-backed directory)', () => {
  const deps = (seed: { members?: Member[]; invitations?: any[] } = {}) => ({ directory: new FakeMembershipDirectory(seed) });

  it('test_invite_createsPendingInvitation', async () => {
    const d = deps();
    const inv = await invite(d)({ organizationId: 'org-1', name: 'Marco', email: 'm@x.io', role: 'ORGANIZER' });
    expect(inv).toMatchObject({ organizationId: 'org-1', name: 'Marco', email: 'm@x.io', role: 'ORGANIZER', status: 'PENDING' });
    expect((await listInvitations(d)('org-1')).map((x) => x.invitationId)).toEqual([inv.invitationId]);
  });

  it('test_invite_rejectsUnknownRole', async () => {
    await expect(invite(deps())({ organizationId: 'org-1', name: 'X', email: 'x@x', role: 'DIRECTOR' })).rejects.toThrowError(/role must be one of/);
  });

  it('test_revoke_removesPendingInvitation', async () => {
    const d = deps();
    const inv = await invite(d)({ organizationId: 'org-1', name: 'X', email: 'x@x', role: 'ORGANIZER' });
    await revokeInvitation(d)('org-1', inv.invitationId);
    expect(await listInvitations(d)('org-1')).toEqual([]);
  });

  it('test_changeMemberRole_blockedForSoleOwner', async () => {
    const d = deps({ members: [member('owner', 'OWNER')] });
    await expect(changeMemberRole(d)({ organizationId: 'org-1', memberId: 'owner', role: 'ORGANIZER' })).rejects.toMatchObject({ httpStatus: 409 });
  });

  it('test_changeMemberRole_succeedsWhenAnotherOwnerExists', async () => {
    const d = deps({ members: [member('o1', 'OWNER'), member('o2', 'OWNER')] });
    const updated = await changeMemberRole(d)({ organizationId: 'org-1', memberId: 'o1', role: 'ORGANIZER' });
    expect(updated.role).toBe('ORGANIZER');
  });

  it('test_changeMemberRole_throwsForUnknownMember', async () => {
    await expect(changeMemberRole(deps())({ organizationId: 'org-1', memberId: 'ghost', role: 'ORGANIZER' })).rejects.toMatchObject({ httpStatus: 404 });
  });

  it('test_removeMember_blockedForSoleOwnerButOkForOthers', async () => {
    const d = deps({ members: [member('owner', 'OWNER'), member('org', 'ORGANIZER')] });
    await expect(removeMember(d)({ organizationId: 'org-1', memberId: 'owner' })).rejects.toMatchObject({ httpStatus: 409 });
    await removeMember(d)({ organizationId: 'org-1', memberId: 'org' });
    expect((await listMembers(d)('org-1')).map((m) => m.memberId)).toEqual(['owner']);
  });

  it('test_removeMember_throwsForUnknownMember', async () => {
    await expect(removeMember(deps())({ organizationId: 'org-1', memberId: 'ghost' })).rejects.toMatchObject({ httpStatus: 404 });
  });
});
