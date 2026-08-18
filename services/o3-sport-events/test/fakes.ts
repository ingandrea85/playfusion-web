import type { EventReadStore } from '../src/ports/event-read-store.js';
import type { SportEvent } from '../src/domain.js';
import type { GironiRepository } from '../src/ports/gironi-repository.js';
import type { TeamSource } from '../src/ports/team-source.js';
import type { CategoryGironi, GironiMap } from '../src/gironi.js';

export class InMemoryEventStore implements EventReadStore {
  private byId = new Map<string, SportEvent>();
  async add(e: SportEvent) { this.byId.set(e.sportEventId, e); }
  async listByOrg(organizationId: string) {
    return [...this.byId.values()].filter(e => e.organizationId === organizationId);
  }
  async get(sportEventId: string) { return this.byId.get(sportEventId); }
}

export class InMemoryGironiRepository implements GironiRepository {
  private byEvent = new Map<string, GironiMap>();
  async get(sportEventId: string) { return this.byEvent.get(sportEventId) ?? {}; }
  async putCategory(sportEventId: string, categoria: string, gironi: CategoryGironi) {
    const map = this.byEvent.get(sportEventId) ?? {};
    map[categoria] = gironi;
    this.byEvent.set(sportEventId, map);
  }
}

export class FakeTeamSource implements TeamSource {
  constructor(private readonly byEvent: Record<string, Record<string, string[]>> = {}) {}
  async confirmedByCategory(sportEventId: string) {
    return new Map(Object.entries(this.byEvent[sportEventId] ?? {}));
  }
}
