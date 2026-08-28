import type { BrandRepository, SiteDefaultsRepository } from '../src/ports.js';
import type { Brand, OrgSiteDefaults } from '../src/domain.js';

export class InMemoryBrandRepository implements BrandRepository, SiteDefaultsRepository {
  readonly byOrg = new Map<string, Brand>();
  readonly siteByOrg = new Map<string, OrgSiteDefaults>();
  async get(organizationId: string) { return this.byOrg.get(organizationId) ?? null; }
  async save(organizationId: string, brand: Brand) { this.byOrg.set(organizationId, brand); }
  async delete(organizationId: string) { this.byOrg.delete(organizationId); }
  async getSite(organizationId: string) { return this.siteByOrg.get(organizationId) ?? null; }
  async saveSite(organizationId: string, site: OrgSiteDefaults) { this.siteByOrg.set(organizationId, site); }
}
