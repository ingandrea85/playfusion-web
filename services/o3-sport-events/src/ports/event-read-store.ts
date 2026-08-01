import type { SportEvent } from '../domain.js';

/** Read seam for O3 events (S1.2). The DynamoDB adapter queries the `org-index` GSI
 *  for list-per-org and GetItem for detail; an in-memory fake mirrors it in tests. */
export interface EventReadStore {
  listByOrg(organizationId: string): Promise<SportEvent[]>;
  get(sportEventId: string): Promise<SportEvent | undefined>;
}
