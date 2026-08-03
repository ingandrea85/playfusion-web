import type { FeeReadStore, FeeStatus } from './ports/fee-read-store.js';

/** Public fee projection: internal `sportEventId`/`paymentRef` are not part of the read contract. */
export type FeeView = { registrationId: string; status: FeeStatus };

export const listFees = (store: FeeReadStore) => async (sportEventId: string): Promise<FeeView[]> =>
  (await store.listByEvent(sportEventId)).map((f) => ({ registrationId: f.registrationId, status: f.status }));
