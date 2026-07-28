import { makeDocClient, EventBridgeEventPublisher, withCorrelation, checkpoint } from '@playfusion/platform-lib';
import { PutCommand } from '@aws-sdk/lib-dynamodb';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(process.env.EVENT_BUS_NAME ?? 'playfusion-pilot');

// EventBridge → Lambda: event.detail = { envelope, ...payload }
export const handler = async (event: any) => {
  const detail = event.detail ?? JSON.parse(event.Detail ?? '{}');
  return withCorrelation(detail.envelope?.correlationId ?? 'no-correlation', async () => {
    checkpoint('o12-onRegistrationApplied', 'START', { registrationId: detail.registrationId });
    await db.send(new PutCommand({ TableName: 'o12-fees', Item: { registrationId: detail.registrationId, status: 'Requested' } }));
    await publisher.publish('ParticipationFeeRequested', { registrationId: detail.registrationId, amountRef: 'fee-standard', payerContact: detail.participantRef }, detail.envelope?.organizationId ?? 'org-pilot');
    checkpoint('o12-onRegistrationApplied', 'STOP', { registrationId: detail.registrationId });
  });
};
