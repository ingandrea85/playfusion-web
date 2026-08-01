import { test, expect, beforeAll } from 'vitest';
import { generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { createAuth0Verifier } from '../src/auth0.js';
import { DomainError } from '../src/errors.js';

const ISSUER = 'https://tenant.eu.auth0.com/';
const AUDIENCE = 'https://api.playfusion/';
const ROLES_CLAIM = 'https://playfusion/roles';

let privateKey: KeyLike;
let publicKey: KeyLike;

beforeAll(async () => {
  ({ privateKey, publicKey } = await generateKeyPair('RS256'));
});

async function mint(claims: Record<string, unknown>, over: { issuer?: string; audience?: string; expSecondsFromNow?: number } = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject('auth0|user-1')
    .setIssuer(over.issuer ?? ISSUER)
    .setAudience(over.audience ?? AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${over.expSecondsFromNow ?? 3600}s`)
    .sign(privateKey);
}

function verifier() {
  return createAuth0Verifier({ issuer: ISSUER, audience: AUDIENCE, rolesClaim: ROLES_CLAIM }, { keyResolver: publicKey });
}

test('test_auth0_validTokenYieldsIdentity', async () => {
  const token = await mint({ [ROLES_CLAIM]: ['organizer'], org_id: 'org-42' });
  const id = await verifier()(token);
  expect(id).toEqual({ subject: 'auth0|user-1', roles: ['organizer'], organizationId: 'org-42', source: 'auth0' });
});

test('test_auth0_missingTokenIs401', async () => {
  await expect(verifier()('')).rejects.toMatchObject({ httpStatus: 401 });
});

test('test_auth0_wrongAudienceRejected', async () => {
  const token = await mint({ [ROLES_CLAIM]: ['organizer'] }, { audience: 'https://someone-else/' });
  await expect(verifier()(token)).rejects.toBeInstanceOf(DomainError);
});

test('test_auth0_wrongIssuerRejected', async () => {
  const token = await mint({ [ROLES_CLAIM]: ['organizer'] }, { issuer: 'https://evil.example/' });
  await expect(verifier()(token)).rejects.toMatchObject({ httpStatus: 401 });
});

test('test_auth0_expiredRejected', async () => {
  const token = await mint({ [ROLES_CLAIM]: ['organizer'] }, { expSecondsFromNow: -10 });
  await expect(verifier()(token)).rejects.toMatchObject({ httpStatus: 401 });
});

test('test_auth0_noRolesClaimYieldsEmptyRoles', async () => {
  const token = await mint({});
  const id = await verifier()(token);
  expect(id.roles).toEqual([]);
});
