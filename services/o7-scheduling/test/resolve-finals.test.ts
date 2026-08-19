import { test, expect } from 'vitest';
import { resolvePlaceholders } from '../src/resolve-finals.js';
import { computeStandings } from '../src/standings.js';
import { rankStanding } from '../src/ranking.js';
import type { GroupStanding, ScheduledMatch } from '../src/domain.js';

let n = 0;
const grp = (home: string, away: string, hs: number | null, as: number | null): ScheduledMatch =>
  ({ id: `sm-${++n}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: hs === null ? 'SCHEDULED' : 'FINISHED', phase: 'GROUP' });
const fin = (home: string, away: string): ScheduledMatch =>
  ({ id: `fm-${++n}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'C', home, away, status: 'SCHEDULED', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'Finale', order: 1 });

// Ranked standings for the given matches (same path the handler uses), default policy [GD, GF].
const ranked = (matches: ScheduledMatch[]): GroupStanding[] =>
  computeStandings(matches).map((g) => {
    const gm = matches.filter((m) => m.categoryId === g.categoryId && m.groupLabel === g.groupLabel);
    const r = rankStanding(g.rows, gm, ['GOAL_DIFFERENCE', 'GOALS_FOR'], []);
    return { ...g, rows: r.rows, unresolved: r.unresolved };
  });

test('test_resolve_incompleteGroup_staysPlaceholder', () => {
  const ms = [grp('A', 'B', 1, 0), grp('A', 'C', null, null), grp('B', 'C', null, null), fin('1ª Girone A', '2ª Girone A')];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.phase === 'FINAL')!;
  expect(out.homeResolved).toBeUndefined();
  expect(out.awayResolved).toBeUndefined();
});

test('test_resolve_completeGroup_resolvesToRankedTeams', () => {
  // A beats B and C, B beats C → A 6, B 3, C 0 (clear order, no tie).
  const ms = [grp('A', 'B', 1, 0), grp('A', 'C', 1, 0), grp('B', 'C', 1, 0), fin('1ª Girone A', '2ª Girone A')];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.phase === 'FINAL')!;
  expect(out.homeResolved).toBe('A');
  expect(out.awayResolved).toBe('B');
});

test('test_resolve_unresolvedTie_blocksThatPosition', () => {
  // A clearly 1st; B and C perfectly tied (both lost to A, drew each other) → positions 2/3 unresolved.
  const ms = [grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('B', 'C', 1, 1), fin('1ª Girone A', '2ª Girone A')];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.phase === 'FINAL')!;
  expect(out.homeResolved).toBe('A');          // position 1 is settled
  expect(out.awayResolved).toBeUndefined();     // position 2 is inside the unresolved {B,C} tie
});

test('test_resolve_winnerPlaceholderNeverResolvedInS12', () => {
  const ms = [grp('A', 'B', 1, 0), grp('A', 'C', 1, 0), grp('B', 'C', 1, 0),
    { ...fin('Vincente SF1', 'Vincente SF2'), round: 'Finale' }];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.phase === 'FINAL')!;
  expect(out.homeResolved).toBeUndefined();
  expect(out.awayResolved).toBeUndefined();
});

test('test_computeStandings_ignoresFinalMatches', () => {
  const ms = [grp('A', 'B', 2, 0), fin('1ª Girone A', '2ª Girone A')];
  const s = computeStandings(ms);
  expect(s).toHaveLength(1); // only the group, not the Tabellone
  expect(s[0]!.groupLabel).toBe('Girone A');
  expect(s[0]!.rows.map((r) => r.team).sort()).toEqual(['A', 'B']); // no placeholder rows
});
