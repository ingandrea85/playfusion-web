import { test, expect } from 'vitest';
import { randomUUID } from 'node:crypto';

// Acceptance E2E (S20 · O11 subscriptions): trial-first lifecycle. First read bootstraps a PRO
// trial (~14 days); activate-pro → PRO/ACTIVE; expire-trial → FREE/ACTIVE. Skip-gated on API_BASE_URL.
// Uses a throwaway org id so it never collides with real tenant data.
const API = process.env.API_BASE_URL;
const run = test.skipIf(!API);

const org = `e2e-sub-${randomUUID().slice(0, 8)}`;
const j = (r: Response) => r.json() as Promise<any>;
const req = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${API}${path}`, { method, headers: { 'content-type': 'application/json', 'x-organization-id': org, ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
const post = (p: string, h: Record<string, string> = {}) => req('POST', p, undefined, h);
const get = (p: string, h: Record<string, string> = {}) => req('GET', p, undefined, h);
async function token(roles: string[]): Promise<string> {
  return (await j(await req('POST', '/o2/identities/magic-link', { contact: `${randomUUID()}@example.com`, roles }))).token as string;
}

run('test_e2e_subscription_trialFirstLifecycle', async () => {
  const auth = { authorization: await token(['RegistrationManager']) };
  const base = `/o11/organizations/${org}/subscription`;

  // first read bootstraps a PRO trial
  const trial = await j(await get(base, auth));
  expect(trial.plan).toBe('PRO');
  expect(trial.status).toBe('TRIAL');
  expect(trial.trialDaysLeft).toBeGreaterThan(10);

  // a second read returns the same trial (renewsOn fixed, not re-provisioned)
  const again = await j(await get(base, auth));
  expect(again.renewsOn).toBe(trial.renewsOn);

  // upgrade to paid Pro
  const pro = await j(await post(`${base}:activate-pro`, auth));
  expect(pro).toMatchObject({ plan: 'PRO', status: 'ACTIVE' });

  // expire the trial → limited Free
  const free = await j(await post(`${base}:expire-trial`, auth));
  expect(free).toMatchObject({ plan: 'FREE', status: 'ACTIVE' });
  expect((await j(await get(base, auth))).plan).toBe('FREE');
}, 120_000);
