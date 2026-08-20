import { test, expect } from 'vitest';
import { matchEnd, teamFinishes, teamSizeOf, computeResourcePlan, DEFAULT_TEAM_SIZE, type Resource, type ResourceConfig } from '../src/resources.js';
import type { ScheduleConfig, ScheduledMatch } from '../src/domain.js';

const config: ScheduleConfig = { fields: ['C'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', groupsCount: 1, legs: 'SINGLE' }; // slot = 50'
let mid = 0;
const m = (home: string, away: string, time: string): ScheduledMatch =>
  ({ id: `m${++mid}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time, field: 'C', home, away });
const res = (resourceId: string, capacityPersons: number, over: Partial<Resource> = {}): Resource =>
  ({ resourceId, name: resourceId, occupancyMinutes: 30, offsetMinutes: 0, capacityPersons, ...over });
const plan = (matches: ScheduledMatch[], rc: ResourceConfig, teams: string[]) =>
  computeResourcePlan(matches, config, rc, new Map([['U10', teams]]));
const totalAssignments = (p: ReturnType<typeof plan>) => p.turns.reduce((n, t) => n + t.slots.reduce((k, s) => k + s.teams.length, 0), 0);
const slotsOf = (p: ReturnType<typeof plan>, rid: string) => p.turns.find((t) => t.resourceId === rid)!.slots;

test('test_matchEnd_addsCategorySlot', () => { expect(matchEnd(m('A', 'B', '09:00'), 50)).toBe('09:50'); });

test('test_teamFinishes_lastMatchOfDayPerTeam_sorted', () => {
  const day = teamFinishes([m('A', 'B', '09:00'), m('A', 'C', '10:00')], config, new Set(['A', 'B', 'C']))['2026-09-01']!;
  expect(day.find((f) => f.team === 'A')!.finish).toBe('10:50'); // last match end
  expect(day.find((f) => f.team === 'B')!.finish).toBe('09:50');
});
test('test_teamFinishes_ignoresUnknownLabels', () => {
  const day = teamFinishes([m('1ª Girone A', 'B', '09:00')], config, new Set(['B']))['2026-09-01']!;
  expect(day.map((f) => f.team)).toEqual(['B']);
});
test('test_teamSizeOf_overrideElseDefaultElse14', () => {
  expect(teamSizeOf({ resources: [], teamSizes: { A: 9 } }, 'A')).toBe(9);
  expect(teamSizeOf({ resources: [], defaultTeamSize: 12 }, 'A')).toBe(12);
  expect(teamSizeOf({ resources: [] }, 'A')).toBe(DEFAULT_TEAM_SIZE);
});

// --- global assignment (the S17 redesign) ---
test('test_plan_assignsEachTeamOnce_distributedAcrossResources', () => {
  // 4 teams of 14, two rooms of 20 → each team in exactly ONE room, load split 2+2 (not cloned).
  const p = plan([m('A', 'B', '09:00'), m('C', 'D', '09:00')], { resources: [res('R1', 20), res('R2', 20)] }, ['A', 'B', 'C', 'D']);
  expect(totalAssignments(p)).toBe(4);                       // was 8 (once per resource) before the fix
  expect(slotsOf(p, 'R1').reduce((n, s) => n + s.teams.length, 0)).toBe(2);
  expect(slotsOf(p, 'R2').reduce((n, s) => n + s.teams.length, 0)).toBe(2);
  const seen = p.turns.flatMap((t) => t.slots.flatMap((s) => s.teams.map((x) => x.team)));
  expect(new Set(seen).size).toBe(4);                        // no team appears twice
});

test('test_plan_tooSmallRoomGetsNoTeam_bigRoomTakesThem', () => {
  const p = plan([m('A', 'B', '09:00')], { resources: [res('SMALL', 10), res('BIG', 20)] }, ['A', 'B']);
  expect(slotsOf(p, 'SMALL')).toHaveLength(0);               // 14 > 10 → never placed here
  expect(totalAssignments(p)).toBe(2);
  expect(p.unassignable).toHaveLength(0);
});

test('test_plan_teamBiggerThanEveryRoom_isUnassignable', () => {
  const p = plan([m('X', 'A', '09:00')], { resources: [res('R1', 10), res('R2', 20)], teamSizes: { X: 25 } }, ['X', 'A']);
  expect(p.unassignable.map((u) => u.team)).toEqual(['X']);  // 25 > every capacity; A (14) fits R2
  expect(totalAssignments(p)).toBe(1);                        // only A got a slot
});

test('test_plan_smallTeamsShareASlot_whenCapacityAllows', () => {
  const p = plan([m('A', 'B', '09:00')], { resources: [res('R', 16)], teamSizes: { A: 8, B: 8 } }, ['A', 'B']);
  const slots = slotsOf(p, 'R');
  expect(slots).toHaveLength(1);
  expect(slots[0]!.persons).toBe(16);
  expect(slots[0]!.overflow).toBe(false);
});

test('test_plan_manualOverride_movesTeamAcrossResources', () => {
  const p = plan(
    [m('A', 'B', '09:00'), m('C', 'D', '09:00')],
    { resources: [res('R1', 20), res('R2', 20)], assignments: [{ resourceId: 'R2', day: '2026-09-01', team: 'A', slotTime: '11:00' }] },
    ['A', 'B', 'C', 'D']);
  const r2 = slotsOf(p, 'R2');
  const pinned = r2.find((s) => s.time === '11:00')!;
  expect(pinned.teams.map((t) => t.team)).toEqual(['A']);
  expect(pinned.teams[0]!.pinned).toBe(true);
  expect(slotsOf(p, 'R1').every((s) => !s.teams.some((t) => t.team === 'A'))).toBe(true); // no longer in R1
});
