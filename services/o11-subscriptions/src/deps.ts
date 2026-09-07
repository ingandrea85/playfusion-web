import { makeDocClient } from '@playfusion/platform-lib';
import { DynamoDbSubscriptionRepository } from './adapters/dynamodb-subscription-repository.js';
import { makeLiveStripeGateway } from './adapters/stripe-gateway-live.js';
import type { Deps } from './application/subscription.js';
import type { StripeGateway } from './ports/stripe-gateway.js';
import type { PriceToPlan } from './domain.js';

// Stripe price id → plan, built from the non-secret env injected by CDK (STRIPE_PRICE_*).
export const priceToPlan: PriceToPlan = {
  ...(process.env.STRIPE_PRICE_STARTER ? { [process.env.STRIPE_PRICE_STARTER]: 'STARTER' as const } : {}),
  ...(process.env.STRIPE_PRICE_CLUB ? { [process.env.STRIPE_PRICE_CLUB]: 'CLUB' as const } : {}),
};

// Live dependencies shared by the HTTP handler and the EventBridge consumer. The Stripe client is
// constructed lazily inside the gateway, so building this with an absent key never throws.
export function defaultDeps(): Deps {
  const repo = new DynamoDbSubscriptionRepository(makeDocClient());
  const stripe: StripeGateway = makeLiveStripeGateway({
    secretKey: process.env.STRIPE_SECRET_KEY ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
    clubPriceId: process.env.STRIPE_PRICE_CLUB ?? '',
  });
  return { repo, stripe, priceToPlan };
}
