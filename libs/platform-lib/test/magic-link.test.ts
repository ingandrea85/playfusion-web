import { test, expect } from 'vitest';
import { signMagicLink, verifyMagicLink } from '../src/magic-link.js';

test('test_magicLink_roundTripsClaims', () => {
  const token = signMagicLink({ subject: 'coach-1', roles: ['coach'], organizationId: 'org-1' });
  expect(verifyMagicLink(token)).toEqual({ subject: 'coach-1', roles: ['coach'], organizationId: 'org-1', source: 'magic-link' });
});

test('test_magicLink_tamperedSignatureRejected', () => {
  expect(verifyMagicLink(signMagicLink({ subject: 'x' }) + 'z')).toBeNull();
});

test('test_magicLink_malformedRejected', () => {
  expect(verifyMagicLink('')).toBeNull();
  expect(verifyMagicLink('no-dot')).toBeNull();
});

test('test_magicLink_expiredRejected', () => {
  const token = signMagicLink({ subject: 'x', ttlSeconds: 10, now: 1_000 });
  expect(verifyMagicLink(token, { now: 1_005 })).not.toBeNull(); // still valid
  expect(verifyMagicLink(token, { now: 2_000 })).toBeNull();     // past exp
});

test('test_magicLink_purposeMismatchRejected', () => {
  const token = signMagicLink({ subject: 'x', purpose: 'coach-enrollment' });
  expect(verifyMagicLink(token, { purpose: 'coach-enrollment' })).not.toBeNull();
  expect(verifyMagicLink(token, { purpose: 'password-reset' })).toBeNull();
});

test('test_magicLink_wrongSecretRejected', () => {
  const token = signMagicLink({ subject: 'x' });
  const prev = process.env.PF_TOKEN_SECRET;
  process.env.PF_TOKEN_SECRET = 'a-different-secret';
  try {
    expect(verifyMagicLink(token)).toBeNull();
  } finally {
    if (prev === undefined) delete process.env.PF_TOKEN_SECRET; else process.env.PF_TOKEN_SECRET = prev;
  }
});
