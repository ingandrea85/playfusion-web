import { describe, it, expect } from 'vitest';
import { subscriptionFromStripe, freeSubscription, type PriceToPlan, type StripeSubShape } from '../src/domain.js';

const MAP: PriceToPlan = { price_starter: 'STARTER', price_club: 'CLUB' };
const base = (over: Partial<StripeSubShape> = {}): StripeSubShape => ({
  id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600 /* 2026-01-01 */, current_period_end: 1769817600,
  items: { data: [{ price: { id: 'price_club' } }] }, ...over,
});

describe('subscriptionFromStripe', () => {
  it('maps a trialing club subscription to TRIAL/CLUB with renewsOn = trial_end', () => {
    expect(subscriptionFromStripe('org-1', base(), MAP)).toEqual({
      organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: '2026-01-01',
      stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1',
    });
  });
  it('maps active → ACTIVE with renewsOn = current_period_end', () => {
    const s = subscriptionFromStripe('org-1', base({ status: 'active', trial_end: null, current_period_end: 1769817600 }), MAP);
    expect(s).toMatchObject({ status: 'ACTIVE', plan: 'CLUB', renewsOn: '2026-01-31' });
  });
  it('maps past_due and unpaid → PAST_DUE', () => {
    expect(subscriptionFromStripe('o', base({ status: 'past_due' }), MAP).status).toBe('PAST_DUE');
    expect(subscriptionFromStripe('o', base({ status: 'unpaid' }), MAP).status).toBe('PAST_DUE');
  });
  it('maps the price id to the plan (starter)', () => {
    const s = subscriptionFromStripe('o', base({ items: { data: [{ price: { id: 'price_starter' } }] } }), MAP);
    expect(s.plan).toBe('STARTER');
  });
});

describe('freeSubscription', () => {
  it('returns FREE/ACTIVE and retains stripe ids when given', () => {
    const s = freeSubscription('org-1', new Date('2026-01-02T00:00:00Z'), { stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    expect(s).toMatchObject({ plan: 'FREE', status: 'ACTIVE', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
  });
});
