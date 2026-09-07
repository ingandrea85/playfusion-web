import { describe, it, expect } from 'vitest';
import { buildFestivalFixtures, type FestivalCategory } from '../src/fixtures.js';

const cat = (over: Partial<FestivalCategory> = {}): FestivalCategory =>
  ({ id: 'U10', teams: ['A', 'B', 'C', 'D'], matchesPerTeam: 3, fields: ['C1', 'C2'], periods: 1, periodMinutes: 10, breakMinutes: 2, ...over });

describe('buildFestivalFixtures', () => {
  it('generates FESTIVAL matches, N per team, empty groupLabel, no finals fields', () => {
    const ms = buildFestivalFixtures('e1', '2026-06-01', '2026-06-01', '09:00', [cat()]);
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.phase === 'FESTIVAL')).toBe(true);
    expect(ms.every((m) => m.groupLabel === '')).toBe(true);
    expect(ms.every((m) => m.bracketLabel === undefined && m.round === undefined)).toBe(true);
    for (const t of ['A', 'B', 'C', 'D']) expect(ms.filter((m) => m.home === t || m.away === t).length).toBe(3);
  });
  it('no team is on two fields at the same day+time', () => {
    const ms = buildFestivalFixtures('e1', '2026-06-01', '2026-06-02', '09:00', [cat()]);
    const seen = new Set<string>();
    for (const m of ms) for (const team of [m.home, m.away]) {
      const k = `${team}@${m.day} ${m.time}`;
      expect(seen.has(k)).toBe(false); seen.add(k);
    }
  });
});
