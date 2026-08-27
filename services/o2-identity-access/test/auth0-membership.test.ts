import { describe, it, expect, vi } from 'vitest';
import { Auth0MembershipDirectory, auth0MgmtConfigFromEnv, type Auth0MgmtConfig } from '../src/adapters/auth0-membership.js';

const cfg: Auth0MgmtConfig = {
  domain: 'tenant.eu.auth0.com', clientId: 'm2m', clientSecret: 'sec',
  ownerRoleId: 'rol_owner', organizerRoleId: 'rol_org', connectionId: 'con_db', inviteClientId: 'spa',
};

// A tiny router over the Management API surface the adapter touches. Returns [status, json].
function fakeHttp(routes: Array<{ m: string; re: RegExp; res: () => [number, unknown] }>) {
  const calls: Array<{ method: string; url: string; body?: any }> = [];
  const http = vi.fn(async (url: string, init?: any) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ method, url, body });
    if (url.endsWith('/oauth/token')) return json(200, { access_token: 'tok', expires_in: 86400 });
    const hit = routes.find((r) => r.m === method && r.re.test(url));
    if (!hit) return json(404, { message: `no route ${method} ${url}` });
    const [status, payload] = hit.res();
    return json(status, payload);
  });
  return { http: http as unknown as typeof fetch, calls };
}
const json = (status: number, payload: unknown) =>
  ({ ok: status >= 200 && status < 300, status, text: async () => (payload === undefined ? '' : JSON.stringify(payload)), json: async () => payload }) as unknown as Response;

describe('auth0MgmtConfigFromEnv', () => {
  it('returns undefined unless every field is present', () => {
    expect(auth0MgmtConfigFromEnv({} as any)).toBeUndefined();
    const full = { AUTH0_MGMT_DOMAIN: 'd', AUTH0_MGMT_CLIENT_ID: 'c', AUTH0_MGMT_CLIENT_SECRET: 's', AUTH0_ROLE_OWNER: 'o', AUTH0_ROLE_ORGANIZER: 'g', AUTH0_ORG_CONNECTION_ID: 'x', AUTH0_INVITE_CLIENT_ID: 'a' };
    expect(auth0MgmtConfigFromEnv(full as any)).toMatchObject({ domain: 'd', ownerRoleId: 'o', connectionId: 'x' });
  });
});

describe('Auth0MembershipDirectory', () => {
  it('lists members and maps roles (tenant_admin→OWNER wins)', async () => {
    const { http } = fakeHttp([
      { m: 'GET', re: /\/members\?/, res: () => [200, [{ user_id: 'u1', name: 'Ann', email: 'a@x' }, { user_id: 'u2', email: 'b@x' }]] },
      { m: 'GET', re: /\/members\/u1\/roles/, res: () => [200, [{ id: 'rol_org' }, { id: 'rol_owner' }]] },
      { m: 'GET', re: /\/members\/u2\/roles/, res: () => [200, [{ id: 'rol_org' }]] },
    ]);
    const dir = new Auth0MembershipDirectory(cfg, http);
    const members = await dir.listMembers('org-1');
    expect(members).toEqual([
      { memberId: 'u1', organizationId: 'org-1', name: 'Ann', email: 'a@x', role: 'OWNER', createdAt: '' },
      { memberId: 'u2', organizationId: 'org-1', name: 'b@x', email: 'b@x', role: 'ORGANIZER', createdAt: '' },
    ]);
  });

  it('creates an invitation with the mapped role id + connection', async () => {
    const { http, calls } = fakeHttp([
      { m: 'POST', re: /\/invitations$/, res: () => [201, { id: 'inv1', created_at: '2026-02-02' }] },
    ]);
    const dir = new Auth0MembershipDirectory(cfg, http);
    const inv = await dir.createInvitation({ organizationId: 'org-1', name: 'Marco', email: 'm@x', role: 'ORGANIZER' });
    expect(inv).toMatchObject({ invitationId: 'inv1', name: 'Marco', email: 'm@x', role: 'ORGANIZER', status: 'PENDING' });
    const post = calls.find((c) => c.method === 'POST' && c.url.includes('/invitations'))!;
    expect(post.body).toMatchObject({ invitee: { email: 'm@x' }, client_id: 'spa', connection_id: 'con_db', roles: ['rol_org'] });
  });

  it('setMemberRole adds the target role then drops the other', async () => {
    const { http, calls } = fakeHttp([
      { m: 'POST', re: /\/members\/u1\/roles/, res: () => [204, undefined] },
      { m: 'DELETE', re: /\/members\/u1\/roles/, res: () => [204, undefined] },
      { m: 'GET', re: /\/users\/u1/, res: () => [200, { user_id: 'u1', name: 'Ann', email: 'a@x' }] },
    ]);
    const dir = new Auth0MembershipDirectory(cfg, http);
    const m = await dir.setMemberRole('org-1', 'u1', 'OWNER');
    expect(m).toMatchObject({ memberId: 'u1', role: 'OWNER', email: 'a@x' });
    expect(calls.find((c) => c.method === 'POST' && c.url.includes('/roles'))!.body).toEqual({ roles: ['rol_owner'] });
    expect(calls.find((c) => c.method === 'DELETE' && c.url.includes('/roles'))!.body).toEqual({ roles: ['rol_org'] });
  });

  it('surfaces Auth0 4xx status (e.g. 409) as the error status', async () => {
    const { http } = fakeHttp([
      { m: 'DELETE', re: /\/members$/, res: () => [409, { message: 'conflict' }] },
    ]);
    const dir = new Auth0MembershipDirectory(cfg, http);
    await expect(dir.removeMember('org-1', 'u1')).rejects.toMatchObject({ httpStatus: 409, message: 'conflict' });
  });

  it('caches the management token across calls', async () => {
    const { http, calls } = fakeHttp([
      { m: 'GET', re: /\/invitations\?/, res: () => [200, []] },
    ]);
    const dir = new Auth0MembershipDirectory(cfg, http);
    await dir.listInvitations('org-1');
    await dir.listInvitations('org-1');
    expect(calls.filter((c) => c.url.endsWith('/oauth/token')).length).toBe(1);
  });
});
