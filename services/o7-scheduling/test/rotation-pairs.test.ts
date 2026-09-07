import { describe, it, expect } from 'vitest';
import { rotationPairs } from '../src/fixtures.js';

const count = (pairs: Array<[string, string]>, team: string) => pairs.filter(([a, b]) => a === team || b === team).length;
const uniquePairs = (pairs: Array<[string, string]>) => new Set(pairs.map(([a, b]) => [a, b].sort().join('-'))).size;

describe('rotationPairs (circle method)', () => {
  it('even teams: each team plays exactly n, no repeated opponent', () => {
    const teams = ['A', 'B', 'C', 'D', 'E', 'F'];
    const pairs = rotationPairs(teams, 3);
    for (const t of teams) expect(count(pairs, t)).toBe(3);
    expect(uniquePairs(pairs)).toBe(pairs.length);
  });
  it('caps n at teams-1', () => {
    const pairs = rotationPairs(['A', 'B', 'C', 'D'], 9);
    for (const t of ['A', 'B', 'C', 'D']) expect(count(pairs, t)).toBe(3);
  });
  it('odd teams: a rotating bye, each team plays at most n, no repeats', () => {
    const teams = ['A', 'B', 'C', 'D', 'E'];
    const pairs = rotationPairs(teams, 3);
    for (const t of teams) expect(count(pairs, t)).toBeLessThanOrEqual(3);
    expect(pairs.every(([a, b]) => a !== '__BYE__' && b !== '__BYE__')).toBe(true);
    expect(uniquePairs(pairs)).toBe(pairs.length);
  });
  it('fewer than 2 teams or n<1: no matches', () => {
    expect(rotationPairs(['A'], 3)).toEqual([]);
    expect(rotationPairs([], 3)).toEqual([]);
    expect(rotationPairs(['A', 'B'], 0)).toEqual([]);
  });
});
