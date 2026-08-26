import { request, type HttpConfig } from './http.js'
import type { Subscription } from './types.js'

export interface O11Api {
  getSubscription(organizationId: string): Promise<Subscription>
  activatePro(organizationId: string): Promise<Subscription>
  expireTrial(organizationId: string): Promise<Subscription>
}
export const o11 = (cfg: HttpConfig): O11Api => ({
  getSubscription: (orgId) => request(cfg, 'GET', `/o11/organizations/${encodeURIComponent(orgId)}/subscription`),
  activatePro: (orgId) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:activate-pro`),
  expireTrial: (orgId) => request(cfg, 'POST', `/o11/organizations/${encodeURIComponent(orgId)}/subscription:expire-trial`),
})
