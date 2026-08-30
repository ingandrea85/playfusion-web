import { DomainError } from '@playfusion/platform-lib';
import { buildFixtures } from '../fixtures.js';
import { buildFinals, bracketFromParticipants } from '../finals.js';
import { compileFormat, type CustomFinalsFormat } from '../finals-format.js';
import { autoSplit, canGenerate, categoryConfig, defaultConfig, type FixtureCategory, type Schedule, type ScheduleConfig, type ScheduledMatch } from '../domain.js';
import { EventNotFoundError } from '../errors.js';
import type { EventSource, FinalsFormatRepository, MatchRepository, ScheduleRepository, TeamSource } from '../ports.js';

/** Add minutes to an 'HH:mm' clock (wraps at 24h; mirrors the fixtures placer). */
function addMinutes(hhmm: string, mins: number): string {
  const total = toMinutes(hhmm) + mins;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}
const toMinutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

/** S12/S13: build the finals matches for every category and place them on `finalsDate`.
 *  Finals must start AFTER the group matches of that day finish, so the start time is the latest
 *  group-match end on `finalsDate` (else `dailyStart`); from there time/field are sequential per
 *  category. NO cross-finals conflict-check (finals are few; declared simplification). Returns [] when
 *  no category has a finals format. `home`/`away` are placeholders resolved to real teams on read. */
function buildFinalMatches(
  sportEventId: string, finalsDate: string, dailyStart: string,
  cats: FixtureCategory[], config: ScheduleConfig, fixtures: ScheduledMatch[],
  formatMap: Map<string, CustomFinalsFormat | undefined>,
): ScheduledMatch[] {
  // Latest end among group fixtures scheduled on the finals day → finals start there (or dailyStart).
  const slotOf = new Map(cats.map((c) => [c.id, c.periods * c.periodMinutes + c.breakMinutes]));
  let startMin = toMinutes(dailyStart);
  for (const f of fixtures) {
    if (f.day !== finalsDate) continue;
    const end = toMinutes(f.time) + (slotOf.get(f.categoryId) ?? 0);
    if (end > startMin) startMin = end;
  }
  const finalsStart = `${String(Math.floor(startMin / 60) % 24).padStart(2, '0')}:${String(startMin % 60).padStart(2, '0')}`;

  const out: ScheduledMatch[] = [];
  let n = 0;
  for (const cat of cats) {
    // Finals format is per category (moved from the o3 event): the byCategory override else the
    // top-level default ("same play-config for all categories" flag). No format ⇒ skip this category.
    const cc = categoryConfig(config, cat.id);
    // SP1: a custom finals format (finalsFormatId) OVERRIDES the built-in finalsType for this category.
    let draws;
    if (cc.finalsFormatId) {
      const format = formatMap.get(cc.finalsFormatId);
      if (!format) continue; // catalog entry removed → no bracket for this category
      const totalTeams = cat.groups.reduce((sum, g) => sum + g.teams.length, 0);
      if (format.seeds > totalTeams) throw new DomainError('FINALS_SEEDS_EXCEED_TEAMS', `format "${format.name}" needs ${format.seeds} qualifiers but ${cat.id} has ${totalTeams}`, 422);
      draws = compileFormat(format);
    } else if (cc.finalsType && cc.finalsEnabled !== false) {
      draws = buildFinals(cat.groups.map((g) => ({ label: g.label, size: g.teams.length })), cc.finalsType, { finalsTeamsToBracket: cc.finalsTeamsToBracket, qualifiersPerGroup: cc.finalsQualifiersPerGroup, thirdPlace: cc.finalsThirdPlace });
    } else {
      continue;
    }
    const fields = cat.fields.length ? cat.fields : ['Campo 1'];
    const slotMinutes = cat.periods * cat.periodMinutes + cat.breakMinutes;
    draws.forEach((d, i) => {
      // Omit undefined placement fields — DynamoDB's document marshaller rejects `undefined`
      // (FINAL_GROUP draws carry no placement range).
      out.push({
        id: `fm-${++n}`, sportEventId, categoryId: cat.id, groupLabel: d.bracketLabel,
        day: finalsDate, time: addMinutes(finalsStart, Math.floor(i / fields.length) * slotMinutes),
        field: fields[i % fields.length]!, home: d.home, away: d.away, status: 'SCHEDULED',
        phase: d.phase, bracketLabel: d.bracketLabel, round: d.round, order: d.order, slot: d.slot,
        ...(d.placementFrom !== undefined ? { placementFrom: d.placementFrom } : {}),
        ...(d.placementTo !== undefined ? { placementTo: d.placementTo } : {}),
      });
    });
  }
  return out;
}

/** Epic #143 (S4) — `bracket` (solo tabellone): build each category's single-elimination bracket
 *  directly from its confirmed participants (no gironi, no standings). Round 1 carries real names; the
 *  per-category custom finals format (finalsFormatId) still governs the shape when set — its `Seed k`
 *  entry refs are substituted with the k-th participant, later `Vincente <slot>` links resolve on read.
 *  Absent a custom format, a default single-elim over all participants. Matches are placed on
 *  `finalsDate` from `dailyStart`, sequential per category (few matches, no cross-category conflict
 *  check — same simplification as the finals). */
const SEED_ONLY = /^Seed (\d+)$/;
function buildBracketMatches(
  sportEventId: string, finalsDate: string, dailyStart: string,
  categorie: string[], config: ScheduleConfig,
  byCategory: Map<string, string[]>, formatMap: Map<string, CustomFinalsFormat | undefined>,
): ScheduledMatch[] {
  const out: ScheduledMatch[] = [];
  let n = 0;
  for (const categoria of categorie) {
    const participants = byCategory.get(categoria) ?? [];
    if (participants.length < 2) continue; // nothing to bracket
    const cc = categoryConfig(config, categoria);
    let draws;
    if (cc.finalsFormatId) {
      const format = formatMap.get(cc.finalsFormatId);
      if (!format) continue; // catalog entry removed → no bracket for this category
      if (format.seeds > participants.length) throw new DomainError('FINALS_SEEDS_EXCEED_TEAMS', `format "${format.name}" needs ${format.seeds} qualifiers but ${categoria} has ${participants.length}`, 422);
      const sub = (label: string): string => { const m = SEED_ONLY.exec(label); return m ? (participants[Number(m[1]) - 1] ?? label) : label; };
      draws = compileFormat(format).map((d) => ({ ...d, home: sub(d.home), away: sub(d.away) }));
    } else {
      draws = bracketFromParticipants(participants, { thirdPlace: cc.finalsThirdPlace });
    }
    const fields = cc.fields.length ? cc.fields : ['Campo 1'];
    const slotMinutes = cc.periods * cc.periodMinutes + cc.breakMinutes;
    draws.forEach((d, i) => {
      out.push({
        id: `bm-${++n}`, sportEventId, categoryId: categoria, groupLabel: d.bracketLabel,
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
  formats: FinalsFormatRepository;
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

    // SP1: load the custom finals formats referenced by any category (global catalog), so the
    // synchronous bracket builder can compile them. Distinct ids only. (Needed by both paths.)
    const formatIds = [...new Set(event.categorie.map((c) => categoryConfig(input.config, c).finalsFormatId).filter((x): x is string => !!x))];
    const formatMap = new Map<string, CustomFinalsFormat | undefined>();
    for (const id of formatIds) formatMap.set(id, await deps.formats.get(id));

    let allMatches: ScheduledMatch[];
    if (event.format === 'bracket') {
      // Epic #143 (S4): solo tabellone — no gironi, no group fixtures, no standings; each category's
      // single-elimination bracket is seeded directly from its confirmed participants.
      allMatches = buildBracketMatches(input.sportEventId, input.config.finalsDate ?? event.dates.to, input.config.dailyStart, event.categorie, input.config, byCategory, formatMap);
    } else {
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
      const finals = buildFinalMatches(input.sportEventId, input.config.finalsDate ?? event.dates.to, input.config.dailyStart, cats, input.config, fixtures, formatMap);
      allMatches = [...fixtures, ...finals];
    }
    await matches.replace(input.sportEventId, allMatches);

    const next: Schedule = { ...current, organizationId: current.organizationId, config: input.config, status: 'GENERATED' };
    await schedules.save(next);
    return next;
  };
}
