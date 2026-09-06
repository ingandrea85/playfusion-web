// S20 (O11 subscriptions) — trial-first billing (Blueprint D-O11-2). A tenant is born in a 14-day
// CLUB trial (the full-featured self-serve tier), then degrades to a limited FREE plan at expiry
// (never locked). Paid self-serve tiers: STARTER (core tournament) and CLUB (differentiators —
// payments, referees, post-match logistics). ENTERPRISE (federations, leagues, large associations)
// is sales-led / quote-based, set by an admin, not self-serve. Prices are ratified in the Blueprint
// pricing-derivation (ADR-007 deferral lifted, MVP complete). Real payment/billing is out of scope.
export type PlanKey = 'FREE' | 'STARTER' | 'CLUB' | 'ENTERPRISE';
export type SubStatus = 'TRIAL' | 'ACTIVE';

/** Paid self-serve tiers a tenant can activate on its own (ENTERPRISE is quote-based, admin-set). */
export type SelfServePlan = 'STARTER' | 'CLUB';

export interface Subscription {
  organizationId: string;
  plan: PlanKey;
  status: SubStatus;
  renewsOn: string; // 'YYYY-MM-DD'
}

const TRIAL_DAYS = 14;
const day = (iso: string) => iso.slice(0, 10);
const addDays = (from: Date, days: number): string => new Date(from.getTime() + days * 86400000).toISOString().slice(0, 10);

/** A fresh tenant's subscription: CLUB (full features) in trial for 14 days from `now`. */
export function trialSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'CLUB', status: 'TRIAL', renewsOn: addDays(now, TRIAL_DAYS) };
}

/** Upgrade to a paid self-serve plan — STARTER or CLUB (renews a month out). */
export function paidSubscription(organizationId: string, plan: SelfServePlan, now: Date): Subscription {
  return { organizationId, plan, status: 'ACTIVE', renewsOn: addDays(now, 30) };
}

/** Trial expiry / downgrade: limited Free (renewsOn in the past marks it lapsed). */
export function freeSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'FREE', status: 'ACTIVE', renewsOn: addDays(now, -1) };
}

/** Paid Enterprise (quote-based; renews a month out). Admin-set, not self-serve. */
export function enterpriseSubscription(organizationId: string, now: Date): Subscription {
  return { organizationId, plan: 'ENTERPRISE', status: 'ACTIVE', renewsOn: addDays(now, 30) };
}

/** S21 admin: build the subscription for an explicit plan (ACTIVE), or a fresh CLUB trial. */
export function planSubscription(organizationId: string, plan: PlanKey, now: Date, trial = false): Subscription {
  if (trial) return trialSubscription(organizationId, now);
  if (plan === 'FREE') return freeSubscription(organizationId, now);
  if (plan === 'ENTERPRISE') return enterpriseSubscription(organizationId, now);
  return paidSubscription(organizationId, plan, now);
}

/** Whole days left in the trial (0 once past renewsOn); only meaningful while status TRIAL. */
export function trialDaysLeft(sub: Subscription, now: Date): number {
  if (sub.status !== 'TRIAL') return 0;
  const today = new Date(day(now.toISOString())).getTime();
  const end = new Date(sub.renewsOn).getTime();
  return Math.max(0, Math.round((end - today) / 86400000));
}
