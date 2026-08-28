import { request, type HttpConfig } from './http.js'
import type { Brand, OrgSiteDefaults } from './types.js'

export interface O1Api {
  getBrand(organizationId: string): Promise<Brand | null>
  setBrand(organizationId: string, brand: Brand): Promise<Brand>
  resetBrand(organizationId: string): Promise<void>
  // Event Site — org-level defaults. GET is public (E3), PUT is owner-only.
  getSite(organizationId: string): Promise<OrgSiteDefaults | null>
  setSite(organizationId: string, site: OrgSiteDefaults): Promise<OrgSiteDefaults>
}
export const o1 = (cfg: HttpConfig): O1Api => ({
  getBrand: (orgId) => request(cfg, 'GET', `/o1/organizations/${encodeURIComponent(orgId)}/brand`),
  setBrand: (orgId, brand) => request(cfg, 'PUT', `/o1/organizations/${encodeURIComponent(orgId)}/brand`, brand),
  resetBrand: (orgId) => request(cfg, 'DELETE', `/o1/organizations/${encodeURIComponent(orgId)}/brand`),
  getSite: (orgId) => request(cfg, 'GET', `/o1/organizations/${encodeURIComponent(orgId)}/site`),
  setSite: (orgId, site) => request(cfg, 'PUT', `/o1/organizations/${encodeURIComponent(orgId)}/site`, site),
})
