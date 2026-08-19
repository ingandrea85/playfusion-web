import { test, expect } from 'vitest';
import { buildFinals } from '../src/finals.js';

test('test_buildFinals_singleGroupCrossover_Q2_isaSingleFinal', () => {
  const d = buildFinals(['Girone A'], 2, 'SINGLE_GROUP_CROSSOVER');
  expect(d).toEqual([{ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: '1ª Girone A', away: '2ª Girone A' }]);
});

test('test_buildFinals_singleGroupCrossover_Q4_semisThenFinal', () => {
  const d = buildFinals(['Girone A'], 4, 'SINGLE_GROUP_CROSSOVER');
  expect(d.filter((x) => x.round === 'Semifinali')).toEqual([
    { bracketLabel: 'Tabellone', round: 'Semifinali', order: 1, home: '1ª Girone A', away: '4ª Girone A' },
    { bracketLabel: 'Tabellone', round: 'Semifinali', order: 2, home: '2ª Girone A', away: '3ª Girone A' },
  ]);
  expect(d.find((x) => x.round === 'Finale')).toEqual({ bracketLabel: 'Tabellone', round: 'Finale', order: 1, home: 'Vincente SF1', away: 'Vincente SF2' });
});

test('test_buildFinals_splitGroupFinals_perPositionBrackets', () => {
  const d = buildFinals(['Girone A', 'Girone B'], 2, 'SPLIT_GROUP_FINALS');
  expect(d).toEqual([
    { bracketLabel: 'Tabellone Oro', round: 'Finale', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
    { bracketLabel: 'Tabellone Argento', round: 'Finale', order: 1, home: '2ª Girone A', away: '2ª Girone B' },
  ]);
});

test('test_buildFinals_placement_perPositionFinals', () => {
  const d = buildFinals(['Girone A', 'Girone B'], 2, 'PLACEMENT');
  expect(d).toEqual([
    { bracketLabel: 'Piazzamento', round: 'Finale 1º/2º', order: 1, home: '1ª Girone A', away: '1ª Girone B' },
    { bracketLabel: 'Piazzamento', round: 'Finale 3º/4º', order: 2, home: '2ª Girone A', away: '2ª Girone B' },
  ]);
});

test('test_buildFinals_emptyWhenNoGroupsOrNoQualifiers', () => {
  expect(buildFinals([], 2, 'SINGLE_GROUP_CROSSOVER')).toEqual([]);
  expect(buildFinals(['Girone A'], 0, 'SINGLE_GROUP_CROSSOVER')).toEqual([]);
});
