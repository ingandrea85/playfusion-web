import type { Schedule, ScheduledMatch } from '../src/domain.js';
import type { EventSource, EventView, MatchRepository, ScheduleRepository, TeamSource } from '../src/ports.js';

export class InMemoryScheduleRepository implements ScheduleRepository {
  private byId = new Map<string, Schedule>();
  async get(id: string) { return this.byId.get(id); }
  async save(s: Schedule) { this.byId.set(s.sportEventId, { ...s }); }
}

export class InMemoryMatchRepository implements MatchRepository {
  private byId = new Map<string, ScheduledMatch[]>();
  async list(id: string) { return this.byId.get(id) ?? []; }
  async replace(id: string, matches: ScheduledMatch[]) { this.byId.set(id, matches); }
}

export class FakeEventSource implements EventSource {
  constructor(private readonly events: Record<string, EventView> = {}) {}
  async get(id: string) { return this.events[id]; }
}

export class FakeTeamSource implements TeamSource {
  constructor(private readonly byEvent: Record<string, Record<string, string[]>> = {}) {}
  async confirmedByCategory(id: string) {
    return new Map(Object.entries(this.byEvent[id] ?? {}));
  }
}
