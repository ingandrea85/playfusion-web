import { beforeEach, test, expect } from 'vitest';
import { generateSchedule } from '../../src/application/generate-schedule.js';
import { approveSchedule, publishSchedule } from '../../src/application/change-status.js';
import { getScheduleOrDefault, listMatches } from '../../src/application/read.js';
import { EventNotFoundError } from '../../src/errors.js';
import type { ScheduleConfig } from '../../src/domain.js';
import { FakeEventSource, FakeTeamSource, InMemoryMatchRepository, InMemoryScheduleRepository, InMemoryFinalsFormatRepository } from '../fakes.js';

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' };

let schedules: InMemoryScheduleRepository;
let matches: InMemoryMatchRepository;
let events: FakeEventSource;
let teams: FakeTeamSource;
let formats: InMemoryFinalsFormatRepository;
const deps = () => ({ schedules, matches, events, teams, formats });

beforeEach(() => {
  schedules = new InMemoryScheduleRepository();
  matches = new InMemoryMatchRepository();
  formats = new InMemoryFinalsFormatRepository();
  events = new FakeEventSource({ 'evt-1': { sportEventId: 'evt-1', dates: { from: '2026-08-29', to: '2026-08-30' }, categorie: ['U10', 'U12'] } });
  teams = new FakeTeamSource({ 'evt-1': { U10: ['A', 'B', 'C'], U12: ['X', 'Y'] } });
});

test('test_generate_producesMatchesFromConfirmedTeamsAndSetsGenerated', async () => {
  const s = await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config });
  expect(s.status).toBe('GENERATED');
  const m = await listMatches(matches)('evt-1');
  // U10: 3 teams single-leg = 3 pairs; U12: 2 teams = 1 pair → 4 matches.
  expect(m).toHaveLength(4);
  expect(m.some((x) => x.categoryId === 'U10')).toBe(true);
  expect(m.some((x) => x.categoryId === 'U12')).toBe(true);
});

test('test_generate_throwsWhenEventMissing', async () => {
  await expect(generateSchedule(deps())({ sportEventId: 'nope', organizationId: 'org-1', config }))
    .rejects.toBeInstanceOf(EventNotFoundError);
});

test('test_regenerate_replacesMatchesWithoutAccumulation', async () => {
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config });
  const first = (await listMatches(matches)('evt-1')).length;
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config });
  expect(await listMatches(matches)('evt-1')).toHaveLength(first);
});

test('test_approveThenPublish_advanceStatusAndLockGenerate', async () => {
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config });
  expect((await approveSchedule(schedules)('evt-1')).status).toBe('APPROVED');

  // generate is now a no-op: config stays, status stays APPROVED, matches unchanged.
  const before = await listMatches(matches)('evt-1');
  const s = await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config: { ...config, fields: ['X'] } });
  expect(s.status).toBe('APPROVED');
  expect(await listMatches(matches)('evt-1')).toHaveLength(before.length);

  expect((await publishSchedule(schedules)('evt-1')).status).toBe('PUBLISHED');
});

test('test_getScheduleOrDefault_isNoneForNeverScheduledEvent', async () => {
  const s = await getScheduleOrDefault(schedules)('evt-999', 'org-1');
  expect(s.status).toBe('NONE');
  expect(s.config.groupsCount).toBe(1);
});

test('test_approve_throwsWhenNoScheduleExists', async () => {
  await expect(approveSchedule(schedules)('evt-1')).rejects.toBeInstanceOf(EventNotFoundError);
});

test('test_homeAwayDoublesFixtures', async () => {
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config: { ...config, legs: 'HOME_AWAY' } });
  // U10: 3 pairs ×2 = 6; U12: 1 pair ×2 = 2 → 8.
  expect(await listMatches(matches)('evt-1')).toHaveLength(8);
});

test('test_generate_usesExplicitGironiCompositionWhenPresent', async () => {
  // o3 gironi splits U10 into two groups; the fixtures must follow that composition, not
  // the auto-split. U10 groups [A,B] & [C] → 1 pair (A-B) + 0; U12 has no composition →
  // auto-split of its 2 confirmed teams → 1 pair. Total 2.
  events = new FakeEventSource({ 'evt-1': {
    sportEventId: 'evt-1', dates: { from: '2026-08-29', to: '2026-08-30' }, categorie: ['U10', 'U12'],
    gironi: { U10: { groups: [{ label: 'Girone A', teams: ['A', 'B'] }, { label: 'Girone B', teams: ['C'] }], locked: false } },
  } });
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config: { ...config, groupsCount: 1 } });
  const m = await listMatches(matches)('evt-1');
  const u10 = m.filter((x) => x.categoryId === 'U10');
  expect(u10).toHaveLength(1);
  expect(u10[0]).toMatchObject({ groupLabel: 'Girone A', home: 'A', away: 'B' });
  expect(m.filter((x) => x.categoryId === 'U12')).toHaveLength(1); // auto-split fallback
});

test('test_generate_appendsFinalsWhenFinalsTypeConfigured', async () => {
  // U10 with an explicit single group of 3 + SINGLE_GROUP_CROSSOVER Q2 → one Tabellone final appended.
  events = new FakeEventSource({ 'evt-f': {
    sportEventId: 'evt-f', dates: { from: '2026-08-29', to: '2026-08-31' }, categorie: ['U10'],
    gironi: { U10: { groups: [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], locked: true } },
  } });
  teams = new FakeTeamSource({ 'evt-f': { U10: ['A', 'B', 'C'] } });
  // Finals format now lives on the schedule config (per-category; here the top-level default = all).
  await generateSchedule(deps())({ sportEventId: 'evt-f', organizationId: 'org-1', config: { ...config, finalsDate: '2026-08-31', finalsType: 'SINGLE_GROUP_CROSSOVER' } });
  const all = await matches.list('evt-f');
  const finals = all.filter((m) => m.phase === 'FINAL');
  expect(finals).toHaveLength(1); // v1 SINGLE_GROUP_CROSSOVER: 3 teams → floor(3/2)=1 placement final
  expect(finals[0]).toMatchObject({ phase: 'FINAL', bracketLabel: 'Finali', round: 'Finale 1º/2º', home: '1ª Girone A', away: '2ª Girone A', day: '2026-08-31', status: 'SCHEDULED', placementFrom: 1, placementTo: 2, slot: 'F1' });
  expect(all.filter((m) => m.phase !== 'FINAL')).toHaveLength(3); // 3 group fixtures unaffected
});

test('test_generate_noFinalsWhenNoFinalsType', async () => {
  const all = await (async () => {
    await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config });
    return matches.list('evt-1');
  })();
  expect(all.some((m) => m.phase === 'FINAL')).toBe(false);
});

test('test_generate_finalsMatchesHaveNoUndefinedValues_splitGroup', async () => {
  // Regression: FINAL_GROUP draws carry no placement range; the persisted match objects must not
  // contain `undefined` values (DynamoDB's document marshaller rejects them → 500 on generate).
  events = new FakeEventSource({ 'evt-s': {
    sportEventId: 'evt-s', dates: { from: '2026-08-29', to: '2026-08-31' }, categorie: ['U10'],
    gironi: { U10: { groups: [{ label: 'Girone A', teams: ['A', 'B', 'C', 'D'] }], locked: true } },
  } });
  teams = new FakeTeamSource({ 'evt-s': { U10: ['A', 'B', 'C', 'D'] } });
  await generateSchedule(deps())({ sportEventId: 'evt-s', organizationId: 'org-1', config: { ...config, finalsDate: '2026-08-31', finalsType: 'SPLIT_GROUP_FINALS', finalsTeamsToBracket: 2 } });
  const all = await matches.list('evt-s');
  expect(all.some((m) => m.phase === 'FINAL')).toBe(true);
  expect(all.some((m) => m.phase === 'FINAL_GROUP')).toBe(true);
  for (const m of all) for (const [k, v] of Object.entries(m)) expect(v, `${m.id}.${k} is undefined`).not.toBeUndefined();
})

test('test_generate_perCategoryFinalsFormats', async () => {
  // Two categories, different finals formulas via byCategory: U10 SINGLE_GROUP_CROSSOVER, U12 none.
  events = new FakeEventSource({ 'evt-pc': {
    sportEventId: 'evt-pc', dates: { from: '2026-08-29', to: '2026-08-31' }, categorie: ['U10', 'U12'],
    gironi: {
      U10: { groups: [{ label: 'Girone A', teams: ['A', 'B', 'C', 'D'] }], locked: true },
      U12: { groups: [{ label: 'Girone A', teams: ['X', 'Y', 'Z'] }], locked: true },
    },
  } });
  teams = new FakeTeamSource({ 'evt-pc': { U10: ['A', 'B', 'C', 'D'], U12: ['X', 'Y', 'Z'] } });
  const cat = (over: any) => ({ fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE' as const, ...over })
  await generateSchedule(deps())({ sportEventId: 'evt-pc', organizationId: 'org-1', config: {
    ...config, finalsDate: '2026-08-31',
    byCategory: {
      U10: cat({ finalsType: 'SINGLE_GROUP_CROSSOVER' }),
      U12: cat({}), // no finals for U12
    },
  } });
  const all = await matches.list('evt-pc');
  const u10Finals = all.filter((m) => m.categoryId === 'U10' && m.phase === 'FINAL');
  const u12Finals = all.filter((m) => m.categoryId === 'U12' && m.phase === 'FINAL');
  expect(u10Finals.length).toBeGreaterThan(0); // U10 has a bracket
  expect(u12Finals).toHaveLength(0);           // U12 has none
})

test('test_generate_finalsStartAfterGroupMatchesOnFinalsDay', async () => {
  // Single-day event: finals must be scheduled AFTER the last group match of that day, not overlap it.
  events = new FakeEventSource({ 'evt-1d': {
    sportEventId: 'evt-1d', dates: { from: '2026-09-01', to: '2026-09-01' }, categorie: ['U10'],
    gironi: { U10: { groups: [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], locked: true } },
  } });
  teams = new FakeTeamSource({ 'evt-1d': { U10: ['A', 'B', 'C'] } });
  await generateSchedule(deps())({ sportEventId: 'evt-1d', organizationId: 'org-1', config: { ...config, finalsType: 'SINGLE_GROUP_CROSSOVER' } });
  const all = await matches.list('evt-1d');
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };
  const slot = config.periods * config.periodMinutes + config.breakMinutes; // 50
  const groups = all.filter((m) => m.phase !== 'FINAL');
  const finals = all.filter((m) => m.phase === 'FINAL');
  const lastGroupEnd = Math.max(...groups.filter((m) => m.day === '2026-09-01').map((m) => toMin(m.time) + slot));
  expect(finals.length).toBeGreaterThan(0);
  for (const f of finals) expect(toMin(f.time)).toBeGreaterThanOrEqual(lastGroupEnd);
})

test('test_generate_customFormat_emitsCompiledDrawsWithSeedPlaceholders', async () => {
  await formats.save({ id: 'fmt1', name: 'Finale secca', seeds: 2, createdAt: 't',
    rounds: [{ name: 'Finale', matches: [{ slot: 'F', home: { seed: 1 }, away: { seed: 2 }, placementFrom: 1, placementTo: 2 }] }] });
  const cfg: ScheduleConfig = { ...config, byCategory: { U12: { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE', finalsFormatId: 'fmt1' } } };
  await generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config: cfg });
  const final = (await listMatches(matches)('evt-1')).find((x) => x.categoryId === 'U12' && x.phase === 'FINAL');
  expect(final).toMatchObject({ slot: 'F', home: 'Seed 1', away: 'Seed 2', placementFrom: 1, placementTo: 2 });
});

test('test_generate_customFormat_seedsExceedingQualifiers_throws422', async () => {
  await formats.save({ id: 'big', name: 'Troppi seed', seeds: 8, createdAt: 't',
    rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { seed: 2 } }] }] });
  const cfg: ScheduleConfig = { ...config, byCategory: { U12: { fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, legs: 'SINGLE', finalsFormatId: 'big' } } };
  await expect(generateSchedule(deps())({ sportEventId: 'evt-1', organizationId: 'org-1', config: cfg })).rejects.toMatchObject({ httpStatus: 422 });
});
