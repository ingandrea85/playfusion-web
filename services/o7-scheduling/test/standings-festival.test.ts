import { describe, it, expect } from 'vitest';
import { computeStandings } from '../src/standings.js';
import type { ScheduledMatch } from '../src/domain.js';

const fest = (over: Partial<ScheduledMatch> = {}): ScheduledMatch =>
  ({ id: 'x', sportEventId: 'e', categoryId: 'U10', groupLabel: '', day: '2026-06-01', time: '09:00', field: 'C1', home: 'A', away: 'B', phase: 'FESTIVAL', status: 'FINISHED', homeScore: 3, awayScore: 1, ...over });

describe('computeStandings — festival', () => {
  it('festival matches never produce standings, even finished with scores', () => {
    expect(computeStandings([fest()])).toEqual([]);
  });
});
