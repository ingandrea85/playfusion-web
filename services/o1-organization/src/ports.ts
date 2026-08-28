import type { Brand, OrgSiteDefaults } from './domain.js';

export interface BrandRepository {
  get(organizationId: string): Promise<Brand | null>;
  save(organizationId: string, brand: Brand): Promise<void>;
  delete(organizationId: string): Promise<void>;
}

export interface SiteDefaultsRepository {
  getSite(organizationId: string): Promise<OrgSiteDefaults | null>;
  saveSite(organizationId: string, site: OrgSiteDefaults): Promise<void>;
}
