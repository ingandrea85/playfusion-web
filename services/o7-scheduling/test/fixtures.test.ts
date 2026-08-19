import { test, expect } from 'vitest';
import { buildFixtures } from '../src/fixtures.js';
import { autoSplit, categoryConfig, type FixtureCategory, type ScheduleConfig, type ScheduledMatch } from '../src/domain.js';

const base = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 };
const cat = (id: string, groups: FixtureCategory['groups'], over: Partial<FixtureCategory> = {}): FixtureCategory =>
  ({ id, name: id, legs: 'SINGLE', ...base, groups, ...over });

/** The hard constraint: a team plays at most one match per (day, time). */
function assertNoTeamTwicePerSlot(matches: ScheduledMatch[]): void {
  const bySlot = new Map<string, string[]>();
  for (const m of matches) {
    const k = `${m.day} ${m.time}`;
    const teams = bySlot.get(k) ?? [];
    expect(teams).not.toContain(m.home);
    expect(teams).not.toContain(m.away);
    teams.push(m.home, m.away); bySlot.set(k, teams);
  }
}
/** No two matches on the same field at the same day+time. */
function assertNoFieldDoubleBooked(matches: ScheduledMatch[]): void {
  const seen = new Set<string>();
  for (const m of matches) { const k = `${m.day} ${m.time} ${m.field}`; expect(seen.has(k)).toBe(false); seen.add(k); }
}

test('test_buildFixtures_roundRobinWithinEachResolvedGroup_parallelOnFields', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [
    { label: 'Girone A', teams: ['A', 'C'] }, { label: 'Girone B', teams: ['B', 'D'] },
  ])]);
  expect(m).toHaveLength(2);
  // Distinct teams → the two matches share the 09:00 slot on different fields (day 1).
  expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' });
  expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00', day: '2026-08-29' });
  assertNoTeamTwicePerSlot(m);
});

test('test_buildFixtures_neverSchedulesATeamTwiceInTheSameSlot_homeAway', () => {
  // The reported bug: a girone with home & away legs on 2 fields must NOT put a team on two
  // fields at the same time.
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-31', '09:00',
    [cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], { legs: 'HOME_AWAY' })]);
  expect(m).toHaveLength(6); // 3 pairs × 2 legs
  assertNoTeamTwicePerSlot(m);
  assertNoFieldDoubleBooked(m);
  expect(m.filter((x) => x.home === 'B' && x.away === 'A')).toHaveLength(1); // the return leg exists
});

test('test_buildFixtures_spreadsConflictingMatchesAcrossDays', () => {
  // 3 teams, single field, 3-day event → each match on its own day (they pairwise share a team).
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-31', '09:00',
    [cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], { fields: ['Campo Nord'] })]);
  expect(m).toHaveLength(3);
  expect(new Set(m.map((x) => x.day)).size).toBe(3); // spread across the 3 days
  expect(m.every((x) => x.time === '09:00')).toBe(true);
  assertNoTeamTwicePerSlot(m);
});

test('test_buildFixtures_distinctTeamsShareASlotOnDifferentFields', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-29', '09:00',
    [cat('U10', [{ label: 'Girone A', teams: ['A', 'B'] }, { label: 'Girone B', teams: ['C', 'D'] }])]);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ time: '09:00', field: 'Campo A' });
  expect(m[1]).toMatchObject({ time: '09:00', field: 'Campo B' }); // parallel — distinct teams, same slot
  assertNoTeamTwicePerSlot(m);
});

test('test_buildFixtures_perCategoryOwnFields', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [
    cat('U10', [{ label: 'Girone A', teams: ['A', 'B'] }], { fields: ['Campo Nord'] }),
    cat('U12', [{ label: 'Girone A', teams: ['C', 'D'] }], { fields: ['Campo Sud'] }),
  ]);
  expect(m.find((x) => x.categoryId === 'U10')!.field).toBe('Campo Nord');
  expect(m.find((x) => x.categoryId === 'U12')!.field).toBe('Campo Sud');
  assertNoTeamTwicePerSlot(m);
});

test('test_buildFixtures_isDeterministicWithSmIds', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-29', '09:00', [cat('U10', [{ label: 'Girone A', teams: ['A', 'B'] }])]);
  expect(m).toHaveLength(1);
  expect(m[0]!.id).toBe('sm-1');
  expect(m[0]).toMatchObject({ sportEventId: 'evt-1', categoryId: 'U10', home: 'A', away: 'B', day: '2026-08-29' });
});

test('test_buildFixtures_emptyWhenGroupsHaveNoTeams', () => {
  expect(buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [{ label: 'Girone A', teams: [] }])])).toHaveLength(0);
  expect(buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [])])).toHaveLength(0);
});

test('test_autoSplit_roundRobinFallback', () => {
  const groups = autoSplit(['A', 'B', 'C', 'D', 'E'], 2);
  expect(groups.map((g) => g.label)).toEqual(['Girone A', 'Girone B']);
  expect(groups[0]!.teams).toEqual(['A', 'C', 'E']);
  expect(groups[1]!.teams).toEqual(['B', 'D']);
});

test('test_categoryConfig_fallsBackToDefaultsThenOverride', () => {
  const config: ScheduleConfig = {
    fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE',
    byCategory: { U14: { fields: ['Campo Grande'], periods: 2, periodMinutes: 30, breakMinutes: 5, legs: 'HOME_AWAY' } },
  };
  expect(categoryConfig(config, 'U10')).toMatchObject({ fields: ['Campo A'], legs: 'SINGLE' });
  expect(categoryConfig(config, 'U14')).toMatchObject({ fields: ['Campo Grande'], periodMinutes: 30, legs: 'HOME_AWAY' });
});
