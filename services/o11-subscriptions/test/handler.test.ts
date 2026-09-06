import { describe, it, expect, vi } from 'vitest';
import { makeApp } from '../src/handler.js';
import type { StripeGateway } from '../src/ports/stripe-gateway.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const trialSub = { id: 'sub_1', status: 'trialing', customer: 'cus_1', trial_end: 1767225600, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] }, metadata: { organizationId: 'org-1' } };
const gw: StripeGateway = {
  createTrialSubscription: vi.fn().mockResolvedValue(trialSub), getSubscription: vi.fn().mockResolvedValue(trialSub),
  findSubscriptionByOrg: vi.fn(), createBillingPortalSession: vi.fn().mockResolvedValue({ url: 'https://portal' }),
  parseEvent: vi.fn().mockReturnValue({ type: 'customer.subscription.updated', object: { ...trialSub, status: 'active' } }),
};

const deps = () => ({ repo: new Repo(), stripe: gw, priceToPlan: { price_club: 'CLUB' as const } });

describe('o11 webhook route (public)', () => {
  it('processes a signed webhook without auth', async () => {
    const app = makeApp(deps());
    const res = await app.request('/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'sig' }, body: '{}' });
    expect(res.status).toBe(200);
  });
  it('rejects a webhook with a bad signature', async () => {
    const bad = { ...gw, parseEvent: vi.fn(() => { throw new Error('bad sig'); }) };
    const app = makeApp({ ...deps(), stripe: bad });
    const res = await app.request('/webhooks/stripe', { method: 'POST', headers: { 'stripe-signature': 'x' }, body: '{}' });
    expect(res.status).toBe(400);
  });
});
