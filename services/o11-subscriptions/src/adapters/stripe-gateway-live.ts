import Stripe from 'stripe';
import type { StripeGateway, StripeWebhookEvent } from '../ports/stripe-gateway.js';
import type { StripeSubShape } from '../domain.js';

export interface StripeGatewayConfig { secretKey: string; webhookSecret: string; clubPriceId: string }

// `sdk` is injectable for tests; defaults to a real Stripe client.
// The client is constructed lazily (only when a method that needs it is actually called), so
// merely building the gateway with an empty/missing secretKey — as happens on every cold start
// via defaultDeps() — never throws. Only Stripe-touching routes pay the construction cost.
export function makeLiveStripeGateway(cfg: StripeGatewayConfig, sdk?: Stripe): StripeGateway {
  let client: Stripe | undefined;
  const stripe = (): Stripe => (client ??= (sdk ?? new Stripe(cfg.secretKey, { apiVersion: '2025-02-24.acacia' })));
  return {
    async createTrialSubscription({ organizationId, email }) {
      const customer = await stripe().customers.create({ email, metadata: { organizationId } });
      const sub = await stripe().subscriptions.create({
        customer: customer.id,
        items: [{ price: cfg.clubPriceId }],
        trial_period_days: 14,
        metadata: { organizationId },
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      });
      return sub as unknown as StripeSubShape;
    },
    async getSubscription(id) {
      return (await stripe().subscriptions.retrieve(id)) as unknown as StripeSubShape;
    },
    async findSubscriptionByOrg(organizationId) {
      // metadata is not directly queryable; search by customer metadata via the Search API.
      const res = await stripe().subscriptions.search({ query: `metadata['organizationId']:'${organizationId}'`, limit: 1 });
      return (res.data[0] as unknown as StripeSubShape) ?? undefined;
    },
    async createBillingPortalSession({ customerId, returnUrl }) {
      const s = await stripe().billingPortal.sessions.create({ customer: customerId, return_url: returnUrl });
      return { url: s.url };
    },
    parseEvent(rawBody, signature): StripeWebhookEvent {
      const ev = stripe().webhooks.constructEvent(rawBody, signature, cfg.webhookSecret);
      return { type: ev.type, object: ev.data.object as StripeWebhookEvent['object'] };
    },
  };
}
