import { checkpoint, DomainError } from '@playfusion/platform-lib';
import { subscriptionFromStripe, freeSubscription, type StripeSubShape } from '../domain.js';
import type { Deps } from './subscription.js';

type OrgId = string;

export const handleStripeEvent = (d: Deps) => async (rawBody: string, signature: string): Promise<{ handled: string }> => {
  const now = (d.now ?? (() => new Date()))();
  let ev;
  try {
    ev = d.stripe.parseEvent(rawBody, signature);
  } catch {
    throw new DomainError('INVALID_SIGNATURE', 'Invalid Stripe signature', 400);
  }
  const obj = ev.object as any;

  const resolveOrg = (): OrgId | undefined => obj?.metadata?.organizationId;

  switch (ev.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const orgId = resolveOrg();
      if (!orgId) return { handled: 'no-org' };
      await d.repo.save(subscriptionFromStripe(orgId, obj as StripeSubShape, d.priceToPlan));
      checkpoint('stripeWebhook', 'STOP', { type: ev.type, orgId });
      return { handled: ev.type };
    }
    case 'customer.subscription.deleted': {
      const orgId = resolveOrg();
      if (!orgId) return { handled: 'no-org' };
      const prev = await d.repo.get(orgId);
      await d.repo.save(freeSubscription(orgId, now, { stripeCustomerId: prev?.stripeCustomerId, stripeSubscriptionId: prev?.stripeSubscriptionId }));
      return { handled: ev.type };
    }
    case 'invoice.payment_failed': {
      const subId = obj?.subscription as string | undefined;
      const stripeSub = subId ? await d.stripe.getSubscription(subId) : undefined;
      const orgId = stripeSub?.metadata?.organizationId;
      if (!orgId || !stripeSub) return { handled: 'no-org' };
      await d.repo.save({ ...subscriptionFromStripe(orgId, stripeSub, d.priceToPlan), status: 'PAST_DUE' });
      return { handled: ev.type };
    }
    case 'invoice.paid': {
      const subId = obj?.subscription as string | undefined;
      const stripeSub = subId ? await d.stripe.getSubscription(subId) : undefined;
      const orgId = stripeSub?.metadata?.organizationId;
      if (!orgId || !stripeSub) return { handled: 'no-org' };
      await d.repo.save(subscriptionFromStripe(orgId, stripeSub, d.priceToPlan));
      return { handled: ev.type };
    }
    case 'customer.subscription.trial_will_end': {
      // Log only — no domain state change; the actual lapse arrives later as subscription.deleted.
      checkpoint('stripeWebhook', 'STOP', { type: ev.type });
      return { handled: ev.type };
    }
    default:
      return { handled: 'ignored' };
  }
};
