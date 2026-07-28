import type { EventPublisher } from './event-publisher.js';

export class RecordingEventPublisher implements EventPublisher {
  readonly published: Array<{ name: string } & Record<string, unknown>> = [];
  async publish(name: string, payload: Record<string, unknown>): Promise<void> {
    this.published.push({ name, ...payload });
  }
}
