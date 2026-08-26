import type { Member, Invitation } from './membership.js';

export interface MemberRepository {
  listByOrg(organizationId: string): Promise<Member[]>;
  get(memberId: string): Promise<Member | undefined>;
  save(member: Member): Promise<void>;
  delete(memberId: string): Promise<void>;
}

export interface InvitationRepository {
  listByOrg(organizationId: string): Promise<Invitation[]>;
  get(invitationId: string): Promise<Invitation | undefined>;
  save(invitation: Invitation): Promise<void>;
  delete(invitationId: string): Promise<void>;
}
