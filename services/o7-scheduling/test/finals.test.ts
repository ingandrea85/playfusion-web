import { test, expect } from 'vitest';
import { buildFinals, type FinalGroupInput } from '../src/finals.js';

const g = (label: string, size: number): FinalGroupInput => ({ label, size });

// --- SINGLE_GROUP_CROSSOVER (v1): one group, consecutive-rank pairs ---
test('test_single_consecutivePairs', () => {
  const d = buildFinals([g('Girone A', 4)], 'SINGLE_GROUP_CROSSOVER');
  expect(d.map((x) => [x.home, x.away, x.placementFrom, x.placementTo])).toEqual([
    ['1ª Girone A', '2ª Girone A', 1, 2],
    ['3ª Girone A', '4ª Girone A', 3, 4],
  ]);
  expect(d.every((x) => x.phase === 'FINAL')).toBe(true);
});
test('test_single_oddTeamDropped', () => {
  expect(buildFinals([g('Girone A', 3)], 'SINGLE_GROUP_CROSSOVER')).toHaveLength(1); // floor(3/2)
});
test('test_single_requiresExactlyOneGroup', () => {
  expect(buildFinals([g('A', 4), g('B', 4)], 'SINGLE_GROUP_CROSSOVER')).toEqual([]);
});

// --- PLACEMENT (v1): multi-group bracket per tier ---
test('test_placement_twoGroups_oneFinalPerTier', () => {
  // 2 groups of 2 → effectiveGroups=2, teamsPerGroup=2 → 2 tiers, 1 round (Finale) each.
  const d = buildFinals([g('Girone A', 2), g('Girone B', 2)], 'PLACEMENT');
  expect(d).toHaveLength(2);
  expect(d[0]).toMatchObject({ bracketLabel: 'Tabellone', round: 'F', home: '1ª Girone A', away: '1ª Girone B', placementFrom: 1, placementTo: 2 });
  expect(d[1]).toMatchObject({ bracketLabel: 'Piazzamento 2ª', round: 'F', home: '2ª Girone A', away: '2ª Girone B', placementFrom: 3, placementTo: 4 });
});
test('test_placement_fourGroups_semisThenFinal_withWinnerLinks', () => {
  // 4 groups of 1 → effectiveGroups=4, teamsPerGroup=1 → 1 tier, 2 rounds (SF, F).
  const d = buildFinals([g('Girone A', 1), g('Girone B', 1), g('Girone C', 1), g('Girone D', 1)], 'PLACEMENT');
  const sfs = d.filter((x) => x.round === 'SF');
  const fin = d.find((x) => x.round === 'F')!;
  expect(sfs).toHaveLength(2);
  expect(sfs[0]).toMatchObject({ home: '1ª Girone A', away: '1ª Girone B', slot: 'T1-SF1' });
  expect(fin).toMatchObject({ home: 'Vincente T1-SF1', away: 'Vincente T1-SF2', slot: 'T1-F1' });
});
test('test_placement_truncatesToPowerOfTwoGroups', () => {
  // 3 groups → effectiveGroups=2 (3rd dropped).
  const d = buildFinals([g('A', 2), g('B', 2), g('C', 2)], 'PLACEMENT');
  expect(d.every((x) => !x.home.includes('Girone C') && !x.away.includes('C'))).toBe(true);
});
test('test_placement_lessThanTwoGroups_none', () => {
  expect(buildFinals([g('A', 4)], 'PLACEMENT')).toEqual([]);
});

// --- SPLIT_GROUP_FINALS (v1): bracket top-N + FINAL_GROUP round-robin ---
test('test_split_singleGroup_bracketPlusFinalGroup', () => {
  // 1 group of 5, bracket=2 → 1 bracket match (1ª-2ª) + FINAL_GROUP round-robin of 3ª/4ª/5ª (3 matches).
  const d = buildFinals([g('Girone A', 5)], 'SPLIT_GROUP_FINALS', { finalsTeamsToBracket: 2 });
  const bracket = d.filter((x) => x.phase === 'FINAL');
  const fg = d.filter((x) => x.phase === 'FINAL_GROUP');
  expect(bracket).toHaveLength(1);
  expect(bracket[0]).toMatchObject({ home: '1ª Girone A', away: '2ª Girone A', placementFrom: 1, placementTo: 2 });
  expect(fg).toHaveLength(3); // round-robin of 3 teams
  expect(fg.every((x) => x.bracketLabel === 'Girone finale')).toBe(true);
  expect(fg.map((x) => [x.home, x.away])).toEqual([['3ª Girone A', '4ª Girone A'], ['3ª Girone A', '5ª Girone A'], ['4ª Girone A', '5ª Girone A']]);
});
test('test_split_multiGroupEven_crossSameRank', () => {
  // 2 groups of 4, bracket=4 → perGroup=2 → cross 1A-1B (1-2), 2A-2B (3-4); FINAL_GROUP of 3ª/4ª each.
  const d = buildFinals([g('Girone A', 4), g('Girone B', 4)], 'SPLIT_GROUP_FINALS', { finalsTeamsToBracket: 4 });
  const bracket = d.filter((x) => x.phase === 'FINAL');
  expect(bracket.map((x) => [x.home, x.away, x.placementFrom, x.placementTo])).toEqual([
    ['1ª Girone A', '1ª Girone B', 1, 2],
    ['2ª Girone A', '2ª Girone B', 3, 4],
  ]);
  expect(d.filter((x) => x.phase === 'FINAL_GROUP')).toHaveLength(6); // round-robin of 4 teams (3A,4A,3B,4B)
});
test('test_split_oddGroups_none', () => {
  expect(buildFinals([g('A', 4), g('B', 4), g('C', 4)], 'SPLIT_GROUP_FINALS', { finalsTeamsToBracket: 6 })).toEqual([]);
});
