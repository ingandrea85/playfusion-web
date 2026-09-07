import { makeDocClient, DynamoIdempotencyStore, withCorrelation, checkpoint, resourceName } from '@playfusion/platform-lib';
import { provision, type Deps } from './application/subscription.js';
import { defaultDeps } from './deps.js';

// The subset of the idempotency store the consumer needs (injectable for tests).
export interface IdempotencyGate {
  alreadyProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

// Provision a Stripe trial when an organization is created. Event-driven (Blueprint D-O11-3):
// o2 publishes `OrganizationCreated`; this consumer reacts. `provision` is itself idempotent, and
// the processed-events gate stops duplicate deliveries from re-running it.
export const consume = (deps: Deps, idempotency: IdempotencyGate) => async (event: any): Promise<void> => {
  const detail = event.detail ?? JSON.parse(event.Detail ?? '{}');
  const name = event['detail-type'] ?? event.DetailType;
  const eventId = detail.envelope?.eventId ?? 'unknown';
  if (await idempotency.alreadyProcessed(eventId)) { checkpoint('o11-consumer', 'SKIP', { eventId, name }); return; }
  if (name === 'OrganizationCreated') {
    const organizationId = detail.envelope?.organizationId ?? detail.organizationId;
    if (organizationId) await provision(deps)(organizationId, detail.email);
  }
  await idempotency.markProcessed(eventId);
};

const idempotency = new DynamoIdempotencyStore(makeDocClient(), resourceName('o11-processed-events'));

export const handler = async (event: any): Promise<void> => {
  const detail = event.detail ?? JSON.parse(event.Detail ?? '{}');
  return withCorrelation(detail.envelope?.correlationId ?? 'no-correlation', () => consume(defaultDeps(), idempotency)(event));
};
