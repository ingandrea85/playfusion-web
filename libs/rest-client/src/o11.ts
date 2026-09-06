import { request, type HttpConfig } from './http.js'
import type { Subscription } from './types.js'

export interface O11Api {
  getSubscription(organizationId: string): Promise<Subscription>
  provision(organizationId: string, email?: string): Promise<Subscription>
  openBillingPortal(organizationId: string, returnUrl: string): Promise<{ url: string }>
  resync(organizationId: string): Promise<Subscription>
}
const enc = encodeURIComponent
export const o11 = (cfg: HttpConfig): O11Api => ({
  getSubscription: (orgId) => request(cfg, 'GET', `/o11/organizations/${enc(orgId)}/subscription`),
  provision: (orgId, email) => request(cfg, 'POST', `/o11/organizations/${enc(orgId)}/subscription:provision`, email ? { email } : {}),
  openBillingPortal: (orgId, returnUrl) => request(cfg, 'POST', `/o11/organizations/${enc(orgId)}/subscription:portal`, { returnUrl }),
  resync: (orgId) => request(cfg, 'POST', `/o11/admin/organizations/${enc(orgId)}/subscription:resync`),
})
