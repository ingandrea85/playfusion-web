import { beforeEach, test, expect } from 'vitest';
import { generateSchedule } from '../../src/application/generate-schedule.js';
import { approveSchedule, publishSchedule } from '../../src/application/change-status.js';
import { getScheduleOrDefault, listMatches } from '../../src/application/read.js';
import { EventNotFoundError } from '../../src/errors.js';
import type { ScheduleConfig } from '../../src/domain.js';
import { FakeEventSource, FakeTeamSource, InMemoryMatchRepository, InMemoryScheduleRepository } from '../fakes.js';

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' };

let schedules: InMemoryScheduleRepository;
let matches: InMemoryMatchRepository;
let events: FakeEventSource;
let teams: FakeTeamSource;
const deps = () => ({ schedules, matches, events, teams });

beforeEach(() => {
  schedules = new InMemoryScheduleRepository();
  matches = new InMemoryMatchRepository();
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
