import { describe, it, expect } from 'vitest';
import { validateFormat, compileFormat, seedRanking, type CustomFinalsFormat } from '../src/finals-format.js';
import type { GroupStanding, StandingRow } from '../src/domain.js';

// A valid "4 seeds → semis + final + 3rd place" format.
const fmt = (over: Partial<CustomFinalsFormat> = {}): CustomFinalsFormat => ({
  id: 'f1', name: 'Semi + finale + 3º', seeds: 4, createdAt: 't',
  rounds: [
    { name: 'Semifinali', matches: [
      { slot: 'SF1', home: { seed: 1 }, away: { seed: 4 } },
      { slot: 'SF2', home: { seed: 2 }, away: { seed: 3 } },
    ] },
    { name: 'Finale', matches: [{ slot: 'F', home: { winnerOf: 'SF1' }, away: { winnerOf: 'SF2' }, placementFrom: 1, placementTo: 2 }] },
    { name: 'Finale 3º/4º', matches: [{ slot: '3P', home: { loserOf: 'SF1' }, away: { loserOf: 'SF2' }, placementFrom: 3, placementTo: 4 }] },
  ],
  ...over,
});

describe('validateFormat', () => {
  it('accepts a well-formed bracket', () => { expect(() => validateFormat(fmt())).not.toThrow(); });
  it('rejects an empty name', () => { expect(() => validateFormat(fmt({ name: ' ' }))).toThrowError(/name is required/); });
  it('rejects seeds < 2', () => { expect(() => validateFormat(fmt({ seeds: 1 }))).toThrowError(/seeds must be/); });
  it('rejects a seed out of range', () => {
    expect(() => validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { seed: 5 } }] }] }))).toThrowError(/seed 5 out of range/);
  });
  it('rejects a duplicate slot', () => {
    expect(() => validateFormat(fmt({ rounds: [{ name: 'R', matches: [{ slot: 'X', home: { seed: 1 }, away: { seed: 2 } }, { slot: 'X', home: { seed: 3 }, away: { seed: 4 } }] }] }))).toThrowError(/duplicate slot X/);
  });
  it('rejects a link to a slot not defined in an earlier round', () => {
    expect(() => validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { winnerOf: 'A' } }] }] }))).toThrowError(/not a slot from an earlier round/);
  });
  it('rejects an inconsistent placement pair', () => {
    expect(() => validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { seed: 2 }, placementFrom: 1, placementTo: 3 }] }] }))).toThrowError(/placement must be/);
  });
});

describe('compileFormat', () => {
  it('turns refs into placeholder tokens and passes placement through', () => {
    const draws = compileFormat(fmt());
    const f = draws.find((d) => d.slot === 'F')!;
    expect(f).toMatchObject({ round: 'Finale', home: 'Vincente SF1', away: 'Vincente SF2', phase: 'FINAL', placementFrom: 1, placementTo: 2 });
    const sf1 = draws.find((d) => d.slot === 'SF1')!;
    expect(sf1).toMatchObject({ home: 'Seed 1', away: 'Seed 4' });
    const tp = draws.find((d) => d.slot === '3P')!;
    expect(tp).toMatchObject({ home: 'Perdente SF1', away: 'Perdente SF2', placementFrom: 3, placementTo: 4 });
  });
  it('omits placement keys when absent (no undefined values)', () => {
    const sf1 = compileFormat(fmt()).find((d) => d.slot === 'SF1')!;
    expect('placementFrom' in sf1).toBe(false);
    expect('placementTo' in sf1).toBe(false);
  });
  it('assigns sequential order across rounds', () => {
    expect(compileFormat(fmt()).map((d) => d.order)).toEqual([1, 2, 3, 4]);
  });
});

describe('seedRanking', () => {
  const row = (team: string, points: number, gd = 0, gf = 0): StandingRow =>
    ({ team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: gf, goalsAgainst: 0, goalDiff: gd, points });
  const grp = (categoryId: string, groupLabel: string, rows: StandingRow[]): GroupStanding =>
    ({ categoryId, groupLabel, rows, unresolved: [] });

  it('ranks all winners first (by performance), then all runners-up', () => {
    // Girone A: Alfa(6) > Beta(1); Girone B: Gamma(4,gd+3) > Delta(4,gd+1)
    const groups = [
      grp('U10', 'Girone A', [row('Alfa', 6, 4), row('Beta', 1, -1)]),
      grp('U10', 'Girone B', [row('Gamma', 4, 3), row('Delta', 4, 1)]),
    ];
    // winners ranked: Alfa(6) then Gamma(4); runners-up: Delta(4,gd1)? vs Beta(1) → Delta first
    expect(seedRanking(groups)).toEqual(['Alfa', 'Gamma', 'Delta', 'Beta']);
  });
  it('is empty for no groups', () => { expect(seedRanking([])).toEqual([]); });
});
