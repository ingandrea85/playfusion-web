import { describe, it, expect } from 'vitest';
import { categoryConfig, defaultConfig } from '../src/domain.js';

describe('festivalMatchesPerTeam resolution', () => {
  it('per-category override wins; else the top-level default', () => {
    const cfg = {
      ...defaultConfig(),
      festivalMatchesPerTeam: 4,
      byCategory: {
        U10: { fields: ['C1'], periods: 1, periodMinutes: 10, breakMinutes: 2, legs: 'SINGLE' as const, festivalMatchesPerTeam: 2 },
      },
    };
    expect(categoryConfig(cfg, 'U10').festivalMatchesPerTeam).toBe(2);
    expect(categoryConfig(cfg, 'U8').festivalMatchesPerTeam).toBe(4); // top-level default
  });
});
