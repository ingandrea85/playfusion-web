import { describe, it, expect, vi } from 'vitest';
import { generateSchedule } from '../src/application/generate-schedule.js';
import { defaultConfig, type ScheduledMatch } from '../src/domain.js';
import type { EventView } from '../src/ports.js';

const event = (over: Partial<EventView> = {}): EventView =>
  ({ sportEventId: 'e1', dates: { from: '2026-06-01', to: '2026-06-01' }, categorie: ['U10'], format: 'festival', ...over });

function deps(ev: EventView, teams: Map<string, string[]>) {
  const replace = vi.fn(async (_id: string, _ms: ScheduledMatch[]) => {});
  return {
    replace,
    d: {
      schedules: { get: async () => undefined, save: async () => {} },
      matches: { list: async () => [], replace },
      events: { get: async () => ev },
      teams: { confirmedByCategory: async () => teams },
      formats: { listByOrg: async () => [], get: async () => undefined, save: async () => {}, delete: async () => {} },
    },
  };
}

describe('generateSchedule — festival branch', () => {
  it('generates FESTIVAL matches (N per team) and no finals', async () => {
    const { replace, d } = deps(event(), new Map([['U10', ['A', 'B', 'C', 'D']]]));
    const out = await generateSchedule(d as any)({ sportEventId: 'e1', organizationId: 'org-1', config: defaultConfig() });
    expect(out.status).toBe('GENERATED');
    const ms: ScheduledMatch[] = replace.mock.calls[0]![1];
    expect(ms.length).toBeGreaterThan(0);
    expect(ms.every((m) => m.phase === 'FESTIVAL')).toBe(true);
    expect(ms.filter((m) => m.phase === 'FINAL').length).toBe(0);
    for (const t of ['A', 'B', 'C', 'D']) expect(ms.filter((m) => m.home === t || m.away === t).length).toBe(3);
  });

  it('respects a per-category festivalMatchesPerTeam override', async () => {
    const { replace, d } = deps(event(), new Map([['U10', ['A', 'B', 'C', 'D', 'E', 'F']]]));
    const config = { ...defaultConfig(), byCategory: { U10: { fields: ['C1'], periods: 1, periodMinutes: 10, breakMinutes: 2, legs: 'SINGLE' as const, festivalMatchesPerTeam: 2 } } };
    await generateSchedule(d as any)({ sportEventId: 'e1', organizationId: 'org-1', config });
    const ms: ScheduledMatch[] = replace.mock.calls[0]![1];
    for (const t of ['A', 'B', 'C', 'D', 'E', 'F']) expect(ms.filter((m) => m.home === t || m.away === t).length).toBe(2);
  });
});
