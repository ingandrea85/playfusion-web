import { checkpoint, DomainError } from '@playfusion/platform-lib';
import { subscriptionFromStripe, trialDaysLeft, type Subscription, type PriceToPlan } from '../domain.js';
import type { SubscriptionRepository } from '../ports.js';
import type { StripeGateway } from '../ports/stripe-gateway.js';

export type Deps = { repo: SubscriptionRepository; stripe: StripeGateway; priceToPlan: PriceToPlan; now?: () => Date };
const clock = (d: Deps) => (d.now ?? (() => new Date()))();

export interface SubscriptionView extends Subscription { trialDaysLeft: number }
const view = (sub: Subscription, now: Date): SubscriptionView => ({ ...sub, trialDaysLeft: trialDaysLeft(sub, now) });

/** Pure read of the projection. No side effects; FREE-shaped default when unprovisioned. */
export const getSubscription = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const existing = await d.repo.get(organizationId);
  return view(existing ?? { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: '' }, now);
};

/** Create a Stripe-native 14-day CLUB trial (no card) and store the projection. Idempotent. */
export const provision = (d: Deps) => async (organizationId: string, email?: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const existing = await d.repo.get(organizationId);
  if (existing?.stripeSubscriptionId) return view(existing, now);
  const stripeSub = await d.stripe.createTrialSubscription({ organizationId, email });
  const sub = subscriptionFromStripe(organizationId, stripeSub, d.priceToPlan);
  await d.repo.save(sub);
  checkpoint('provisionTrial', 'STOP', { organizationId, stripeSubscriptionId: sub.stripeSubscriptionId, renewsOn: sub.renewsOn });
  return view(sub, now);
};

/** Create a hosted Stripe Billing Portal session for the org's customer. */
export const billingPortal = (d: Deps) => async (organizationId: string, returnUrl: string): Promise<{ url: string }> => {
  const sub = await d.repo.get(organizationId);
  if (!sub?.stripeCustomerId) throw new DomainError('NO_STRIPE_CUSTOMER', 'No Stripe customer for this organization', 409);
  return d.stripe.createBillingPortalSession({ customerId: sub.stripeCustomerId, returnUrl });
};

/** Debug/admin: refetch the org's Stripe subscription and rewrite the local projection. */
export const resync = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const cur = await d.repo.get(organizationId);
  if (!cur?.stripeSubscriptionId) throw new DomainError('NOTHING_TO_RESYNC', 'Nothing to resync (no Stripe subscription)', 409);
  const stripeSub = await d.stripe.getSubscription(cur.stripeSubscriptionId);
  const sub = subscriptionFromStripe(organizationId, stripeSub, d.priceToPlan);
  await d.repo.save(sub);
  return view(sub, now);
};
