import { request, type HttpConfig } from './http.js'
import type { Subscription, AdminSetPlanInput } from './types.js'

export interface O11Api {
  getSubscription(organizationId: string): Promise<Subscription>
  activatePro(organizationId: string): Promise<Subscription>
  expireTrial(organizationId: string): Promise<Subscription>
  // S21 admin (platform_admin) — set any org's plan / grant a trial cross-tenant.
  adminSetPlan(organizationId: string, input: AdminSetPlanInput): Promise<Subscription>
}
export const o11 = (cfg: HttpConfig): O11Api => ({
  getSubscription: (orgId) => request(cfg, 'GET', `/o11/organizations/${encodeURIComponent(orgId)}/subscription`),
  activatePro: (orgId) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:activate-pro`),
  expireTrial: (orgId) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:expire-trial`),
  adminSetPlan: (orgId, input) => request(cfg, 'PUT', `/o11/admin/organizations/${encodeURIComponent(orgId)}/subscription`, input),
})
