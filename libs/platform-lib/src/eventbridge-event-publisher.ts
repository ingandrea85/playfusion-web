import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import type { EventPublisher } from './event-publisher.js';
import { makeEnvelope } from './envelope.js';
import { checkpoint } from './logging.js';

export class EventBridgeEventPublisher implements EventPublisher {
  private readonly client: EventBridgeClient;
  constructor(private readonly busName: string, client?: EventBridgeClient) {
    this.client = client ?? new EventBridgeClient({ endpoint: process.env.AWS_ENDPOINT_URL });
  }
  async publish(name: string, payload: Record<string, unknown>, organizationId: string): Promise<void> {
    const envelope = makeEnvelope(organizationId, new Date());
    await this.client.send(new PutEventsCommand({
      Entries: [{
        EventBusName: this.busName,
        Source: 'playfusion.pilot',
        DetailType: name,
        Detail: JSON.stringify({ envelope, ...payload }),
      }],
    }));
    checkpoint(name, 'PUBLISHED', { eventId: envelope.eventId });
  }
}
