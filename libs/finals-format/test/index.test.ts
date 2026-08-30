import { describe, it, expect } from 'vitest';
import { validateFormat, compileFormat, bracketFromParticipants, buildFinals, groupKnockout, finalRoundRobin, type CustomFinalsFormat, type FinalGroupInput } from '../src/index.js';

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

describe('bracketFromParticipants + 3rd place (SP-A2)', () => {
  it('no 3rd-place match by default', () => {
    const d = bracketFromParticipants(['A', 'B', 'C', 'D']);
    expect(d.some((x) => x.slot === '3P')).toBe(false);
  });
  it('adds a 3rd/4th final between the two semifinal losers when enabled', () => {
    const d = bracketFromParticipants(['A', 'B', 'C', 'D'], { thirdPlace: true });
    const tp = d.find((x) => x.slot === '3P')!;
    expect(tp).toMatchObject({ home: 'Perdente SF1', away: 'Perdente SF2', placementFrom: 3, placementTo: 4, round: 'Finale 3º/4º' });
  });
  it('skips the 3rd-place final when there is only one semifinal (byes)', () => {
    const d = bracketFromParticipants(['A', 'B', 'C'], { thirdPlace: true }); // size 4, one bye → 1 SF
    expect(d.some((x) => x.slot === '3P')).toBe(false);
  });
  it('8 players with 3rd place: quarters, semis, final + bronze', () => {
    const d = bracketFromParticipants(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], { thirdPlace: true });
    expect(d.filter((x) => x.round === 'QF')).toHaveLength(4);
    expect(d.filter((x) => x.round === 'SF')).toHaveLength(2);
    expect(d.filter((x) => x.round === 'F')).toHaveLength(1);
    expect(d.filter((x) => x.slot === '3P')).toHaveLength(1);
  });
})


describe('groupKnockout (SP-A3): crossed group qualifiers + seeding', () => {
  const gr = (labels) => labels.map((l) => ({ label: l, size: 4 }));
  it('2 groups × 2 qualifiers → classic cross (1ºA-2ºB, 1ºB-2ºA) + final', () => {
    const d = groupKnockout(gr(['Girone A', 'Girone B']), { qualifiersPerGroup: 2 });
    const sf = d.filter((x) => x.round === 'SF').map((x) => [x.home, x.away]);
    expect(sf).toEqual([['1ª Girone A', '2ª Girone B'], ['1ª Girone B', '2ª Girone A']]);
    expect(d.find((x) => x.round === 'F')).toMatchObject({ home: 'Vincente SF1', away: 'Vincente SF2', placementFrom: 1, placementTo: 2 });
  });
  it('4 groups × 1 qualifier → semifinals of group winners', () => {
    const d = groupKnockout(gr(['Girone A', 'Girone B', 'Girone C', 'Girone D']), { qualifiersPerGroup: 1 });
    expect(d.filter((x) => x.round === 'SF')).toHaveLength(2);
    // group winners are the seeds; top seed (1ºA) meets the lowest (1ºD) side of the draw
    expect(d.filter((x) => x.round === 'SF').flatMap((x) => [x.home, x.away]).sort())
      .toEqual(['1ª Girone A', '1ª Girone B', '1ª Girone C', '1ª Girone D']);
  });
  it('honours thirdPlace', () => {
    const d = groupKnockout(gr(['Girone A', 'Girone B']), { qualifiersPerGroup: 2, thirdPlace: true });
    expect(d.find((x) => x.slot === '3P')).toMatchObject({ placementFrom: 3, placementTo: 4 });
  });
  it('buildFinals dispatches GROUP_KNOCKOUT', () => {
    const d = buildFinals(gr(['Girone A', 'Girone B']), 'GROUP_KNOCKOUT', { qualifiersPerGroup: 2 });
    expect(d.some((x) => x.home === '1ª Girone A')).toBe(true);
  });
})


describe('finalRoundRobin (SP-A4): final poule of top-N', () => {
  it('N=4 → 6 round-robin FINAL_GROUP matches among Seed 1..4', () => {
    const d = finalRoundRobin(4);
    expect(d).toHaveLength(6);
    expect(d.every((x) => x.phase === 'FINAL_GROUP' && x.bracketLabel === 'Girone finale')).toBe(true);
    expect(d[0]).toMatchObject({ home: 'Seed 1', away: 'Seed 2' });
    expect(d.some((x) => x.home === 'Seed 3' && x.away === 'Seed 4')).toBe(true);
  });
  it('buildFinals dispatches FINAL_ROUND_ROBIN with finalsTeamsToBracket as poule size', () => {
    const d = buildFinals([{ label: 'Girone A', size: 6 }], 'FINAL_ROUND_ROBIN', { finalsTeamsToBracket: 3 });
    expect(d).toHaveLength(3); // 3 teams → 3 pairs
    expect(d.every((x) => x.phase === 'FINAL_GROUP')).toBe(true);
  });
})
