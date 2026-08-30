import { describe, it, expect } from 'vitest';
import { trialSubscription, freeSubscription, proSubscription, trialDaysLeft } from '../src/domain.js';
import { getOrProvision, activatePro, expireTrial, adminSetPlan } from '../src/application/subscription.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';

class InMemoryRepo implements SubscriptionRepository {
  readonly byOrg = new Map<string, Subscription>();
  async get(o: string) { return this.byOrg.get(o); }
  async save(s: Subscription) { this.byOrg.set(s.organizationId, s); }
}
const at = (iso: string) => () => new Date(iso);

describe('subscription domain', () => {
  it('test_trialSubscription_isProTrial14Days', () => {
    const s = trialSubscription('org-1', new Date('2026-01-01T00:00:00Z'));
    expect(s).toEqual({ organizationId: 'org-1', plan: 'PRO', status: 'TRIAL', renewsOn: '2026-01-15' });
  });
  it('test_trialDaysLeft_countsWholeDaysAndFloorsAtZero', () => {
    const s = trialSubscription('org-1', new Date('2026-01-01T00:00:00Z'));
    expect(trialDaysLeft(s, new Date('2026-01-01T10:00:00Z'))).toBe(14);
    expect(trialDaysLeft(s, new Date('2026-01-10T00:00:00Z'))).toBe(5);
    expect(trialDaysLeft(s, new Date('2026-02-01T00:00:00Z'))).toBe(0);
  });
  it('test_trialDaysLeft_zeroWhenNotTrial', () => {
    expect(trialDaysLeft(freeSubscription('o', new Date('2026-01-01T00:00:00Z')), new Date('2026-01-01T00:00:00Z'))).toBe(0);
    expect(trialDaysLeft(proSubscription('o', new Date('2026-01-01T00:00:00Z')), new Date('2026-01-01T00:00:00Z'))).toBe(0);
  });
});

describe('subscription application', () => {
  it('test_getOrProvision_bootstrapsAProTrialOnFirstRead', async () => {
    const repo = new InMemoryRepo();
    const s = await getOrProvision({ repo, now: at('2026-01-01T00:00:00Z') })('org-1');
    expect(s).toMatchObject({ plan: 'PRO', status: 'TRIAL', renewsOn: '2026-01-15', trialDaysLeft: 14 });
    expect(repo.byOrg.get('org-1')).toBeTruthy(); // persisted so renewsOn is fixed
  });
  it('test_getOrProvision_returnsTheSameSubscriptionOnSubsequentReads', async () => {
    const repo = new InMemoryRepo();
    await getOrProvision({ repo, now: at('2026-01-01T00:00:00Z') })('org-1');
    const again = await getOrProvision({ repo, now: at('2026-01-05T00:00:00Z') })('org-1');
    expect(again.renewsOn).toBe('2026-01-15'); // unchanged
    expect(again.trialDaysLeft).toBe(10);
  });
  it('test_activatePro_setsProActive', async () => {
    const repo = new InMemoryRepo();
    const s = await activatePro({ repo, now: at('2026-01-01T00:00:00Z') })('org-1');
    expect(s).toMatchObject({ plan: 'PRO', status: 'ACTIVE', trialDaysLeft: 0 });
  });
  it('test_expireTrial_downgradesToFree', async () => {
    const repo = new InMemoryRepo();
    const s = await expireTrial({ repo, now: at('2026-01-01T00:00:00Z') })('org-1');
    expect(s).toMatchObject({ plan: 'FREE', status: 'ACTIVE' });
  });

  it('adminSetPlan sets an ACTIVE plan or grants a fresh trial', async () => {
    const repo = new InMemoryRepo();
    const now = at('2026-01-01T00:00:00Z');
    expect(await adminSetPlan({ repo, now })('org-1', 'BUSINESS')).toMatchObject({ plan: 'BUSINESS', status: 'ACTIVE' });
    expect(await adminSetPlan({ repo, now })('org-1', 'FREE')).toMatchObject({ plan: 'FREE', status: 'ACTIVE' });
    const trial = await adminSetPlan({ repo, now })('org-1', 'PRO', true);
    expect(trial).toMatchObject({ plan: 'PRO', status: 'TRIAL' });
    expect(trial.trialDaysLeft).toBe(14);
    // persisted
    expect((await repo.get('org-1'))!.status).toBe('TRIAL');
  });
});
