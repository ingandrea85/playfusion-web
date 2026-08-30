import type { Schedule, ScheduledMatch, TieOverride } from '../src/domain.js';
import type { ResourceConfig } from '../src/resources.js';
import type { EventSource, EventView, MatchRepository, ResourceRepository, ScheduleRepository, TeamSource, TieOverrideRepository } from '../src/ports.js';

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

export class InMemoryTieOverrideRepository implements TieOverrideRepository {
  private byEvent = new Map<string, TieOverride[]>();
  async list(id: string) { return this.byEvent.get(id) ?? []; }
  async upsert(o: TieOverride) {
    const rest = (this.byEvent.get(o.sportEventId) ?? []).filter((x) => !(x.categoryId === o.categoryId && x.groupLabel === o.groupLabel));
    this.byEvent.set(o.sportEventId, [...rest, o]);
  }
}

export class InMemoryResourceRepository implements ResourceRepository {
  private byId = new Map<string, ResourceConfig>();
  async get(id: string) { return this.byId.get(id); }
  async save(id: string, config: ResourceConfig) { this.byId.set(id, config); }
}

export class FakeTeamSource implements TeamSource {
  constructor(private readonly byEvent: Record<string, Record<string, string[]>> = {}) {}
  async confirmedByCategory(id: string) {
    return new Map(Object.entries(this.byEvent[id] ?? {}));
  }
}

import type { FinalsFormatRepository } from '../src/ports.js';
import type { CustomFinalsFormat } from '../src/finals-format.js';
export class InMemoryFinalsFormatRepository implements FinalsFormatRepository {
  readonly items = new Map<string, CustomFinalsFormat>();
  async listByOrg(organizationId: string) { return [...this.items.values()].filter((f) => (f as { organizationId?: string }).organizationId === organizationId); }
  async get(id: string) { return this.items.get(id); }
  async save(f: CustomFinalsFormat) { this.items.set(f.id, f); }
  async delete(id: string) { this.items.delete(id); }
}
