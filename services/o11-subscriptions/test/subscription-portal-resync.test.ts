import { describe, it, expect, vi } from 'vitest';
import { billingPortal, resync } from '../src/application/subscription.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const MAP = { price_club: 'CLUB' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const gw = (over: Partial<StripeGateway> = {}): StripeGateway => ({
  createTrialSubscription: vi.fn(), getSubscription: vi.fn(), findSubscriptionByOrg: vi.fn(),
  createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }), parseEvent: vi.fn(), ...over,
});

describe('billingPortal', () => {
  it('creates a portal session for the org customer', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-15', stripeCustomerId: 'cus_1' });
    const stripe = gw();
    const out = await billingPortal({ repo, stripe, priceToPlan: MAP, now })('org-1', 'https://app/return');
    expect(stripe.createBillingPortalSession).toHaveBeenCalledWith({ customerId: 'cus_1', returnUrl: 'https://app/return' });
    expect(out.url).toBe('https://portal');
  });
});

describe('resync', () => {
  it('refetches the Stripe sub and rewrites the projection', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: 'x', stripeSubscriptionId: 'sub_1', stripeCustomerId: 'cus_1' });
    const stripe = gw({ getSubscription: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] } }) });
    const s = await resync({ repo, stripe, priceToPlan: MAP, now })('org-1');
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'CLUB', renewsOn: '2026-01-31' });
  });
});
