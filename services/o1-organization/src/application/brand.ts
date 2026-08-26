import { checkpoint } from '@playfusion/platform-lib';
import { makeBrand, type Brand } from '../domain.js';
import type { BrandRepository } from '../ports.js';

type Deps = { repo: BrandRepository };

/** Public read: the tenant brand, or null when unset (→ default PlayFusion theme). */
export const getBrand = (d: Deps) => async (organizationId: string): Promise<Brand | null> =>
  d.repo.get(organizationId);

export const setBrand = (d: Deps) => async (organizationId: string, input: { logoText: string; primaryColor: string; accentColor: string }): Promise<Brand> => {
  checkpoint('setBrand', 'START', { organizationId });
  const brand = makeBrand(input);
  await d.repo.save(organizationId, brand);
  checkpoint('setBrand', 'STOP', { organizationId });
  return brand;
};

/** Reset to the default theme by removing the stored brand. Idempotent. */
export const resetBrand = (d: Deps) => async (organizationId: string): Promise<void> => {
  checkpoint('resetBrand', 'START', { organizationId });
  await d.repo.delete(organizationId);
  checkpoint('resetBrand', 'STOP', { organizationId });
};
