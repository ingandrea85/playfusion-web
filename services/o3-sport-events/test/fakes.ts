import type { EventReadStore } from '../src/ports/event-read-store.js';
import type { SportEvent } from '../src/domain.js';

export class InMemoryEventStore implements EventReadStore {
  private byId = new Map<string, SportEvent>();
  async add(e: SportEvent) { this.byId.set(e.sportEventId, e); }
  async listByOrg(organizationId: string) {
    return [...this.byId.values()].filter(e => e.organizationId === organizationId);
  }
  async get(sportEventId: string) { return this.byId.get(sportEventId); }
}
