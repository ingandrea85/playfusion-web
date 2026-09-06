import { describe, it, expect, vi } from 'vitest';
import { handleStripeEvent } from '../src/application/webhook.js';
import type { SubscriptionRepository } from '../src/ports.js';
import type { Subscription } from '../src/domain.js';
import type { StripeGateway, StripeWebhookEvent } from '../src/ports/stripe-gateway.js';

class Repo implements SubscriptionRepository { m = new Map<string, Subscription>(); async get(o:string){return this.m.get(o);} async save(s:Subscription){this.m.set(s.organizationId,s);} }
const MAP = { price_club: 'CLUB' as const, price_starter: 'STARTER' as const };
const now = () => new Date('2026-01-01T00:00:00Z');
const subObj = (over = {}) => ({ id: 'sub_1', status: 'active', customer: 'cus_1', trial_end: null, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] }, metadata: { organizationId: 'org-1' }, ...over });
const gw = (event: StripeWebhookEvent): StripeGateway => ({
  createTrialSubscription: vi.fn(), getSubscription: vi.fn(), findSubscriptionByOrg: vi.fn(),
  createBillingPortalSession: vi.fn(), parseEvent: vi.fn().mockReturnValue(event),
});

describe('handleStripeEvent', () => {
  it('subscription.updated → writes the projection (ACTIVE/CLUB)', async () => {
    const repo = new Repo();
    await handleStripeEvent({ repo, stripe: gw({ type: 'customer.subscription.updated', object: subObj() as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ status: 'ACTIVE', plan: 'CLUB' });
  });
  it('subscription.deleted → FREE', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'TRIAL', renewsOn: 'x', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    await handleStripeEvent({ repo, stripe: gw({ type: 'customer.subscription.deleted', object: subObj({ status: 'canceled' }) as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ plan: 'FREE', status: 'ACTIVE', stripeCustomerId: 'cus_1' });
  });
  it('invoice.payment_failed → PAST_DUE (org resolved from the fetched subscription metadata)', async () => {
    const repo = new Repo(); await repo.save({ organizationId: 'org-1', plan: 'CLUB', status: 'ACTIVE', renewsOn: 'x', stripeCustomerId: 'cus_1', stripeSubscriptionId: 'sub_1' });
    const stripe = gw({ type: 'invoice.payment_failed', object: { customer: 'cus_1', subscription: 'sub_1' } });
    (stripe.getSubscription as any) = vi.fn().mockResolvedValue({ id: 'sub_1', status: 'past_due', customer: 'cus_1', trial_end: null, current_period_end: 1769817600, items: { data: [{ price: { id: 'price_club' } }] }, metadata: { organizationId: 'org-1' } });
    await handleStripeEvent({ repo, stripe, priceToPlan: MAP, now })('{}', 'sig');
    expect(repo.m.get('org-1')).toMatchObject({ status: 'PAST_DUE' });
  });
  it('ignores unrelated event types', async () => {
    const repo = new Repo();
    const out = await handleStripeEvent({ repo, stripe: gw({ type: 'customer.created', object: subObj() as any }), priceToPlan: MAP, now })('{}', 'sig');
    expect(out.handled).toBe('ignored');
  });
  it('throws 400 on a bad signature', async () => {
    const stripe = gw({ type: 'x', object: {} as any });
    (stripe.parseEvent as any) = vi.fn(() => { throw new Error('bad'); });
    await expect(handleStripeEvent({ repo: new Repo(), stripe, priceToPlan: MAP, now })('{}', 'x'))
      .rejects.toMatchObject({ httpStatus: 400 });
  });
});
