import type { BrandRepository } from '../src/ports.js';
import type { Brand } from '../src/domain.js';

export class InMemoryBrandRepository implements BrandRepository {
  readonly byOrg = new Map<string, Brand>();
  async get(organizationId: string) { return this.byOrg.get(organizationId) ?? null; }
  async save(organizationId: string, brand: Brand) { this.byOrg.set(organizationId, brand); }
  async delete(organizationId: string) { this.byOrg.delete(organizationId); }
}
