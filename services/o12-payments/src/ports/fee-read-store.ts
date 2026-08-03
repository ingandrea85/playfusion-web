export type FeeStatus = 'Requested' | 'Paid';
/** Persisted fee record. `sportEventId` is denormalized in from RegistrationApplied so
 *  fees can be listed per event via the `event-index` GSI (S1.1 read-model strategy). */
export interface FeeRecord { registrationId: string; sportEventId: string; status: FeeStatus }
/** Read seam for O12 fees. DynamoDB adapter queries `event-index`; a fake mirrors it in tests. */
export interface FeeReadStore { listByEvent(sportEventId: string): Promise<FeeRecord[]> }
