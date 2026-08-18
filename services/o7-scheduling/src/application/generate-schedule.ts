import { buildFixtures } from '../fixtures.js';
import { canGenerate, defaultConfig, type FixtureCategory, type Schedule, type ScheduleConfig } from '../domain.js';
import { EventNotFoundError } from '../errors.js';
import type { EventSource, MatchRepository, ScheduleRepository, TeamSource } from '../ports.js';

export interface GenerateScheduleDeps {
  schedules: ScheduleRepository;
  matches: MatchRepository;
  events: EventSource;
  teams: TeamSource;
}
export interface GenerateScheduleInput {
  sportEventId: string;
  organizationId: string;
  config: ScheduleConfig;
}

/** Generate the fixtures for an event from its confirmed teams (o5) and categories (o3),
 *  applying the S7 group config uniformly to every category. Regenerable while not yet
 *  approved; a no-op (returns the current schedule) once APPROVED/PUBLISHED. */
export function generateSchedule(deps: GenerateScheduleDeps) {
  return async (input: GenerateScheduleInput): Promise<Schedule> => {
    const { schedules, matches, events, teams } = deps;
    const existing = await schedules.get(input.sportEventId);
    const current: Schedule = existing ?? {
      sportEventId: input.sportEventId, organizationId: input.organizationId,
      status: 'NONE', config: defaultConfig(),
    };
    if (!canGenerate(current.status)) return current;

    const event = await events.get(input.sportEventId);
    if (!event) throw new EventNotFoundError(input.sportEventId);
    const byCategory = await teams.confirmedByCategory(input.sportEventId);

    const cats: FixtureCategory[] = event.categorie.map((categoria) => ({
      id: categoria, name: categoria,
      groupsCount: input.config.groupsCount, legs: input.config.legs,
      teams: byCategory.get(categoria) ?? [],
    }));
    const fixtures = buildFixtures(input.sportEventId, event.dates.from, event.dates.to, input.config, cats);
    await matches.replace(input.sportEventId, fixtures);

    const next: Schedule = { ...current, organizationId: current.organizationId, config: input.config, status: 'GENERATED' };
    await schedules.save(next);
    return next;
  };
}
