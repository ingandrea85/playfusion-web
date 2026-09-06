import { describe, it, expect, vi } from 'vitest';
import { makeLiveStripeGateway } from '../src/adapters/stripe-gateway-live.js';

// Minimal fake of the stripe SDK surface we use.
const fakeStripe = () => ({
  customers: { create: vi.fn().mockResolvedValue({ id: 'cus_1' }) },
  subscriptions: {
    create: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1, current_period_end: 2, items: { data: [{ price: { id: 'price_club' } }] } }),
    retrieve: vi.fn().mockResolvedValue({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 2, items: { data: [{ price: { id: 'price_club' } }] } }),
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
  billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: 'https://portal' }) } },
  webhooks: { constructEvent: vi.fn().mockReturnValue({ type: 'x', data: { object: { id: 'sub_1' } } }) },
});

describe('makeLiveStripeGateway', () => {
  it('createTrialSubscription creates a customer + trial sub with org metadata and no card', async () => {
    const s = fakeStripe();
    const gw = makeLiveStripeGateway({ secretKey: 'sk', webhookSecret: 'wh', clubPriceId: 'price_club' }, s as any);
    const sub = await gw.createTrialSubscription({ organizationId: 'org-1', email: 'a@b.c' });
    expect(s.customers.create).toHaveBeenCalledWith({ email: 'a@b.c', metadata: { organizationId: 'org-1' } });
    expect(s.subscriptions.create).toHaveBeenCalledWith(expect.objectContaining({
      customer: 'cus_1', items: [{ price: 'price_club' }], trial_period_days: 14,
      metadata: { organizationId: 'org-1' }, trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
    }));
    expect(sub.id).toBe('sub_1');
  });
  it('parseEvent verifies the signature and returns type + object', () => {
    const s = fakeStripe();
    const gw = makeLiveStripeGateway({ secretKey: 'sk', webhookSecret: 'wh', clubPriceId: 'price_club' }, s as any);
    const ev = gw.parseEvent('{"a":1}', 'sig');
    expect(s.webhooks.constructEvent).toHaveBeenCalledWith('{"a":1}', 'sig', 'wh');
    expect(ev.type).toBe('x');
  });
});
