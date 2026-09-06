import { checkpoint } from '@playfusion/platform-lib';
import { trialSubscription, paidSubscription, freeSubscription, planSubscription, trialDaysLeft, type Subscription, type PlanKey, type SelfServePlan } from '../domain.js';
import type { SubscriptionRepository } from '../ports.js';

type Deps = { repo: SubscriptionRepository; now?: () => Date };
const clock = (d: Deps) => (d.now ?? (() => new Date()))();

export interface SubscriptionView extends Subscription { trialDaysLeft: number }
const view = (sub: Subscription, now: Date): SubscriptionView => ({ ...sub, trialDaysLeft: trialDaysLeft(sub, now) });

/**
 * Trial-first: reading a tenant's subscription provisions a CLUB trial the first time (there is no
 * OrganizationCreated event to hang it off yet), so every org is born in trial. Persist-on-read so
 * renewsOn is fixed and the trial actually counts down.
 */
export const getOrProvision = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const existing = await d.repo.get(organizationId);
  if (existing) return view(existing, now);
  const sub = trialSubscription(organizationId, now);
  await d.repo.save(sub);
  checkpoint('provisionTrial', 'STOP', { organizationId, renewsOn: sub.renewsOn });
  return view(sub, now);
};

/** Fake upgrade to a paid self-serve plan (STARTER or CLUB). */
export const activatePlan = (d: Deps) => async (organizationId: string, plan: SelfServePlan): Promise<SubscriptionView> => {
  const now = clock(d);
  const sub = paidSubscription(organizationId, plan, now);
  await d.repo.save(sub);
  checkpoint('activatePlan', 'STOP', { organizationId, plan });
  return view(sub, now);
};

/** S21 admin: set an org's plan (ACTIVE) or grant a fresh CLUB trial. Cross-tenant (platform_admin). */
export const adminSetPlan = (d: Deps) => async (organizationId: string, plan: PlanKey, trial = false): Promise<SubscriptionView> => {
  const now = clock(d);
  const sub = planSubscription(organizationId, plan, now, trial);
  await d.repo.save(sub);
  checkpoint('adminSetPlan', 'STOP', { organizationId, plan, trial });
  return view(sub, now);
};

/** Demo lever: expire the trial → limited Free. */
export const expireTrial = (d: Deps) => async (organizationId: string): Promise<SubscriptionView> => {
  const now = clock(d);
  const sub = freeSubscription(organizationId, now);
  await d.repo.save(sub);
  checkpoint('expireTrial', 'STOP', { organizationId });
  return view(sub, now);
};
