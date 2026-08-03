import { makeDocClient, EventBridgeEventPublisher, withCorrelation, checkpoint, busName, resourceName } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import type { FeeRecord } from './ports/fee-read-store.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(busName());

/** Pure projection of the `RegistrationApplied` detail onto the o12-fees row.
 *  `sportEventId` is denormalized in here so the row can be listed per event via
 *  the `event-index` GSI (S4). Exported (rather than mocking the module-level
 *  DocClient) so the denormalization can be unit-tested directly. */
export const feeItem = (detail: { registrationId: string; sportEventId: string }): FeeRecord =>
  ({ registrationId: detail.registrationId, sportEventId: detail.sportEventId, status: 'Requested' });

// EventBridge → Lambda: event.detail = { envelope, ...payload }
export const handler = async (event: any) => {
  const detail = event.detail ?? JSON.parse(event.Detail ?? '{}');
  return withCorrelation(detail.envelope?.correlationId ?? 'no-correlation', async () => {
    checkpoint('o12-onRegistrationApplied', 'START', { registrationId: detail.registrationId });
    await db.send(new PutCommand({ TableName: resourceName('o12-fees'), Item: feeItem(detail) }));
    await publisher.publish('ParticipationFeeRequested', { registrationId: detail.registrationId, amountRef: 'fee-standard', payerContact: detail.participantRef }, detail.envelope?.organizationId ?? 'org-pilot');
    checkpoint('o12-onRegistrationApplied', 'STOP', { registrationId: detail.registrationId });
  });
};
