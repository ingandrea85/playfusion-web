import { test, expect } from 'vitest';
import { autoDraw, groupLabel } from '../src/gironi.js';

test('test_autoDraw_roundRobinSplitAcrossGroups', () => {
  const groups = autoDraw(['A', 'B', 'C', 'D', 'E'], 2);
  expect(groups.map((g) => g.label)).toEqual(['Girone A', 'Girone B']);
  expect(groups[0]!.teams).toEqual(['A', 'C', 'E']); // i % 2 == 0
  expect(groups[1]!.teams).toEqual(['B', 'D']);
});

test('test_autoDraw_producesExactlyGroupsCountGroupsEvenWhenSparse', () => {
  const groups = autoDraw(['A'], 3);
  expect(groups).toHaveLength(3);
  expect(groups[0]!.teams).toEqual(['A']);
  expect(groups[1]!.teams).toEqual([]);
  expect(groups[2]!.teams).toEqual([]);
});

test('test_autoDraw_clampsToAtLeastOneGroup', () => {
  expect(autoDraw(['A', 'B'], 0)).toHaveLength(1);
  expect(autoDraw(['A', 'B'], 1)[0]!.teams).toEqual(['A', 'B']);
});

test('test_groupLabel_isAlphabetical', () => {
  expect([groupLabel(0), groupLabel(1), groupLabel(2)]).toEqual(['Girone A', 'Girone B', 'Girone C']);
});
