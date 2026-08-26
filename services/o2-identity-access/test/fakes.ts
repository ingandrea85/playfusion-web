import type { MemberRepository, InvitationRepository } from '../src/ports.js';
import type { Member, Invitation } from '../src/membership.js';

export class InMemoryMemberRepository implements MemberRepository {
  readonly items = new Map<string, Member>();
  async listByOrg(organizationId: string) { return [...this.items.values()].filter((m) => m.organizationId === organizationId); }
  async get(memberId: string) { return this.items.get(memberId); }
  async save(member: Member) { this.items.set(member.memberId, member); }
  async delete(memberId: string) { this.items.delete(memberId); }
}

export class InMemoryInvitationRepository implements InvitationRepository {
  readonly items = new Map<string, Invitation>();
  async listByOrg(organizationId: string) { return [...this.items.values()].filter((i) => i.organizationId === organizationId); }
  async get(invitationId: string) { return this.items.get(invitationId); }
  async save(invitation: Invitation) { this.items.set(invitation.invitationId, invitation); }
  async delete(invitationId: string) { this.items.delete(invitationId); }
}
