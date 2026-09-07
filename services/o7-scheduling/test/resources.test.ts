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

test('test_plan_teamBiggerThanEveryRoom_splitsAcrossThePool', () => {
  // 25 people, rooms of 10 + 20 (pool 30 ≥ 25) → split across BOTH rooms, nothing unassignable.
  const p = plan([m('X', 'A', '09:00')], { resources: [res('R1', 10), res('R2', 20)], teamSizes: { X: 25 } }, ['X', 'A']);
  expect(p.unassignable).toHaveLength(0);
  const xInR1 = slotsOf(p, 'R1').flatMap((s) => s.teams).filter((t) => t.team === 'X');
  const xInR2 = slotsOf(p, 'R2').flatMap((s) => s.teams).filter((t) => t.team === 'X');
  expect(xInR1.reduce((n, t) => n + t.size, 0) + xInR2.reduce((n, t) => n + t.size, 0)).toBe(25); // portions sum to team size
  expect(xInR1.length + xInR2.length).toBe(2);               // appears in both rooms
});

test('test_plan_splitsBigTeam_thenSmallTeamFillsLeftoverSeats', () => {
  // The reported case: two rooms of 10, a team of 14 and a team of 6 finishing together.
  // 14 → 10 (room A) + 4 (room B); the 6 free seats in room B are then filled by the 6-team.
  const p = plan([m('BIG', 'SMALL', '09:00')], { resources: [res('A', 10), res('B', 10)], teamSizes: { BIG: 14, SMALL: 6 } }, ['BIG', 'SMALL']);
  expect(p.unassignable).toHaveLength(0);
  const seats = (rid: string, team: string) => slotsOf(p, rid).flatMap((s) => s.teams).filter((t) => t.team === team).reduce((n, t) => n + t.size, 0);
  expect(seats('A', 'BIG')).toBe(10);
  expect(seats('B', 'BIG')).toBe(4);
  expect(seats('B', 'SMALL')).toBe(6);                        // small team fills the leftover in room B
  // Room B slot holds BIG's 4 + SMALL's 6 = 10, exactly at capacity, no overflow.
  const bSlot = slotsOf(p, 'B').find((s) => s.teams.some((t) => t.team === 'SMALL'))!;
  expect(bSlot.persons).toBe(10);
  expect(bSlot.overflow).toBe(false);
});

test('test_plan_poolTooSmall_residualPeopleUnassignable', () => {
  // 14 people but the whole pool is only 5 + 5 = 10 → 10 seated (split), 4 unseated as residual.
  const p = plan([m('X', 'A', '09:00')], { resources: [res('R1', 5), res('R2', 5)], teamSizes: { X: 14, A: 5 } }, ['X', 'A']);
  const xResidual = p.unassignable.filter((u) => u.team === 'X');
  expect(xResidual).toHaveLength(1);
  expect(xResidual[0]!.size).toBe(4);                         // residual people, not the whole team
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
