import { buildFixtures } from '../fixtures.js';
import { buildFinals } from '../finals.js';
import { autoSplit, canGenerate, categoryConfig, defaultConfig, type FixtureCategory, type Schedule, type ScheduleConfig, type ScheduledMatch } from '../domain.js';
import { EventNotFoundError } from '../errors.js';
import type { EventSource, MatchRepository, ScheduleRepository, TeamSource } from '../ports.js';

/** Add minutes to an 'HH:mm' clock (wraps at 24h; mirrors the fixtures placer). */
function addMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + mins;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** S12: build the finals bracket matches for every category (from its resolved group labels +
 *  the event's finalsType/qualifiersPerGroup) and place them on `finalsDate` — day fixed, time/field
 *  sequential per category from `dailyStart`, NO conflict-check (finals are few; declared
 *  simplification). Returns [] when no finalsType is configured. `home`/`away` are placeholders
 *  (`Nª Girone X`, `Vincente …`) resolved to real teams on read. */
function buildFinalMatches(
  sportEventId: string, finalsDate: string, dailyStart: string,
  cats: FixtureCategory[], config: ScheduleConfig,
): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  let n = 0;
  for (const cat of cats) {
    // Finals format is per category (moved from the o3 event): the byCategory override else the
    // top-level default ("same play-config for all categories" flag). No format ⇒ skip this category.
    const cc = categoryConfig(config, cat.id);
    if (!cc.finalsType || cc.finalsEnabled === false) continue;
    const draws = buildFinals(cat.groups.map((g) => ({ label: g.label, size: g.teams.length })), cc.finalsType, { finalsTeamsToBracket: cc.finalsTeamsToBracket });
    const fields = cat.fields.length ? cat.fields : ['Campo 1'];
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    draws.forEach((d, i) => {
      // Omit undefined placement fields — DynamoDB's document marshaller rejects `undefined`
      // (FINAL_GROUP draws carry no placement range).
      out.push({
        id: `fm-${++n}`, sportEventId, categoryId: cat.id, groupLabel: d.bracketLabel,
        day: finalsDate, time: addMinutes(dailyStart, Math.floor(i / fields.length) * slotMinutes),
        field: fields[i % fields.length]!, home: d.home, away: d.away, status: 'SCHEDULED',
        phase: d.phase, bracketLabel: d.bracketLabel, round: d.round, order: d.order, slot: d.slot,
        ...(d.placementFrom !== undefined ? { placementFrom: d.placementFrom } : {}),
        ...(d.placementTo !== undefined ? { placementTo: d.placementTo } : {}),
      });
    });
  }
  return out;
}

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
    const fixtures = buildFixtures(input.sportEventId, event.dates.from, event.dates.to, input.config.dailyStart, cats);
    // S12/S13: append each category's finals bracket (per-category format from the schedule config —
    // moved off the o3 event; buildFinalMatches skips categories with no format).
    const finals = buildFinalMatches(input.sportEventId, input.config.finalsDate ?? event.dates.to, input.config.dailyStart, cats, input.config);
    await matches.replace(input.sportEventId, [...fixtures, ...finals]);

    const next: Schedule = { ...current, organizationId: current.organizationId, config: input.config, status: 'GENERATED' };
    await schedules.save(next);
    return next;
  };
}
