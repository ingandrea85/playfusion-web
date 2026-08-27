import type { MembershipDirectory } from '../src/ports.js';
import type { Member, Invitation, OrgRole } from '../src/membership.js';

/** In-memory membership directory standing in for Auth0 Organizations in tests. */
export class FakeMembershipDirectory implements MembershipDirectory {
  readonly members = new Map<string, Member>();       // key = memberId
  readonly invitations = new Map<string, Invitation>(); // key = invitationId
  private seq = 0;

  constructor(seed: { members?: Member[]; invitations?: Invitation[] } = {}) {
    for (const m of seed.members ?? []) this.members.set(m.memberId, m);
    for (const i of seed.invitations ?? []) this.invitations.set(i.invitationId, i);
  }

  async listMembers(organizationId: string) { return [...this.members.values()].filter((m) => m.organizationId === organizationId); }
  async listInvitations(organizationId: string) { return [...this.invitations.values()].filter((i) => i.organizationId === organizationId); }

  async createInvitation(input: { organizationId: string; name: string; email: string; role: OrgRole }) {
    const inv: Invitation = { invitationId: `inv-${++this.seq}`, ...input, status: 'PENDING', createdAt: '2026-01-01T00:00:00.000Z' };
    this.invitations.set(inv.invitationId, inv);
    return inv;
  }
  async revokeInvitation(_organizationId: string, invitationId: string) { this.invitations.delete(invitationId); }

  async setMemberRole(_organizationId: string, memberId: string, role: OrgRole) {
    const m = this.members.get(memberId)!;
    const updated = { ...m, role };
    this.members.set(memberId, updated);
    return updated;
  }
  async removeMember(_organizationId: string, memberId: string) { this.members.delete(memberId); }
}
