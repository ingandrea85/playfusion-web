import { describe, it, expect } from 'vitest';
import { seedRanking } from '../src/finals-format.js';
import type { GroupStanding, StandingRow } from '../src/domain.js';

// validateFormat/compileFormat live in @playfusion/finals-format (tested there). seedRanking stays
// in o7 (it needs the standings types) and is tested here.
describe('seedRanking', () => {
  const row = (team: string, points: number, gd = 0, gf = 0): StandingRow =>
    ({ team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: gf, goalsAgainst: 0, goalDiff: gd, points });
  const grp = (categoryId: string, groupLabel: string, rows: StandingRow[]): GroupStanding =>
    ({ categoryId, groupLabel, rows, unresolved: [] });

  it('ranks all winners first (by performance), then all runners-up', () => {
    const groups = [
      grp('U10', 'Girone A', [row('Alfa', 6, 4), row('Beta', 1, -1)]),
      grp('U10', 'Girone B', [row('Gamma', 4, 3), row('Delta', 4, 1)]),
    ];
    expect(seedRanking(groups)).toEqual(['Alfa', 'Gamma', 'Delta', 'Beta']);
  });
  it('is empty for no groups', () => { expect(seedRanking([])).toEqual([]); });
});
