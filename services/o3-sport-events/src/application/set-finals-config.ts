import type { FinalsType } from '../domain.js';
import type { FinalsConfig, FinalsConfigRepository } from '../ports/finals-config-repository.js';

export interface SetFinalsConfigInput { sportEventId: string; finalsType: FinalsType; qualifiersPerGroup: number }

/** S12: persist the event's finals config (O6). The handler validates the shape and 404s a missing
 *  event first; here we just write. Returns the stored config for the client to reflect. */
export function setFinalsConfig(repo: FinalsConfigRepository) {
  return async (input: SetFinalsConfigInput): Promise<FinalsConfig> => {
    const config: FinalsConfig = { finalsType: input.finalsType, qualifiersPerGroup: input.qualifiersPerGroup };
    await repo.setFinalsConfig(input.sportEventId, config);
    return config;
  };
}
