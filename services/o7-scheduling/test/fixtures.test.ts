import { test, expect } from 'vitest';
import { buildFixtures } from '../src/fixtures.js';
import { autoSplit, type FixtureCategory, type ScheduleConfig } from '../src/domain.js';

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8, groupsCount: 1, legs: 'SINGLE' };
const cat = (groups: FixtureCategory['groups'], legs: FixtureCategory['legs'] = 'SINGLE'): FixtureCategory =>
  ({ id: 'U10', name: 'U10', legs, groups });

test('test_buildFixtures_roundRobinWithinEachResolvedGroup', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, [cat([
    { label: 'Girone A', teams: ['A', 'C'] }, { label: 'Girone B', teams: ['B', 'D'] },
  ])]);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' });
  expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' });
});

test('test_buildFixtures_doublesMatchesForHomeAway', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, [cat([{ label: 'Girone A', teams: ['A', 'B', 'C'] }], 'HOME_AWAY')]);
  expect(m).toHaveLength(6);
  expect(m.filter((x) => x.home === 'B' && x.away === 'A')).toHaveLength(1);
});

test('test_buildFixtures_placesFieldThenSlot', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, [cat([{ label: 'Girone A', teams: ['A', 'B', 'C', 'D'] }])]);
  expect(m).toHaveLength(6);
  // slotMinutes = 2*20 + 10 = 50; 2 fields → the 3rd match wraps to the next slot on Campo A.
  expect(m[2]).toMatchObject({ field: 'Campo A', time: '09:50' });
});

test('test_buildFixtures_isDeterministicWithSmIds', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-29', config, [cat([{ label: 'Girone A', teams: ['A', 'B'] }])]);
  expect(m).toHaveLength(1);
  expect(m[0]!.id).toBe('sm-1');
  expect(m[0]).toMatchObject({ sportEventId: 'evt-1', categoryId: 'U10', home: 'A', away: 'B', day: '2026-08-29' });
});

test('test_buildFixtures_emptyWhenGroupsHaveNoTeams', () => {
  expect(buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, [cat([{ label: 'Girone A', teams: [] }])])).toHaveLength(0);
  expect(buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, [cat([])])).toHaveLength(0);
});

test('test_autoSplit_roundRobinFallback', () => {
  const groups = autoSplit(['A', 'B', 'C', 'D', 'E'], 2);
  expect(groups.map((g) => g.label)).toEqual(['Girone A', 'Girone B']);
  expect(groups[0]!.teams).toEqual(['A', 'C', 'E']);
  expect(groups[1]!.teams).toEqual(['B', 'D']);
});
