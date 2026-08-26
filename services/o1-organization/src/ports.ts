import type { Brand } from './domain.js';

export interface BrandRepository {
  get(organizationId: string): Promise<Brand | null>;
  save(organizationId: string, brand: Brand): Promise<void>;
  delete(organizationId: string): Promise<void>;
}
