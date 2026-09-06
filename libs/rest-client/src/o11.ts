import { request, type HttpConfig } from './http.js'
import type { Subscription, AdminSetPlanInput, SelfServePlan } from './types.js'

export interface O11Api {
  getSubscription(organizationId: string): Promise<Subscription>
  /** Activate a paid self-serve plan (STARTER or CLUB). Owner-only. */
  activatePlan(organizationId: string, plan: SelfServePlan): Promise<Subscription>
  expireTrial(organizationId: string): Promise<Subscription>
  // S21 admin (platform_admin) — set any org's plan / grant a trial cross-tenant.
  adminSetPlan(organizationId: string, input: AdminSetPlanInput): Promise<Subscription>
}
export const o11 = (cfg: HttpConfig): O11Api => ({
  getSubscription: (orgId) => request(cfg, 'GET', `/o11/organizations/${encodeURIComponent(orgId)}/subscription`),
  activatePlan: (orgId, plan) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:activate`, { plan }),
  expireTrial: (orgId) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:expire-trial`),
  adminSetPlan: (orgId, input) => request(cfg, 'PUT', `/o11/admin/organizations/${encodeURIComponent(orgId)}/subscription`, input),
})
