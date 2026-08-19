import type { TieOverride } from '../domain.js';
import { InvalidTieOverrideError } from '../errors.js';
import type { TieOverrideRepository } from '../ports.js';
import type { Clock } from './transition-status.js';

export interface ResolveTieInput {
  sportEventId: string;
  categoryId: string;
  groupLabel: string;
  order: string[];
  resolvedBy: string;
}

const systemClock: Clock = () => new Date().toISOString();

/** S11: record (or replace) an organizer's manual resolution of a group's residual tie. The
 *  `order` must be non-empty with distinct teams (422 otherwise); we do NOT check it against the
 *  current tie here — an override that no longer matches a tied set is simply ignored at ranking
 *  time (self-invalidation), which keeps this write cheap and lets the organizer pre-set an order.
 *  Stores the audit trail (`resolvedBy` + `resolvedAt`), satisfying #44's "registrato e auditabile". */
export function setTieOverride(overrides: TieOverrideRepository, now: Clock = systemClock) {
  return async (input: ResolveTieInput): Promise<TieOverride> => {
    const order = input.order ?? [];
    if (order.length === 0 || new Set(order).size !== order.length) throw new InvalidTieOverrideError();
    const override: TieOverride = {
      sportEventId: input.sportEventId,
      categoryId: input.categoryId,
      groupLabel: input.groupLabel,
      order,
      resolvedBy: input.resolvedBy,
      resolvedAt: now(),
    };
    await overrides.upsert(override);
    return override;
  };
}
