import type { FinalsType } from '../domain.js';

/** S12/S13: the finals config that lives on the o3 event item (O6). `finalsTeamsToBracket` sizes the
 *  SPLIT bracket (S13, v1); `finalsEnabled` gates generation; `qualifiersPerGroup` is deprecated. */
export interface FinalsConfig {
  finalsType: FinalsType;
  qualifiersPerGroup: number;
  finalsEnabled?: boolean;
  finalsTeamsToBracket?: number;
}

/** Persistence seam for the finals config. `setFinalsConfig` is a read-modify-write of the event
 *  item (like the gironi repo) — an infrequent organizer action on one event. */
export interface FinalsConfigRepository {
  setFinalsConfig(sportEventId: string, config: FinalsConfig): Promise<void>;
}
