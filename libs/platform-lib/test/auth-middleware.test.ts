import { test, expect } from 'vitest';
import { requireOrganizer, requireOwner, requireMagicLink, getIdentity } from '../src/auth-middleware.js';
import { signMagicLink } from '../src/magic-link.js';
import type { Identity } from '../src/identity.js';

// Minimal Hono-style context double.
function ctx(headers: Record<string, string> = {}) {
  const store: Record<string, unknown> = {};
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    req: { header: (n: string) => lower[n.toLowerCase()] },
    set: (k: string, v: unknown) => { store[k] = v; },
    get: (k: string) => store[k],
  };
}
const run = async (mw: any, c: any) => { let called = false; await mw(c, async () => { called = true; }); return called; };

test('test_requireOrganizer_noTokenIs401', async () => {
  await expect(run(requireOrganizer(), ctx())).rejects.toMatchObject({ httpStatus: 401 });
});

test('test_requireOrganizer_magicLinkWithoutManagerRoleIs403', async () => {
  const token = signMagicLink({ subject: 'coach', roles: ['coach'] });
  await expect(run(requireOrganizer(), ctx({ authorization: token }))).rejects.toMatchObject({ httpStatus: 403 });
});

test('test_requireOrganizer_managerBridgeTokenPasses', async () => {
  const token = signMagicLink({ subject: 'mgr', roles: ['RegistrationManager'] });
  const c = ctx({ authorization: token });
  expect(await run(requireOrganizer(), c)).toBe(true);
  expect(getIdentity(c as any)?.source).toBe('magic-link');
});

test('test_requireOrganizer_acceptsApproverTokenHeader', async () => {
  const token = signMagicLink({ subject: 'mgr', roles: ['RegistrationManager'] });
  expect(await run(requireOrganizer(), ctx({ 'x-approver-token': token }))).toBe(true);
});

test('test_requireOrganizer_auth0OrganizerPasses', async () => {
  const identity: Identity = { subject: 'auth0|1', roles: ['organizer'], organizationId: 'org-1', source: 'auth0' };
  const auth0 = async (_t: string) => identity;
  const c = ctx({ authorization: 'a.real.jwt' });
  expect(await run(requireOrganizer({ auth0 }), c)).toBe(true);
  expect(getIdentity(c as any)).toEqual(identity);
});

test('test_requireOrganizer_auth0NonOrganizerIs403', async () => {
  const auth0 = async (_t: string): Promise<Identity> => ({ subject: 'auth0|1', roles: ['viewer'], source: 'auth0' });
  await expect(run(requireOrganizer({ auth0 }), ctx({ authorization: 'a.real.jwt' }))).rejects.toMatchObject({ httpStatus: 403 });
});

test('test_requireOrganizer_ownerIsAlsoOrganizer', async () => {
  // A fresh sign-up owner carries only tenant_admin — must still pass organizer routes.
  const identity: Identity = { subject: 'auth0|1', roles: ['tenant_admin'], organizationId: 'org-1', source: 'auth0' };
  const c = ctx({ authorization: 'a.real.jwt' });
  expect(await run(requireOrganizer({ auth0: async () => identity }), c)).toBe(true);
  expect(getIdentity(c as any)).toEqual(identity);
});

test('test_requireOrganizer_platformAdminPassesOnlyWhenAllowed', async () => {
  const identity: Identity = { subject: 'auth0|a', roles: ['platform_admin'], source: 'auth0' };
  const auth0 = async () => identity;
  // opt-in: allowed
  expect(await run(requireOrganizer({ auth0, allowPlatformAdmin: true }), ctx({ authorization: 'jwt' }))).toBe(true);
  // default: a platform admin is NOT an organizer of the org
  await expect(run(requireOrganizer({ auth0 }), ctx({ authorization: 'jwt' }))).rejects.toMatchObject({ httpStatus: 403 });
});

test('test_requireOwner_ownerRolePasses', async () => {
  const identity: Identity = { subject: 'auth0|1', roles: ['organizer', 'tenant_admin'], organizationId: 'org-1', source: 'auth0' };
  const c = ctx({ authorization: 'a.real.jwt' });
  expect(await run(requireOwner({ auth0: async () => identity }), c)).toBe(true);
  expect(getIdentity(c as any)).toEqual(identity);
});

test('test_requireOwner_organizerWithoutOwnerRoleIs403', async () => {
  const auth0 = async (_t: string): Promise<Identity> => ({ subject: 'auth0|1', roles: ['organizer'], source: 'auth0' });
  await expect(run(requireOwner({ auth0 }), ctx({ authorization: 'a.real.jwt' }))).rejects.toMatchObject({ httpStatus: 403 });
});

test('test_requireOwner_noTokenOrNoVerifierIs401_noMagicLinkBridge', async () => {
  await expect(run(requireOwner(), ctx())).rejects.toMatchObject({ httpStatus: 401 });
  // Even a valid manager magic-link is NOT accepted as owner (no bridge).
  const mgr = signMagicLink({ subject: 'mgr', roles: ['RegistrationManager'] });
  await expect(run(requireOwner(), ctx({ authorization: mgr }))).rejects.toMatchObject({ httpStatus: 401 });
});

test('test_requireMagicLink_validPasses_invalid401', async () => {
  const token = signMagicLink({ subject: 'coach', roles: [] });
  expect(await run(requireMagicLink(), ctx({ authorization: token }))).toBe(true);
  await expect(run(requireMagicLink(), ctx({ authorization: 'garbage' }))).rejects.toMatchObject({ httpStatus: 401 });
  await expect(run(requireMagicLink(), ctx())).rejects.toMatchObject({ httpStatus: 401 });
});
