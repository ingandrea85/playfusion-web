import { checkpoint } from '@playfusion/platform-lib';
import { makeSiteDefaults, type OrgSiteDefaults } from '../domain.js';
import type { SiteDefaultsRepository } from '../ports.js';

type Deps = { repo: SiteDefaultsRepository };

/** Public read: the org's site defaults, or null when unset. */
export const getSite = (d: Deps) => async (organizationId: string): Promise<OrgSiteDefaults | null> =>
  d.repo.getSite(organizationId);

/** Owner write: normalise + persist the org site defaults. Returns the stored shape. */
export const setSite = (d: Deps) => async (organizationId: string, input: OrgSiteDefaults): Promise<OrgSiteDefaults> => {
  checkpoint('setSiteDefaults', 'START', { organizationId });
  const site = makeSiteDefaults(input);
  await d.repo.saveSite(organizationId, site);
  checkpoint('setSiteDefaults', 'STOP', { organizationId });
  return site;
};
