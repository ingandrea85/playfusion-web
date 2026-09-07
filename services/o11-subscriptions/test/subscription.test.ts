import { describe, it, expect, vi } from 'vitest';
import { getSubscription, provision } from '../src/application/subscription.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';

class InMemoryRepo implements SubscriptionRepository {
  readonly byOrg = new Map<string, Subscription>();
  async get(o: string) { return this.byOrg.get(o); }
  async save(s: Subscription) { this.byOrg.set(s.organizationId, s); }
}
const MAP = { price_club: 'CLUB' as const, price_starter: 'STARTER' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const trialSub = { id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } };
const gw = (over: Partial<StripeGateway> = {}): StripeGateway => ({
  createTrialSubscription: vi.fn().mockResolvedValue(trialSub),
  getSubscription: vi.fn().mockResolvedValue(trialSub),
  findSubscriptionByOrg: vi.fn().mockResolvedValue(undefined),
  createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }),
  parseEvent: vi.fn(),
  ...over,
});

describe('provision', () => {
  it('creates a Stripe trial and stores a CLUB/TRIAL projection', async () => {
    const repo = new InMemoryRepo(); const stripe = gw();
    const s = await provision({ repo, stripe, priceToPlan: MAP, now })('org-1', 'a@b.c');
    expect(stripe.createTrialSubscription).toHaveBeenCalledWith({ organizationId: 'org-1', email: 'a@b.c' });
    expect(s).toMatchObject({ plan: 'CLUB', status: 'TRIAL', stripeSubscriptionId: 'sub_1', trialDaysLeft: expect.any(Number) });
    expect(repo.byOrg.get('org-1')).toBeTruthy();
  });
  it('is idempotent: if a projection with a stripe sub exists, it does not create another', async () => {
    const repo = new InMemoryRepo();
    await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', stripeSubscriptionId: 'sub_1' });
    const stripe = gw();
    await provision({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
  });
  it('adopts an existing Stripe subscription (found by org) instead of creating a duplicate', async () => {
    const repo = new InMemoryRepo();
    const existingStripe = { id: 'sub_existing', status: 'trialing', customer: 'cus_9', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } };
    const stripe = gw({ findSubscriptionByOrg: vi.fn().mockResolvedValue(existingStripe) });
    const s = await provision({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(stripe.findSubscriptionByOrg).toHaveBeenCalledWith('org-1');
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
    expect(s).toMatchObject({ stripeSubscriptionId: 'sub_existing', plan: 'CLUB', status: 'TRIAL' });
  });
});

describe('getSubscription', () => {
  it('returns the stored projection without side effects', async () => {
    const repo = new InMemoryRepo();
    await repo.save({ organizationId: 'org-1', plan: 'STARTER', status: 'ACTIVE', renewsOn: '2026-02-01', stripeSubscriptionId: 'sub_9' });
    const stripe = gw();
    const s = await getSubscription({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(s).toMatchObject({ plan: 'STARTER', status: 'ACTIVE', trialDaysLeft: 0 });
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
  });
  it('returns a FREE-shaped default when nothing is provisioned', async () => {
    const s = await getSubscription({ repo: new InMemoryRepo(), stripe: gw(), priceToPlan: MAP, now })('org-x');
    expect(s).toMatchObject({ plan: 'FREE', status: 'ACTIVE' });
  });
});
