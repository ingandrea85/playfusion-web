import { describe, it, expect, vi } from 'vitest';
import { consume, type IdempotencyGate } from '../src/consumer.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';
import type { Deps } from '../src/application/subscription.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o: string) { return this.m.get(o); } async save(s: Subscription) { this.m.set(s.organizationId, s); } }
const trialSub = { id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } };
const gw = (over: Partial<StripeGateway> = {}): StripeGateway => ({
  createTrialSubscription: vi.fn().mockResolvedValue(trialSub), getSubscription: vi.fn(), findSubscriptionByOrg: vi.fn(),
  createBillingPortalSession: vi.fn(), parseEvent: vi.fn(), ...over,
});
const deps = (stripe: StripeGateway): Deps => ({ repo: new Repo(), stripe, priceToPlan: { price_club: 'CLUB' }, now: () => new Date('2026-01-01T00:00:00Z') });
const gate = (already = false): IdempotencyGate => ({ alreadyProcessed: vi.fn().mockResolvedValue(already), markProcessed: vi.fn().mockResolvedValue(undefined) });

const orgCreated = (over: Record<string, unknown> = {}) => ({
  'detail-type': 'OrganizationCreated',
  detail: { envelope: { eventId: 'evt-1', organizationId: 'org-1' }, email: 'a@b.c', ...over },
});

describe('o11 consumer — OrganizationCreated → provision', () => {
  it('provisions a trial for the org (with email) and marks the event processed', async () => {
    const stripe = gw(); const ig = gate(false);
    await consume(deps(stripe), ig)(orgCreated());
    expect(stripe.createTrialSubscription).toHaveBeenCalledWith({ organizationId: 'org-1', email: 'a@b.c' });
    expect(ig.markProcessed).toHaveBeenCalledWith('evt-1');
  });
  it('is idempotent: skips when the event was already processed', async () => {
    const stripe = gw(); const ig = gate(true);
    await consume(deps(stripe), ig)(orgCreated());
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
    expect(ig.markProcessed).not.toHaveBeenCalled();
  });
  it('ignores unrelated event types but still marks them processed', async () => {
    const stripe = gw(); const ig = gate(false);
    await consume(deps(stripe), ig)({ 'detail-type': 'SomethingElse', detail: { envelope: { eventId: 'evt-2' } } });
    expect(stripe.createTrialSubscription).not.toHaveBeenCalled();
    expect(ig.markProcessed).toHaveBeenCalledWith('evt-2');
  });
});
