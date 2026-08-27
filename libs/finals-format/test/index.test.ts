import { describe, it, expect } from 'vitest';
import { validateFormat, compileFormat, type CustomFinalsFormat } from '../src/index.js';

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

describe('validateFormat (returns error list)', () => {
  it('a well-formed bracket has no errors', () => { expect(validateFormat(fmt())).toEqual([]); });
  it('flags an empty name', () => { expect(validateFormat(fmt({ name: ' ' })).join()).toMatch(/nome/i); });
  it('flags seeds < 2', () => { expect(validateFormat(fmt({ seeds: 1 })).join()).toMatch(/seed/i); });
  it('flags a seed out of range', () => {
    expect(validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { seed: 5 } }] }] })).join()).toMatch(/fuori range/);
  });
  it('flags a duplicate slot', () => {
    expect(validateFormat(fmt({ rounds: [{ name: 'R', matches: [{ slot: 'X', home: { seed: 1 }, away: { seed: 2 } }, { slot: 'X', home: { seed: 3 }, away: { seed: 4 } }] }] })).join()).toMatch(/duplicat/i);
  });
  it('flags a link to a slot not defined in an earlier round', () => {
    expect(validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { winnerOf: 'A' } }] }] })).join()).toMatch(/turno precedente/);
  });
  it('flags an inconsistent placement pair', () => {
    expect(validateFormat(fmt({ seeds: 2, rounds: [{ name: 'R', matches: [{ slot: 'A', home: { seed: 1 }, away: { seed: 2 }, placementFrom: 1, placementTo: 3 }] }] })).join()).toMatch(/piazzamento/);
  });
});

describe('compileFormat', () => {
  it('turns refs into placeholder tokens and passes placement through', () => {
    const draws = compileFormat(fmt());
    expect(draws.find((d) => d.slot === 'F')).toMatchObject({ round: 'Finale', home: 'Vincente SF1', away: 'Vincente SF2', phase: 'FINAL', placementFrom: 1, placementTo: 2 });
    expect(draws.find((d) => d.slot === 'SF1')).toMatchObject({ home: 'Seed 1', away: 'Seed 4' });
    expect(draws.find((d) => d.slot === '3P')).toMatchObject({ home: 'Perdente SF1', away: 'Perdente SF2', placementFrom: 3, placementTo: 4 });
  });
  it('omits placement keys when absent and orders sequentially', () => {
    const draws = compileFormat(fmt());
    expect('placementFrom' in draws.find((d) => d.slot === 'SF1')!).toBe(false);
    expect(draws.map((d) => d.order)).toEqual([1, 2, 3, 4]);
  });
});
