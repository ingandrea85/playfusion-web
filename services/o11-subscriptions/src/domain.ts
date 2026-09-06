// O11 subscriptions — Stripe-backed billing (Blueprint D-O11-2). Stripe is the source of truth;
// O11 stores a projection updated by webhooks. A tenant is born in a Stripe-native 14-day CLUB
// trial (no card); at trial end without a payment method Stripe cancels → the org degrades to FREE.
export type PlanKey = 'FREE' | 'STARTER' | 'CLUB' | 'ENTERPRISE';
export type SubStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE';

export interface Subscription {
  organizationId: string;
  plan: PlanKey;
  status: SubStatus;
  renewsOn: string; // 'YYYY-MM-DD' — mirrors Stripe trial_end / current_period_end
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

/** Map of Stripe price id → plan (from env: priceStarter, priceClub). */
export type PriceToPlan = Record<string, PlanKey>;

/** The subset of a Stripe Subscription object this domain reads. */
export interface StripeSubShape {
  id: string;
  status: string; // trialing | active | past_due | unpaid | canceled | incomplete | incomplete_expired
  customer: string;
  trial_end: number | null;         // unix seconds
  current_period_end: number | null; // unix seconds
  items: { data: Array<{ price: { id: string } }> };
}

const isoDay = (unixSeconds: number | null): string =>
  unixSeconds ? new Date(unixSeconds * 1000).toISOString().slice(0, 10) : '';
const addDays = (from: Date, days: number): string =>
  new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10);

const STATUS: Record<string, SubStatus> = {
  trialing: 'TRIAL', active: 'ACTIVE', past_due: 'PAST_DUE', unpaid: 'PAST_DUE',
};

/** Pure projection of a Stripe subscription into our domain shape. Caller handles
 *  canceled/incomplete_expired separately (→ freeSubscription). */
export function subscriptionFromStripe(organizationId: string, sub: StripeSubShape, priceToPlan: PriceToPlan): Subscription {
  const status = STATUS[sub.status] ?? 'PAST_DUE';
  const priceId = sub.items.data[0]?.price.id ?? '';
  const plan: PlanKey = priceToPlan[priceId] ?? 'CLUB';
  const renewsOn = status === 'TRIAL' ? isoDay(sub.trial_end) : isoDay(sub.current_period_end);
  return { organizationId, plan, status, renewsOn, stripeCustomerId: sub.customer, stripeSubscriptionId: sub.id };
}

/** Cancellation / trial-lapse → limited Free (renewsOn in the past marks it lapsed). Retains ids for audit. */
export function freeSubscription(organizationId: string, now: Date, ids?: { stripeCustomerId?: string; stripeSubscriptionId?: string }): Subscription {
  return { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: addDays(now, -1), ...ids };
}

/** Whole days left in the trial (0 once past renewsOn); only meaningful while status TRIAL. */
export function trialDaysLeft(sub: Subscription, now: Date): number {
  if (sub.status !== 'TRIAL') return 0;
  const today = new Date(now.toISOString().slice(0, 10)).getTime();
  const end = new Date(sub.renewsOn).getTime();
  return Math.max(0, Math.round((end - today) / 86400000));
}
