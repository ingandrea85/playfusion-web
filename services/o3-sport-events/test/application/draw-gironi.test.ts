import { beforeEach, test, expect } from 'vitest';
import { drawGironi } from '../../src/application/draw-gironi.js';
import { saveGironi, getGironi } from '../../src/application/save-gironi.js';
import { InMemoryGironiRepository, FakeTeamSource } from '../fakes.js';

let gironi: InMemoryGironiRepository;
let teams: FakeTeamSource;

beforeEach(() => {
  gironi = new InMemoryGironiRepository();
  teams = new FakeTeamSource({ 'evt-1': { U10: ['A', 'B', 'C', 'D'] } });
});

test('test_drawGironi_seedsGroupsFromConfirmedTeamsAndPersists', async () => {
  const cg = await drawGironi({ gironi, teams })({ sportEventId: 'evt-1', categoria: 'U10', groupsCount: 2 });
  expect(cg.locked).toBe(false);
  expect(cg.groups.map((g) => g.teams)).toEqual([['A', 'C'], ['B', 'D']]);
  expect((await getGironi(gironi)('evt-1')).U10).toEqual(cg);
});

test('test_drawGironi_redrawReplacesComposition', async () => {
  await drawGironi({ gironi, teams })({ sportEventId: 'evt-1', categoria: 'U10', groupsCount: 2 });
  const cg = await drawGironi({ gironi, teams })({ sportEventId: 'evt-1', categoria: 'U10', groupsCount: 4 });
  expect(cg.groups).toHaveLength(4);
});

test('test_drawGironi_isNoOpWhenLocked', async () => {
  await saveGironi(gironi)({ sportEventId: 'evt-1', categoria: 'U10', groups: [{ label: 'Girone A', teams: ['A', 'B', 'C', 'D'] }], locked: true });
  const cg = await drawGironi({ gironi, teams })({ sportEventId: 'evt-1', categoria: 'U10', groupsCount: 2 });
  expect(cg.locked).toBe(true);
  expect(cg.groups).toHaveLength(1); // unchanged — draw refused
});

test('test_saveGironi_persistsMovedTeamsAndLock', async () => {
  const groups = [{ label: 'Girone A', teams: ['A', 'D'] }, { label: 'Girone B', teams: ['B', 'C'] }];
  const cg = await saveGironi(gironi)({ sportEventId: 'evt-1', categoria: 'U10', groups, locked: true });
  expect(cg).toEqual({ groups, locked: true });
  expect((await getGironi(gironi)('evt-1')).U10!.groups[0]!.teams).toEqual(['A', 'D']);
});
