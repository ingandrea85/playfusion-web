import { test, expect } from 'vitest';
import { buildFixtures } from '../src/fixtures.js';
import { autoSplit, categoryConfig, type FixtureCategory, type ScheduleConfig } from '../src/domain.js';

// Default per-category placement (2 fields, 2×20'+10' = 50' slots).
const base = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 };
const cat = (id: string, groups: FixtureCategory['groups'], over: Partial<FixtureCategory> = {}): FixtureCategory =>
  ({ id, name: id, legs: 'SINGLE', ...base, groups, ...over });

test('test_buildFixtures_roundRobinWithinEachResolvedGroup', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [
    { label: 'Girone A', teams: ['A', 'C'] }, { label: 'Girone B', teams: ['B', 'D'] },
  ])]);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' });
  expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' });
});

test('test_buildFixtures_doublesMatchesForHomeAway', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], { legs: 'HOME_AWAY' })]);
  expect(m).toHaveLength(6);
  expect(m.filter((x) => x.home === 'B' && x.away === 'A')).toHaveLength(1);
});

test('test_buildFixtures_placesFieldThenSlot', () => {
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C', 'D'] }])]);
  expect(m).toHaveLength(6);
  // slot = 2*20+10 = 50'; 2 fields → 3rd match wraps to the next slot on Campo A.
  expect(m[2]).toMatchObject({ field: 'Campo A', time: '09:50' });
});

test('test_buildFixtures_sharedFieldsLayOutSequentially', () => {
  // Two categories on the SAME fields → one cursor → sequential, no time collision.
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [
    cat('U10', [{ label: 'Girone A', teams: ['A', 'B'] }]),
    cat('U12', [{ label: 'Girone A', teams: ['C', 'D'] }]),
  ]);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ categoryId: 'U10', field: 'Campo A', time: '09:00' });
  expect(m[1]).toMatchObject({ categoryId: 'U12', field: 'Campo B', time: '09:00' }); // next field, same slot — distinct field, no clash
});

test('test_buildFixtures_perCategoryFieldsLayOutInParallelOnOwnFields', () => {
  // Distinct fields per category → independent cursors → both start at 09:00 on their own field.
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', [
    cat('U10', [{ label: 'Girone A', teams: ['A', 'B'] }], { fields: ['Campo Nord'] }),
    cat('U12', [{ label: 'Girone A', teams: ['C', 'D'] }], { fields: ['Campo Sud'] }),
  ]);
  expect(m).toHaveLength(2);
  expect(m[0]).toMatchObject({ categoryId: 'U10', field: 'Campo Nord', time: '09:00' });
  expect(m[1]).toMatchObject({ categoryId: 'U12', field: 'Campo Sud', time: '09:00' });
});

test('test_buildFixtures_perCategorySlotLengthDiffers', () => {
  // U10 short (1×10'+0 = 10' slots) on its own single field, single-day event → 3 matches
  // packed at 09:00 / 09:10 / 09:20 (auto slots/day = 3 to fit them in the one day).
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-29', '09:00', [
    cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], { fields: ['Campo Nord'], periods: 1, periodMinutes: 10, breakMinutes: 0 }),
  ]);
  expect(m).toHaveLength(3);
  expect(m[0]).toMatchObject({ time: '09:00', field: 'Campo Nord' });
  expect(m[1]).toMatchObject({ time: '09:10' });
  expect(m[2]).toMatchObject({ time: '09:20' });
});

test('test_buildFixtures_autoSlotsSpreadAcrossAvailableDays', () => {
  // 3 matches, 1 field, 3-day event → auto slots/day = 1 → one match per day, no collisions.
  const m = buildFixtures('evt-1', '2026-08-29', '2026-08-31', '09:00', [
    cat('U10', [{ label: 'Girone A', teams: ['A', 'B', 'C'] }], { fields: ['Campo Nord'] }),
  ]);
  expect(m).toHaveLength(3);
  expect(m.map((x) => x.day)).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  expect(m.every((x) => x.time === '09:00')).toBe(true);
});

test('test_categoryConfig_fallsBackToDefaultsThenOverride', () => {
  const config: ScheduleConfig = {
    fields: ['Campo A'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE',
    byCategory: { U14: { fields: ['Campo Grande'], periods: 2, periodMinutes: 30, breakMinutes: 5, legs: 'HOME_AWAY' } },
  };
  expect(categoryConfig(config, 'U10')).toMatchObject({ fields: ['Campo A'], legs: 'SINGLE' }); // default
  expect(categoryConfig(config, 'U14')).toMatchObject({ fields: ['Campo Grande'], periodMinutes: 30, legs: 'HOME_AWAY' }); // override
});

test('test_autoSplit_roundRobinFallback', () => {
  const groups = autoSplit(['A', 'B', 'C', 'D', 'E'], 2);
  expect(groups.map((g) => g.label)).toEqual(['Girone A', 'Girone B']);
  expect(groups[0]!.teams).toEqual(['A', 'C', 'E']);
  expect(groups[1]!.teams).toEqual(['B', 'D']);
});
