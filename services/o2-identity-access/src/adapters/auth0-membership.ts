import { DomainError } from '@playfusion/platform-lib';
import type { MembershipDirectory } from '../ports.js';
import type { Member, Invitation, OrgRole } from '../membership.js';

/**
 * Auth0 Organizations membership directory (T3). Thin proxy over the Management API:
 * members + roles + invitations live in Auth0, this adapter maps them to the domain model.
 * Role mapping: OWNER ↔ Auth0 role `tenant_admin`, ORGANIZER ↔ `organizer`.
 */
export interface Auth0MgmtConfig {
  domain: string;          // e.g. dev-c6din8ya.eu.auth0.com
  clientId: string;        // M2M app authorized for the Management API
  clientSecret: string;
  ownerRoleId: string;     // Auth0 role id for tenant_admin
  organizerRoleId: string; // Auth0 role id for organizer
  connectionId: string;    // DB connection enabled on the org (invitations require it)
  inviteClientId: string;  // application client_id the invitation email points at
}

/** Read the Management API config from env; returns undefined when not fully configured. */
export function auth0MgmtConfigFromEnv(env: NodeJS.ProcessEnv = process.env): Auth0MgmtConfig | undefined {
  const c = {
    domain: env.AUTH0_MGMT_DOMAIN,
    clientId: env.AUTH0_MGMT_CLIENT_ID,
    clientSecret: env.AUTH0_MGMT_CLIENT_SECRET,
    ownerRoleId: env.AUTH0_ROLE_OWNER,
    organizerRoleId: env.AUTH0_ROLE_ORGANIZER,
    connectionId: env.AUTH0_ORG_CONNECTION_ID,
    inviteClientId: env.AUTH0_INVITE_CLIENT_ID,
  };
  if (Object.values(c).some((v) => !v)) return undefined;
  return c as Auth0MgmtConfig;
}

type Fetch = typeof fetch;

export class Auth0MembershipDirectory implements MembershipDirectory {
  private token?: { value: string; expiresAt: number };
  private readonly roleName: Record<string, OrgRole>;

  // `now`/`http` are injectable for tests; production uses the globals.
  constructor(
    private readonly cfg: Auth0MgmtConfig,
    private readonly http: Fetch = fetch,
    private readonly now: () => number = () => Date.now(),
  ) {
    this.roleName = { [cfg.ownerRoleId]: 'OWNER', [cfg.organizerRoleId]: 'ORGANIZER' };
  }

  private roleId(role: OrgRole): string { return role === 'OWNER' ? this.cfg.ownerRoleId : this.cfg.organizerRoleId; }
  /** OWNER wins when a member carries both roles. */
  private toRole(roleIds: string[]): OrgRole { return roleIds.includes(this.cfg.ownerRoleId) ? 'OWNER' : 'ORGANIZER'; }

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    const res = await this.http(`https://${this.cfg.domain}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret,
        audience: `https://${this.cfg.domain}/api/v2/`, grant_type: 'client_credentials',
      }),
    });
    if (!res.ok) throw new DomainError('AUTH0_ERROR', `token request failed (${res.status})`, 502);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.http(`https://${this.cfg.domain}/api/v2${path}`, {
      method,
      headers: { authorization: `Bearer ${await this.accessToken()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      const msg = safeMessage(text) ?? `Auth0 ${method} ${path} failed`;
      // Surface Auth0's own status so the browser sees 404/409/422 rather than a blanket 500.
      throw new DomainError('AUTH0_ERROR', msg, res.status >= 400 && res.status < 500 ? res.status : 502);
    }
    return text ? (JSON.parse(text) as T) : (undefined as T);
  }

  async listMembers(organizationId: string): Promise<Member[]> {
    const org = encodeURIComponent(organizationId);
    const raw = await this.api<Array<{ user_id: string; name?: string; email?: string }>>(
      'GET', `/organizations/${org}/members?fields=user_id,name,email&include_fields=true&per_page=100`);
    // N+1 on roles: fine for small orgs (seats capped at 20). One call per member.
    return Promise.all(raw.map(async (u) => {
      const roles = await this.api<Array<{ id: string }>>('GET', `/organizations/${org}/members/${encodeURIComponent(u.user_id)}/roles`);
      return {
        memberId: u.user_id, organizationId, name: u.name ?? u.email ?? u.user_id,
        email: u.email ?? '', role: this.toRole(roles.map((r) => r.id)), createdAt: '',
      };
    }));
  }

  async listInvitations(organizationId: string): Promise<Invitation[]> {
    const org = encodeURIComponent(organizationId);
    const raw = await this.api<Array<{ id: string; invitee: { email: string }; roles?: string[]; created_at: string }>>(
      'GET', `/organizations/${org}/invitations?fields=id,invitee,roles,created_at&include_fields=true&per_page=100`);
    return raw.map((i) => ({
      invitationId: i.id, organizationId, name: i.invitee.email, email: i.invitee.email,
      role: this.toRole(i.roles ?? []), status: 'PENDING', createdAt: i.created_at,
    }));
  }

  async createInvitation(input: { organizationId: string; name: string; email: string; role: OrgRole }): Promise<Invitation> {
    const org = encodeURIComponent(input.organizationId);
    const created = await this.api<{ id: string; created_at: string }>('POST', `/organizations/${org}/invitations`, {
      inviter: { name: 'PlayFusion' },
      invitee: { email: input.email },
      client_id: this.cfg.inviteClientId,
      connection_id: this.cfg.connectionId,
      roles: [this.roleId(input.role)],
      send_invitation_email: true,
    });
    return {
      invitationId: created.id, organizationId: input.organizationId, name: input.name, email: input.email,
      role: input.role, status: 'PENDING', createdAt: created.created_at,
    };
  }

  async revokeInvitation(organizationId: string, invitationId: string): Promise<void> {
    await this.api('DELETE', `/organizations/${encodeURIComponent(organizationId)}/invitations/${encodeURIComponent(invitationId)}`);
  }

  async setMemberRole(organizationId: string, memberId: string, role: OrgRole): Promise<Member> {
    const org = encodeURIComponent(organizationId);
    const member = encodeURIComponent(memberId);
    const keep = this.roleId(role);
    const drop = role === 'OWNER' ? this.cfg.organizerRoleId : this.cfg.ownerRoleId;
    // Single-role model: add the target, remove the other. Add first so a failure never leaves 0 roles.
    await this.api('POST', `/organizations/${org}/members/${member}/roles`, { roles: [keep] });
    await this.api('DELETE', `/organizations/${org}/members/${member}/roles`, { roles: [drop] });
    const user = await this.api<{ user_id: string; name?: string; email?: string }>('GET', `/users/${member}?fields=user_id,name,email&include_fields=true`);
    return { memberId, organizationId, name: user.name ?? user.email ?? memberId, email: user.email ?? '', role, createdAt: '' };
  }

  async removeMember(organizationId: string, memberId: string): Promise<void> {
    await this.api('DELETE', `/organizations/${encodeURIComponent(organizationId)}/members`, { members: [memberId] });
  }
}

function safeMessage(text: string): string | undefined {
  try { return (JSON.parse(text) as { message?: string }).message; } catch { return undefined; }
}
