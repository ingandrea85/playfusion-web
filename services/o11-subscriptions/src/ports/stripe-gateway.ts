import type { StripeSubShape } from '../domain.js';

export interface StripeWebhookEvent {
  type: string;
  // For subscription.* events this is a StripeSubShape; for invoice.* it carries customer + subscription id.
  object: StripeSubShape | { customer: string; subscription?: string };
}

export interface StripeGateway {
  createTrialSubscription(input: { organizationId: string; email?: string }): Promise<StripeSubShape>;
  getSubscription(stripeSubscriptionId: string): Promise<StripeSubShape>;
  findSubscriptionByOrg(organizationId: string): Promise<StripeSubShape | undefined>;
  createBillingPortalSession(input: { customerId: string; returnUrl: string }): Promise<{ url: string }>;
  parseEvent(rawBody: string, signature: string): StripeWebhookEvent;
}
