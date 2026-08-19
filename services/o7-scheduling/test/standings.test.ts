import { test, expect } from 'vitest';
import { computeStandings } from '../src/standings.js';
import type { ScheduledMatch } from '../src/domain.js';

let n = 0;
const mk = (categoryId: string, groupLabel: string, home: string, away: string, hs?: number | null, as?: number | null): ScheduledMatch =>
  ({ id: `sm-${++n}`, sportEventId: 'evt-1', categoryId, groupLabel, day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs ?? null, awayScore: as ?? null });

test('test_computeStandings_pointsAndOrder', () => {
  // Group A/U10: A beats B 2-0, A beats C 1-0, B draws C 1-1 → A 6, B 1, C 1; B ahead of C by GD.
  const s = computeStandings([
    mk('U10', 'Girone A', 'A', 'B', 2, 0),
    mk('U10', 'Girone A', 'A', 'C', 1, 0),
    mk('U10', 'Girone A', 'B', 'C', 1, 1),
  ]);
  expect(s).toHaveLength(1);
  const rows = s[0]!.rows;
  // A 6pts; then B & C both 1pt, ordered by goal-difference: C (-1) above B (-2).
  expect(rows.map((r) => r.team)).toEqual(['A', 'C', 'B']);
  expect(rows[0]).toMatchObject({ team: 'A', played: 2, won: 2, points: 6, goalsFor: 3, goalsAgainst: 0, goalDiff: 3 });
  expect(rows[1]).toMatchObject({ team: 'C', points: 1, drawn: 1, lost: 1, goalDiff: -1 });
  expect(rows[2]).toMatchObject({ team: 'B', points: 1, goalDiff: -2 });
});

test('test_computeStandings_excludesNotPlayedButKeepsTheTeamRow', () => {
  const s = computeStandings([mk('U10', 'Girone A', 'A', 'B')]); // not played
  expect(s[0]!.rows.map((r) => r.team).sort()).toEqual(['A', 'B']);
  expect(s[0]!.rows.every((r) => r.played === 0 && r.points === 0)).toBe(true);
});

test('test_computeStandings_perGroupAndCategory', () => {
  const s = computeStandings([
    mk('U10', 'Girone A', 'A', 'B', 1, 0),
    mk('U10', 'Girone B', 'C', 'D', 0, 0),
    mk('U12', 'Girone A', 'E', 'F', 3, 1),
  ]);
  expect(s).toHaveLength(3);
  const g = (cat: string, grp: string) => s.find((x) => x.categoryId === cat && x.groupLabel === grp)!;
  expect(g('U10', 'Girone A').rows[0]).toMatchObject({ team: 'A', points: 3 });
  expect(g('U10', 'Girone B').rows.every((r) => r.points === 1)).toBe(true); // 0-0 draw
  expect(g('U12', 'Girone A').rows[0]).toMatchObject({ team: 'E', points: 3, goalDiff: 2 });
});

test('test_computeStandings_drawGivesOnePointEach', () => {
  const s = computeStandings([mk('U10', 'Girone A', 'A', 'B', 2, 2)]);
  expect(s[0]!.rows.every((r) => r.points === 1 && r.drawn === 1)).toBe(true);
});

test('test_computeStandings_legacyPlayedCountsWithoutStatus', () => {
  // Pre-S26 fixtures have scores but no status → still counted (legacy fallback).
  const m = mk('U10', 'Girone A', 'A', 'B', 1, 0);
  expect(m.status).toBeUndefined();
  const rows = computeStandings([m])[0]!.rows;
  expect(rows.find((r) => r.team === 'A')).toMatchObject({ points: 3, played: 1 });
});

test('test_computeStandings_liveAndCancelledExcludedButRowsKept', () => {
  const live = { ...mk('U10', 'Girone A', 'A', 'B', 3, 0), status: 'LIVE' as const };
  const cancelled = { ...mk('U10', 'Girone A', 'A', 'C', 5, 0), status: 'CANCELLED' as const };
  const rows = computeStandings([live, cancelled])[0]!.rows;
  expect(rows.map((r) => r.team).sort()).toEqual(['A', 'B', 'C']); // teams still listed
  expect(rows.every((r) => r.played === 0 && r.points === 0)).toBe(true); // neither counts
});

test('test_computeStandings_finishedCounts', () => {
  const finished = { ...mk('U10', 'Girone A', 'A', 'B', 2, 1), status: 'FINISHED' as const };
  expect(computeStandings([finished])[0]!.rows.find((r) => r.team === 'A')).toMatchObject({ points: 3 });
});
