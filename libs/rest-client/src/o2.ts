import { request, type HttpConfig } from './http.js'
import { bearer } from './auth.js'
import type { MagicLinkInput, MagicLinkResult, VerifyResult, Member, Invitation, OrgRole, InviteMemberInput } from './types.js'
export interface O2Api {
  mintMagicLink(input: MagicLinkInput): Promise<MagicLinkResult>
  verify(token: string): Promise<VerifyResult>
  // S19 membership & roles
  listMembers(orgId: string): Promise<Member[]>
  listInvitations(orgId: string): Promise<Invitation[]>
  inviteMember(orgId: string, input: InviteMemberInput): Promise<Invitation>
  acceptInvitation(invitationId: string): Promise<Member>
  revokeInvitation(invitationId: string): Promise<void>
  changeMemberRole(memberId: string, role: OrgRole): Promise<Member>
  removeMember(memberId: string): Promise<void>
}
export const o2 = (cfg: HttpConfig): O2Api => ({
  mintMagicLink: (input) => request(cfg, 'POST', '/o2/identities/magic-link', input),
  // GET /o2/identities/verify reads the Authorization header; pass the token as a one-shot auth override.
  verify: (token) => request({ ...cfg, auth: () => bearer(token) }, 'GET', '/o2/identities/verify'),
  listMembers: (orgId) => request(cfg, 'GET', `/o2/organizations/${encodeURIComponent(orgId)}/members`),
  listInvitations: (orgId) => request(cfg, 'GET', `/o2/organizations/${encodeURIComponent(orgId)}/invitations`),
  inviteMember: (orgId, input) => request(cfg, 'POST', `/o2/organizations/${encodeURIComponent(orgId)}/invitations`, input),
  acceptInvitation: (id) => request(cfg, 'POST', `/o2/invitations/${encodeURIComponent(id)}/accept`),
  revokeInvitation: (id) => request(cfg, 'DELETE', `/o2/invitations/${encodeURIComponent(id)}`),
  changeMemberRole: (memberId, role) => request(cfg, 'PUT', `/o2/members/${encodeURIComponent(memberId)}/role`, { role }),
  removeMember: (memberId) => request(cfg, 'DELETE', `/o2/members/${encodeURIComponent(memberId)}`),
})
