// S20 (O11 subscriptions) — trial-first billing (Blueprint D-O11-2). A tenant is born in a 14-day
// PRO trial, then degrades to a limited FREE plan at expiry (never locked). Upgrade = PRO/ACTIVE.
// Prices/packaging stay deferred (ADR-007). Real payment/billing is out of scope (fake activation).
export type PlanKey = 'FREE' | 'PRO' | 'BUSINESS';
export type SubStatus = 'TRIAL' | 'ACTIVE';

export interface Subscription {
  organizationId: string;
  plan: PlanKey;
  status: SubStatus;
  renewsOn: string; // 'YYYY-MM-DD'
}

const TRIAL_DAYS = 14;
const day = (iso: string) => iso.slice(0, 10);
const addDays = (from: Date, days: number): string => new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10);

/** A fresh tenant's subscription: PRO in trial for 14 days from `now`. */
export function trialSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'PRO', status: 'TRIAL', renewsOn: addDays(now, TRIAL_DAYS) };
}

/** Upgrade to paid Pro (renews a month out). */
export function proSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'PRO', status: 'ACTIVE', renewsOn: addDays(now, 30) };
}

/** Trial expiry / downgrade: limited Free (renewsOn in the past marks it lapsed). */
export function freeSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: addDays(now, -1) };
}

/** Whole days left in the trial (0 once past renewsOn); only meaningful while status TRIAL. */
export function trialDaysLeft(sub: Subscription, now: Date): number {
  if (sub.status !== 'TRIAL') return 0;
  const today = new Date(day(now.toISOString())).getTime();
  const end = new Date(sub.renewsOn).getTime();
  return Math.max(0, Math.round((end - today) / 86400000));
}
