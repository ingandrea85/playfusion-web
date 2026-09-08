import { test, expect } from 'vitest';
import { matchEnd, teamFinishes, teamSizeOf, computeResourcePlan, DEFAULT_TEAM_SIZE, buildPlanNodes, topoOrder, validateResourceConfig, type Resource, type ResourceConfig, type ResourceConfig as RC, type Checkoff } from '../src/resources.js';
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
// NOTE (Task A2, node-graph rewrite): with the S17-follow-up node graph, plain `resources` with no
// `groups` are INDEPENDENT STAGES — a team visits every one of them (see
// test_plan_ungroupedResources_areIndependentStages_teamVisitsBoth below), not alternatives sharing one
// pool. The pool-sharing / bin-packing behavior these tests exercise now lives at the GROUP level (a
// group's members share one pool, exactly like the old flat `resources` list did). So each test below
// was updated to wrap its resources in a single-group config — this reproduces the exact original
// assertions (same algorithm, `packArrivals`, now scoped to the group's pool) while staying correct
// under the new independent-stage default for ungrouped resources.
test('test_plan_assignsEachTeamOnce_distributedAcrossResources', () => {
  // 4 teams of 14, two rooms of 20 grouped into one pool → each team in exactly ONE room, load split 2+2.
  const p = plan([m('A', 'B', '09:00'), m('C', 'D', '09:00')],
    { resources: [res('R1', 20), res('R2', 20)], groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['R1', 'R2'] }] },
    ['A', 'B', 'C', 'D']);
  expect(totalAssignments(p)).toBe(4);                       // was 8 (once per resource) before the fix
  expect(slotsOf(p, 'R1').reduce((n, s) => n + s.teams.length, 0)).toBe(2);
  expect(slotsOf(p, 'R2').reduce((n, s) => n + s.teams.length, 0)).toBe(2);
  const seen = p.turns.flatMap((t) => t.slots.flatMap((s) => s.teams.map((x) => x.team)));
  expect(new Set(seen).size).toBe(4);                        // no team appears twice
});

test('test_plan_tooSmallRoomGetsNoTeam_bigRoomTakesThem', () => {
  const p = plan([m('A', 'B', '09:00')],
    { resources: [res('SMALL', 10), res('BIG', 20)], groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['SMALL', 'BIG'] }] },
    ['A', 'B']);
  expect(slotsOf(p, 'SMALL')).toHaveLength(0);               // 14 > 10 → never placed here
  expect(totalAssignments(p)).toBe(2);
  expect(p.unassignable).toHaveLength(0);
});

test('test_plan_teamBiggerThanEveryRoom_splitsAcrossThePool', () => {
  // 25 people, rooms of 10 + 20 grouped into one pool (30 ≥ 25) → split across BOTH rooms, nothing unassignable.
  const p = plan([m('X', 'A', '09:00')],
    { resources: [res('R1', 10), res('R2', 20)], teamSizes: { X: 25 }, groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['R1', 'R2'] }] },
    ['X', 'A']);
  expect(p.unassignable).toHaveLength(0);
  const xInR1 = slotsOf(p, 'R1').flatMap((s) => s.teams).filter((t) => t.team === 'X');
  const xInR2 = slotsOf(p, 'R2').flatMap((s) => s.teams).filter((t) => t.team === 'X');
  expect(xInR1.reduce((n, t) => n + t.size, 0) + xInR2.reduce((n, t) => n + t.size, 0)).toBe(25); // portions sum to team size
  expect(xInR1.length + xInR2.length).toBe(2);               // appears in both rooms
});

test('test_plan_splitsBigTeam_thenSmallTeamFillsLeftoverSeats', () => {
  // The reported case: two rooms of 10 grouped into one pool, a team of 14 and a team of 6 finishing together.
  // 14 → 10 (room A) + 4 (room B); the 6 free seats in room B are then filled by the 6-team.
  const p = plan([m('BIG', 'SMALL', '09:00')],
    { resources: [res('A', 10), res('B', 10)], teamSizes: { BIG: 14, SMALL: 6 }, groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['A', 'B'] }] },
    ['BIG', 'SMALL']);
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
  // 14 people but the whole pool (grouped) is only 5 + 5 = 10 → 10 seated (split), 4 unseated as residual.
  const p = plan([m('X', 'A', '09:00')],
    { resources: [res('R1', 5), res('R2', 5)], teamSizes: { X: 14, A: 5 }, groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['R1', 'R2'] }] },
    ['X', 'A']);
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

// --- resource groups & relations node graph (S17 follow-up) ---
const R = (resourceId: string, over: Partial<Resource> = {}) =>
  ({ resourceId, name: resourceId, occupancyMinutes: 30, capacityPersons: 10, offsetMinutes: 0, ...over });

test('test_buildPlanNodes_groupIsOneNode_ungroupedAreOwnNodes', () => {
  const rc: RC = { resources: [R('s1'), R('s2'), R('mensa', { offsetMinutes: 5 })],
    groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }] };
  const nodes = buildPlanNodes(rc);
  expect(nodes.map((n) => n.nodeId).sort()).toEqual(['docce', 'mensa']);
  const docce = nodes.find((n) => n.nodeId === 'docce')!;
  expect(docce.kind).toBe('group');
  expect(docce.pool.map((r) => r.resourceId)).toEqual(['s1', 's2']);
  expect(docce.anchorOffset).toBe(0);         // first member's offset
  expect(nodes.find((n) => n.nodeId === 'mensa')!.anchorOffset).toBe(5);
});

test('test_buildPlanNodes_emptyGroupIsNotANode', () => {
  const rc: RC = { resources: [R('a')], groups: [{ groupId: 'g', name: 'G', memberIds: [] }] };
  expect(buildPlanNodes(rc).map((n) => n.nodeId)).toEqual(['a']);
});

test('test_topoOrder_ordersPredecessorsFirst', () => {
  const rc: RC = { resources: [R('docce'), R('mensa')], relations: [{ from: 'docce', to: 'mensa' }] };
  const order = topoOrder(buildPlanNodes(rc), rc.relations!);
  expect(order.map((n) => n.nodeId)).toEqual(['docce', 'mensa']);
});

test('test_topoOrder_throwsOnCycle', () => {
  const rc: RC = { resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] };
  expect(() => topoOrder(buildPlanNodes(rc), rc.relations!)).toThrow(/ciclo/i);
});

test('test_validateResourceConfig_flagsCycleMemberDupAndBadEdge', () => {
  expect(validateResourceConfig({ resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] })).toMatch(/ciclo/i);
  expect(validateResourceConfig({ resources: [R('a'), R('b')], groups: [{ groupId: 'g1', name: 'G1', memberIds: ['a'] }, { groupId: 'g2', name: 'G2', memberIds: ['a'] }] })).toMatch(/gruppo/i);
  expect(validateResourceConfig({ resources: [R('a')], relations: [{ from: 'a', to: 'ghost' }] })).toMatch(/nodo/i);
  expect(validateResourceConfig({ resources: [R('a'), R('b')], relations: [{ from: 'a', to: 'b' }] })).toBeNull();
});

test('test_plan_manualOverride_movesTeamAcrossResources', () => {
  // "Move across resources" is a within-pool operation: R1+R2 form ONE group node. Pinning A into
  // member R2 excludes it from that node's automatic routing, so A no longer auto-lands in member R1.
  // (Two UNGROUPED resources would be independent stages — A would visit both; see
  // test_plan_pinAtOneNode_teamStillVisitsOtherIndependentNode.)
  const p = plan(
    [m('A', 'B', '09:00'), m('C', 'D', '09:00')],
    { resources: [res('R1', 20), res('R2', 20)], groups: [{ groupId: 'pool', name: 'Pool', memberIds: ['R1', 'R2'] }], assignments: [{ resourceId: 'R2', day: '2026-09-01', team: 'A', slotTime: '11:00' }] },
    ['A', 'B', 'C', 'D']);
  const r2 = slotsOf(p, 'R2');
  const pinned = r2.find((s) => s.time === '11:00')!;
  expect(pinned.teams.map((t) => t.team)).toEqual(['A']);
  expect(pinned.teams[0]!.pinned).toBe(true);
  expect(slotsOf(p, 'R1').every((s) => !s.teams.some((t) => t.team === 'A'))).toBe(true); // no longer in R1
});

// --- Task A2: node-based computeResourcePlan (per-portion flow, join, generalized pack) ---
const planRC = (matches: ScheduledMatch[], rc: RC, teams: string[]) =>
  computeResourcePlan(matches, config, rc, new Map([['U10', teams]]));
const teamAt = (p: ReturnType<typeof planRC>, rid: string) =>
  p.turns.filter((t) => t.resourceId === rid).flatMap((t) => t.slots.flatMap((s) => s.teams));

test('test_plan_exposesNodesInTopoOrder', () => {
  const rc: RC = { resources: [R('docce'), R('mensa', { offsetMinutes: 5 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(p.nodes.map((n) => n.nodeId)).toEqual(['docce', 'mensa']);       // topo order
  expect(p.nodes[1]!.predecessorIds).toEqual(['docce']);
});

test('test_plan_ungroupedResources_areIndependentStages_teamVisitsBoth', () => {
  // No relations, no group: A visits BOTH resources (not alternatives).
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 }), R('mensa', { capacityPersons: 20 })] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(teamAt(p, 'docce').some((t) => t.team === 'A')).toBe(true);
  expect(teamAt(p, 'mensa').some((t) => t.team === 'A')).toBe(true);
});

test('test_plan_relationAnchorsSuccessorToPredecessorCompletion', () => {
  // docce occ 30, offset 0 → A ready 09:50, slot 09:50, ends 10:20. mensa offset 5 → A at 10:25.
  const rc: RC = { resources: [R('docce', { capacityPersons: 20, occupancyMinutes: 30 }), R('mensa', { capacityPersons: 20, occupancyMinutes: 30, offsetMinutes: 5 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A']);
  const mensaSlot = p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!;
  expect(mensaSlot.time).toBe('10:25');
});

test('test_plan_join_readyIsMaxOfPredecessors', () => {
  // docce ends 10:20, premiazione (occ 60) ends 10:50 → mensa ready = 10:50 (+0).
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 }), R('premi', { capacityPersons: 20, occupancyMinutes: 60 }), R('mensa', { capacityPersons: 20 })],
    relations: [{ from: 'docce', to: 'mensa' }, { from: 'premi', to: 'mensa' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A']);
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!.time).toBe('10:50');
});

test('test_plan_groupBinPacksInternally', () => {
  // group of two 10-rooms; a 14-team splits 10 + 4 inside the group.
  const rc: RC = { resources: [R('s1', { capacityPersons: 10 }), R('s2', { capacityPersons: 10 })], groups: [{ groupId: 'docce', name: 'Docce', memberIds: ['s1', 's2'] }], teamSizes: { A: 14 } as any };
  const p = planRC([m('A', 'B', '09:00')], { ...rc, teamSizes: { A: 14 } }, ['A']);
  const s1 = teamAt(p, 's1').filter((t) => t.team === 'A').reduce((n, t) => n + t.size, 0);
  const s2 = teamAt(p, 's2').filter((t) => t.team === 'A').reduce((n, t) => n + t.size, 0);
  expect(s1 + s2).toBe(14);
  expect(Math.max(s1, s2)).toBe(10);
});

test('test_plan_backwardCompat_singleResourceNoGroupsNoRelations', () => {
  const rc: RC = { resources: [R('docce', { capacityPersons: 20 })] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  expect(teamAt(p, 'docce').map((t) => t.team).sort()).toEqual(['A', 'B']);
  expect(p.unassignable).toHaveLength(0);
});

test('test_plan_pinAtOneNode_teamStillVisitsOtherIndependentNode', () => {
  // A pinned into R2 (an ungrouped node) must STILL get an automatic turn at the unrelated node R1.
  const rc: RC = { resources: [R('R1', { capacityPersons: 20 }), R('R2', { capacityPersons: 20 })],
    assignments: [{ resourceId: 'R2', day: '2026-09-01', team: 'A', slotTime: '11:00' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A', 'B']);
  // pinned at R2 exactly where asked
  const pinned = teamAt(p, 'R2').find((t) => t.team === 'A')!;
  expect(pinned.pinned).toBe(true);
  expect(p.turns.find((t) => t.resourceId === 'R2')!.slots.find((s) => s.time === '11:00')!.teams.some((t) => t.team === 'A')).toBe(true);
  // and STILL automatically served at the independent node R1 (not removed from the pipeline)
  const atR1 = teamAt(p, 'R1').find((t) => t.team === 'A');
  expect(atR1).toBeTruthy();
  expect(atR1!.pinned).toBeFalsy();
});

test('test_plan_pinAtPredecessor_flowsDownstreamToSuccessor', () => {
  // docce (occ 30) → mensa. A pinned into docce at 11:00 ⇒ completes 11:30 ⇒ mensa ready 11:30.
  const rc: RC = { resources: [R('docce', { capacityPersons: 20, occupancyMinutes: 30 }), R('mensa', { capacityPersons: 20, occupancyMinutes: 30 })],
    relations: [{ from: 'docce', to: 'mensa' }],
    assignments: [{ resourceId: 'docce', day: '2026-09-01', team: 'A', slotTime: '11:00' }] };
  const p = planRC([m('A', 'B', '09:00')], rc, ['A']);
  const doccePin = teamAt(p, 'docce').find((t) => t.team === 'A')!;
  expect(doccePin.pinned).toBe(true);
  const mensaSlot = p.turns.find((t) => t.resourceId === 'mensa')!.slots.find((s) => s.teams.some((t) => t.team === 'A'))!;
  expect(mensaSlot.time).toBe('11:30');                       // completion of the pinned turn feeds the successor
  expect(mensaSlot.teams.find((t) => t.team === 'A')!.pinned).toBeFalsy(); // auto at the successor
});

// --- Task B3: check-off overrides, free nodes, pending ---
const co = (nodeId: string, team: string, servedAt: string): Checkoff => ({ sportEventId: 'e', nodeId, day: '2026-09-01', team, servedAt });

test('test_plan_checkoffOverridesCompletion_successorReAnchors', () => {
  const rc = { resources: [R('docce', { capacityPersons: 20 }), R('mensa', { capacityPersons: 20, offsetMinutes: 0 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A']]]), [co('docce', 'A', '10:40')]);
  // planned docce end would be 10:20; the check-off says 10:40 → mensa anchors to 10:40.
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots[0]!.time).toBe('10:40');
});

test('test_plan_freeNode_producesListNotSlots', () => {
  const rc = { resources: [R('mensa', { capacityPersons: 40, mode: 'free' })] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A', 'B']]]), []);
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots).toHaveLength(0);
  const list = p.freeLists.find((f) => f.nodeId === 'mensa')!;
  expect(list.teams.map((t) => t.team).sort()).toEqual(['A', 'B']);
});

test('test_plan_freeNode_servedFlagFromCheckoff', () => {
  const rc = { resources: [R('mensa', { capacityPersons: 40, mode: 'free' })] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A', 'B']]]), [co('mensa', 'A', '11:00')]);
  const list = p.freeLists.find((f) => f.nodeId === 'mensa')!;
  expect(list.teams.find((t) => t.team === 'A')!.served).toBe(true);
  expect(list.teams.find((t) => t.team === 'B')!.served).toBeFalsy();
});

test('test_plan_pendingWhenFreePredecessorNotCheckedOff', () => {
  const rc = { resources: [R('docce', { capacityPersons: 20, mode: 'free' }), R('mensa', { capacityPersons: 20 })], relations: [{ from: 'docce', to: 'mensa' }] };
  const p = computeResourcePlan([m('A', 'B', '09:00')], config, rc as any, new Map([['U10', ['A']]]), []); // docce free, not served
  expect(p.turns.find((t) => t.resourceId === 'mensa')!.slots).toHaveLength(0); // A not seated yet
  expect(p.pending.some((x) => x.nodeId === 'mensa' && x.team === 'A')).toBe(true);
});

// --- Task B5: application layer threads checkoffs from the repository into the engine ---
test('test_getResourcePlan_passesCheckoffsToEngine', async () => {
  const { getResourcePlan } = await import('../src/application/resources.js');
  const fake = {
    resources: { get: async () => ({ resources: [{ resourceId: 'mensa', name: 'M', occupancyMinutes: 30, capacityPersons: 40, offsetMinutes: 0, mode: 'free' }] }) },
    matches: { list: async () => [m('A', 'B', '09:00')] },
    schedules: { get: async () => ({ config }) },
    teams: { confirmedByCategory: async () => new Map([['U10', ['A']]]) },
    checkoffs: { list: async () => [{ sportEventId: 'e', nodeId: 'mensa', day: '2026-09-01', team: 'A', servedAt: '11:00' }] },
  } as any;
  const plan = await getResourcePlan(fake)('e');
  expect(plan.freeLists[0]!.teams.find((t: any) => t.team === 'A')!.served).toBe(true);
});
