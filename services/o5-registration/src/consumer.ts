import { makeDocClient, EventBridgeEventPublisher, DynamoIdempotencyStore, withCorrelation, checkpoint } from '@playfusion/platform-lib';
import { DynamoDbRegistrationRepository } from './adapters/dynamodb-registration-repository.js';
import { DynamoDbWindowRepository } from './adapters/dynamodb-window-repository.js';
import { DynamoDbParticipantDirectory } from './adapters/dynamodb-participant-directory.js';
import { onFeePaid } from './application/on-fee-paid.js';
import { onParticipantCreated } from './application/on-participant-created.js';
import { onEventPublished } from './application/on-event-published.js';

const db = makeDocClient();
const publisher = new EventBridgeEventPublisher(process.env.EVENT_BUS_NAME ?? 'playfusion-pilot');
const repo = new DynamoDbRegistrationRepository(db);
const windows = new DynamoDbWindowRepository(db);
const participants = new DynamoDbParticipantDirectory(db);
const idempotency = new DynamoIdempotencyStore(db, 'o5-processed-events');

export const handler = async (event: any) => {
  const detail = event.detail ?? JSON.parse(event.Detail ?? '{}');
  const name = event['detail-type'] ?? event.DetailType;
  const eventId = detail.envelope?.eventId ?? 'unknown';
  return withCorrelation(detail.envelope?.correlationId ?? 'no-correlation', async () => {
    if (await idempotency.alreadyProcessed(eventId)) { checkpoint('o5-consumer', 'SKIP', { eventId }); return; }
    if (name === 'ParticipationFeePaid') await onFeePaid({ repo, publisher })({ registrationId: detail.registrationId, organizationId: detail.envelope?.organizationId ?? 'org-pilot' });
    else if (name === 'ParticipantCreated') await onParticipantCreated({ participants })({ participantId: detail.participantId });
    else if (name === 'EventPublished') await onEventPublished({ windows })({ sportEventId: detail.sportEventId });
    await idempotency.markProcessed(eventId);
  });
};
