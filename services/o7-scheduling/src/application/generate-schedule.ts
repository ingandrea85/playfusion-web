import { buildFixtures } from '../fixtures.js';
import { autoSplit, canGenerate, categoryConfig, defaultConfig, type FixtureCategory, type Schedule, type ScheduleConfig } from '../domain.js';
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

    // Resolve each category's groups: the explicit o3 gironi composition (S8) when it exists
    // and is non-empty, otherwise the S7 auto-split of confirmed teams by config.groupsCount.
    const cats: FixtureCategory[] = event.categorie.map((categoria) => {
      const composed = event.gironi?.[categoria]?.groups;
      const groups = composed?.some((g) => g.teams.length)
        ? composed
        : autoSplit(byCategory.get(categoria) ?? [], input.config.groupsCount);
      // S22: each category plays on its own fields/timing/legs (byCategory override, else defaults).
      const cc = categoryConfig(input.config, categoria);
      return { id: categoria, name: categoria, legs: cc.legs, groups, fields: cc.fields, periods: cc.periods, periodMinutes: cc.periodMinutes, breakMinutes: cc.breakMinutes };
    });
    const fixtures = buildFixtures(input.sportEventId, event.dates.from, event.dates.to, input.config.dailyStart, input.config.slotsPerDay, cats);
    await matches.replace(input.sportEventId, fixtures);

    const next: Schedule = { ...current, organizationId: current.organizationId, config: input.config, status: 'GENERATED' };
    await schedules.save(next);
    return next;
  };
}
