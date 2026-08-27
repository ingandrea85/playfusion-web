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

test('test_resolve_winnerPropagates_fromFinishedSemifinal', () => {
  // A single group of 4 (A>B>C>D by points) seeds two semis; finishing them advances the winners.
  const ms: ScheduledMatch[] = [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 2, awayScore: 0, status: 'FINISHED' },
    { ...fin('2ª Girone A', '3ª Girone A'), slot: 'SF2', round: 'SF', homeScore: 1, awayScore: 0, status: 'FINISHED' },
    { ...fin('Vincente SF1', 'Vincente SF2'), slot: 'F1', round: 'F' },
  ];
  const final = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'F1')!;
  expect(final.homeResolved).toBe('A'); // 1ª beat 4ª in SF1
  expect(final.awayResolved).toBe('B'); // 2ª beat 3ª in SF2
});

test('test_resolve_winnerNotPropagated_whenSemifinalUnfinishedOrDrawn', () => {
  const base: ScheduledMatch[] = [grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0)];
  const drawnSemi = { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 1, awayScore: 1, status: 'FINISHED' as const };
  const ms = [...base, drawnSemi, { ...fin('Vincente SF1', '2ª Girone A'), slot: 'F1', round: 'F' }];
  const final = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'F1')!;
  expect(final.homeResolved).toBeUndefined(); // drawn semi → winner not propagated (no shootout this slice)
  expect(final.awayResolved).toBe('B'); // the qualifier side still resolves
});

test('test_resolve_loserPropagates_fromFinishedSemifinal', () => {
  // The 3rd/4th final's "Perdente SFx" links resolve to the losing side of each finished semifinal.
  const ms: ScheduledMatch[] = [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 2, awayScore: 0, status: 'FINISHED' },
    { ...fin('2ª Girone A', '3ª Girone A'), slot: 'SF2', round: 'SF', homeScore: 1, awayScore: 0, status: 'FINISHED' },
    { ...fin('Perdente SF1', 'Perdente SF2'), slot: 'B1', round: 'Finale 3º/4º' },
  ];
  const third = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'B1')!;
  expect(third.homeResolved).toBe('D'); // 4ª lost SF1
  expect(third.awayResolved).toBe('C'); // 3ª lost SF2
});

test('test_resolve_loser_usesDecreedWinner_onDraw', () => {
  // A drawn semi decreed HOME → the loser link resolves to the AWAY side.
  const ms: ScheduledMatch[] = [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 1, awayScore: 1, status: 'FINISHED', decidedWinner: 'HOME' },
    { ...fin('Perdente SF1', 'x'), slot: 'B1', round: 'Finale 3º/4º' },
  ];
  const third = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'B1')!;
  expect(third.homeResolved).toBe('D'); // drawn, decreed HOME (1ª=A) ⇒ loser = AWAY (4ª=D)
});

test('test_resolve_loser_blockedWhenUndecided', () => {
  const ms: ScheduledMatch[] = [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 1, awayScore: 1, status: 'FINISHED' },
    { ...fin('Perdente SF1', 'x'), slot: 'B1', round: 'Finale 3º/4º' },
  ];
  const third = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'B1')!;
  expect(third.homeResolved).toBeUndefined(); // drawn + undecided ⇒ no loser yet
});

test('test_computeStandings_ignoresFinalMatches', () => {
  const ms = [grp('A', 'B', 2, 0), fin('1ª Girone A', '2ª Girone A')];
  const s = computeStandings(ms);
  expect(s).toHaveLength(1); // only the group, not the Tabellone
  expect(s[0]!.groupLabel).toBe('Girone A');
  expect(s[0]!.rows.map((r) => r.team).sort()).toEqual(['A', 'B']); // no placeholder rows
});

test('test_resolve_drawnSemifinal_advancesDecreedWinner', async () => {
  // SF1 drawn but decreed HOME → the final's "Vincente SF1" resolves to SF1's home side.
  const ms: ScheduledMatch[] = [
    grp('A', 'B', 3, 0), grp('A', 'C', 3, 0), grp('A', 'D', 3, 0), grp('B', 'C', 3, 0), grp('B', 'D', 3, 0), grp('C', 'D', 3, 0),
    { ...fin('1ª Girone A', '4ª Girone A'), slot: 'SF1', round: 'SF', homeScore: 1, awayScore: 1, status: 'FINISHED', decidedWinner: 'HOME' },
    { ...fin('2ª Girone A', '3ª Girone A'), slot: 'SF2', round: 'SF', homeScore: 2, awayScore: 0, status: 'FINISHED' },
    { ...fin('Vincente SF1', 'Vincente SF2'), slot: 'F1', round: 'F' },
  ];
  const final = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'F1')!;
  expect(final.homeResolved).toBe('A'); // SF1 drawn, decreed HOME = 1ª (A)
  expect(final.awayResolved).toBe('B'); // SF2 won by 2ª (B)
})

test('test_resolve_seedPlaceholder_resolvesCrossGroupWhenAllGroupsComplete', () => {
  const gm = (grpLabel: string, home: string, away: string, hs: number, as: number, id: number): ScheduledMatch =>
    ({ id: `g${id}`, sportEventId: 'e', categoryId: 'U10', groupLabel: grpLabel, day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: 'FINISHED', phase: 'GROUP' });
  const finSlot = (slot: string, home: string, away: string): ScheduledMatch =>
    ({ id: `f${slot}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'C', home, away, status: 'SCHEDULED', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'SF', order: 1, slot });
  // Girone A: Alfa 3 > Beta 0; Girone B: Gamma 3 > Delta 0 → seeds [Alfa, Gamma, Beta, Delta].
  const ms = [gm('Girone A', 'Alfa', 'Beta', 3, 0, 1), gm('Girone B', 'Gamma', 'Delta', 3, 0, 2), finSlot('SF1', 'Seed 1', 'Seed 4')];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'SF1')!;
  expect(out.homeResolved).toBe('Alfa'); // Seed 1 = best winner
  expect(out.awayResolved).toBe('Delta'); // Seed 4 = worst runner-up
});

test('test_resolve_seedPlaceholder_staysWhileAGroupIncomplete', () => {
  const gm = (grpLabel: string, home: string, away: string, hs: number | null, as: number | null, id: number): ScheduledMatch =>
    ({ id: `g${id}`, sportEventId: 'e', categoryId: 'U10', groupLabel: grpLabel, day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status: hs === null ? 'SCHEDULED' : 'FINISHED', phase: 'GROUP' });
  const finSlot = (slot: string, home: string, away: string): ScheduledMatch =>
    ({ id: `f${slot}`, sportEventId: 'e', categoryId: 'U10', groupLabel: 'Tabellone', day: '2026-09-02', time: '10:00', field: 'C', home, away, status: 'SCHEDULED', phase: 'FINAL', bracketLabel: 'Tabellone', round: 'SF', order: 1, slot });
  const ms = [gm('Girone A', 'Alfa', 'Beta', 3, 0, 1), gm('Girone B', 'Gamma', 'Delta', null, null, 2), finSlot('SF1', 'Seed 1', 'Seed 4')];
  const out = resolvePlaceholders(ms, ranked(ms)).find((m) => m.slot === 'SF1')!;
  expect(out.homeResolved).toBeUndefined();
});
