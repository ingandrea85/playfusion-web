import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E (S19 · O2 membership): an organizer invites members, accepts (demo), manages roles;
// the >=1-OWNER invariant blocks demoting/removing the sole owner. Skip-gated on API_BASE_URL.
// Uses a throwaway org id so it never collides with real tenant data.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const org = `e2e-mbr-${randomUUID().slice(0, 8)}`;
const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': org, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, b?: unknown, h: Record<string, string> = {}) => req('POST', p, b, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
const put = (p: string, b?: unknown, h: Record<string, string> = {}) => req('PUT', p, b, h);
const del = (p: string, h: Record<string, string> = {}) => req('DELETE', p, undefined, h);
async function token(roles: string[]): Promise<string> {
  return (await j(await post('/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles }))).token as string;
}

run('test_e2e_membership_inviteAcceptRolesGuard', async () => {
  const auth = { authorization: await token(['RegistrationManager']) };
  const base = `/o2/organizations/${org}`;

  // invite an OWNER and an ORGANIZER, accept both
  const ownerInv = await j(await post(`${base}/invitations`, { name: 'Andrea', email: 'a@x.io', role: 'OWNER' }, auth));
  const orgInv = await j(await post(`${base}/invitations`, { name: 'Marco', email: 'm@x.io', role: 'ORGANIZER' }, auth));
  const owner = await j(await post(`/o2/invitations/${ownerInv.invitationId}/accept`, undefined, auth));
  await post(`/o2/invitations/${orgInv.invitationId}/accept`, undefined, auth);

  const members = await j(await get(`${base}/members`, auth));
  expect(members).toHaveLength(2);
  expect(members.filter((m: any) => m.role === 'OWNER')).toHaveLength(1);

  // last-OWNER invariant: demoting / removing the sole owner is rejected
  expect((await put(`/o2/members/${owner.memberId}/role`, { role: 'ORGANIZER' }, auth)).status).toBe(409);
  expect((await del(`/o2/members/${owner.memberId}`, auth)).status).toBe(409);

  // promoting the organizer to owner then demoting the first owner is allowed
  const orgMember = members.find((m: any) => m.role === 'ORGANIZER');
  expect((await put(`/o2/members/${orgMember.memberId}/role`, { role: 'OWNER' }, auth)).status).toBe(200);
  expect((await put(`/o2/members/${owner.memberId}/role`, { role: 'DIRECTOR' }, auth)).status).toBe(200);

  // revoke a fresh pending invitation
  const toRevoke = await j(await post(`${base}/invitations`, { name: 'Giulia', email: 'g@x.io', role: 'DIRECTOR' }, auth));
  expect((await del(`/o2/invitations/${toRevoke.invitationId}`, auth)).status).toBe(204);
  const pending = (await j(await get(`${base}/invitations`, auth))).filter((i: any) => i.status === 'PENDING');
  expect(pending.find((i: any) => i.invitationId === toRevoke.invitationId)).toBeUndefined();
}, 120_000);
