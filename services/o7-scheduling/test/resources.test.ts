import { test, expect } from 'vitest';
import { matchEnd, teamFinishes, teamSizeOf, resourceTurns, computeResourcePlan, DEFAULT_TEAM_SIZE, type Resource, type TeamFinish } from '../src/resources.js';
import type { ScheduleConfig, ScheduledMatch } from '../src/domain.js';

const config: ScheduleConfig = { fields: ['C'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }; // slot = 50'
const m = (over: Partial<ScheduledMatch>): ScheduledMatch =>
  ({ id: 'x', sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home: 'A', away: 'B', ...over });
const shower: Resource = { resourceId: 'r', name: 'Docce', icon: '🚿', occupancyMinutes: 30, capacityPersons: 16, offsetMinutes: 0 };
const sizeMap = (m: Record<string, number>) => (team: string) => m[team] ?? DEFAULT_TEAM_SIZE;
const fin = (team: string, finish: string, categoryId = 'U10'): TeamFinish => ({ team, categoryId, finish });

test('test_matchEnd_addsCategorySlot', () => {
  expect(matchEnd(m({ time: '09:00' }), 50)).toBe('09:50');
});

test('test_teamFinishes_lastMatchOfDayPerTeam_sorted', () => {
  const ms = [m({ time: '09:00', home: 'A', away: 'B' }), m({ time: '10:00', home: 'A', away: 'C' })]; // A plays twice
  const byDay = teamFinishes(ms, config, new Set(['A', 'B', 'C']));
  const day = byDay['2026-09-01']!;
  expect(day.find((f) => f.team === 'A')!.finish).toBe('10:50'); // last match end (10:00 + 50)
  expect(day.find((f) => f.team === 'B')!.finish).toBe('09:50');
  expect(day.map((f) => f.finish)).toEqual([...day.map((f) => f.finish)].sort()); // sorted by finish
});

test('test_teamFinishes_ignoresUnknownLabels', () => {
  const ms = [m({ home: '1ª Girone A', away: 'B' })]; // a finals placeholder is not a known team
  const day = teamFinishes(ms, config, new Set(['B']))['2026-09-01']!;
  expect(day.map((f) => f.team)).toEqual(['B']);
});

test('test_teamSizeOf_overrideElseDefaultElse14', () => {
  expect(teamSizeOf({ resources: [], teamSizes: { A: 9 } }, 'A')).toBe(9);
  expect(teamSizeOf({ resources: [], defaultTeamSize: 12 }, 'A')).toBe(12);
  expect(teamSizeOf({ resources: [] }, 'A')).toBe(14);
});

test('test_resourceTurns_smallTeamsShareASlot', () => {
  const slots = resourceTurns([fin('A', '10:00'), fin('B', '10:00')], shower, sizeMap({ A: 8, B: 8 }));
  expect(slots).toHaveLength(1);
  expect(slots[0]!.persons).toBe(16);
  expect(slots[0]!.overflow).toBe(false);
});

test('test_resourceTurns_capacityOpensNewSlot', () => {
  const slots = resourceTurns([fin('A', '10:00'), fin('B', '10:00'), fin('C', '10:00')], shower, sizeMap({ A: 8, B: 8, C: 8 }));
  expect(slots).toHaveLength(2); // 8+8 fill the first (16), the third opens a new slot
});

test('test_resourceTurns_loneOversizedTeamOverflows', () => {
  const slots = resourceTurns([fin('X', '10:00')], shower, sizeMap({ X: 20 }));
  expect(slots).toHaveLength(1);
  expect(slots[0]!.overflow).toBe(true);
});

test('test_resourceTurns_offsetShiftsReadyTime', () => {
  const slots = resourceTurns([fin('A', '10:00')], { ...shower, offsetMinutes: 40 }, sizeMap({ A: 8 }));
  expect(slots[0]!.time).toBe('10:40'); // ready = finish + offset
});

test('test_resourceTurns_manualOverride_regroupsTeam', () => {
  const slots = resourceTurns(
    [fin('A', '10:00'), fin('B', '10:00')], shower, sizeMap({ A: 8, B: 8 }),
    [{ resourceId: 'r', day: '2026-09-01', team: 'B', slotTime: '11:00' }]);
  const at11 = slots.find((s) => s.time === '11:00')!;
  expect(at11.teams.map((t) => t.team)).toEqual(['B']);
  expect(at11.teams[0]!.pinned).toBe(true);
  expect(slots.find((s) => s.time === '10:00')!.teams.map((t) => t.team)).toEqual(['A']);
});

test('test_computeResourcePlan_endToEnd', () => {
  const ms = [m({ time: '09:00', home: 'A', away: 'B' })];
  const plan = computeResourcePlan(ms, config, { resources: [shower], teamSizes: { A: 8, B: 8 } }, new Map([['U10', ['A', 'B']]]));
  expect(plan.days).toEqual(['2026-09-01']);
  expect(plan.teams.map((t) => `${t.team}:${t.size}`)).toEqual(['A:8', 'B:8']);
  const turns = plan.turns.find((t) => t.resourceId === 'r' && t.day === '2026-09-01')!;
  expect(turns.slots).toHaveLength(1); // A+B (8+8) share the 16-person shower
  expect(turns.slots[0]!.persons).toBe(16);
});
