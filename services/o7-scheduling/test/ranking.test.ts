import { test, expect } from 'vitest';
import { rankStanding, defaultTieBreak } from '../src/ranking.js';
import type { ScheduledMatch, StandingRow, TieBreakCriterion } from '../src/domain.js';

let n = 0;
const mk = (home: string, away: string, hs: number, as: number, status: ScheduledMatch['status'] = 'FINISHED'): ScheduledMatch =>
  ({ id: `sm-${++n}`, sportEventId: 'evt-1', categoryId: 'U10', groupLabel: 'Girone A', day: '2026-09-01', time: '09:00', field: 'C', home, away, homeScore: hs, awayScore: as, status });

// Build a StandingRow from primitives; only the fields the ranking reads matter here.
const row = (team: string, points: number, gf: number, ga: number): StandingRow =>
  ({ team, played: 0, won: 0, drawn: 0, lost: 0, goalsFor: gf, goalsAgainst: ga, goalDiff: gf - ga, points });

test('test_rank_pointsPrimary_noTie', () => {
  const rows = [row('A', 6, 3, 0), row('B', 1, 1, 3), row('C', 1, 1, 2)];
  const { rows: out, unresolved } = rankStanding(rows, [], ['GOAL_DIFFERENCE']);
  expect(out.map((r) => r.team)).toEqual(['A', 'C', 'B']); // A top; C (-1) over B (-2) on GD
  expect(unresolved).toEqual([]);
});

test('test_rank_headToHead_twoTeams', () => {
  // A and B identical on points/GD/GF overall; only the direct match (A beat B) separates them.
  const rows = [row('A', 4, 3, 3), row('B', 4, 3, 3)];
  const matches = [mk('A', 'B', 2, 1)];
  const { rows: out, unresolved } = rankStanding(rows, matches, ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(out.map((r) => r.team)).toEqual(['A', 'B']);
  expect(unresolved).toEqual([]);
});

test('test_rank_avulsa_threeTeams', () => {
  // Three teams level on points; the mini-league (avulsa) among them decides the order.
  const rows = [row('A', 4, 5, 5), row('B', 4, 5, 5), row('C', 4, 5, 5)];
  const matches = [mk('A', 'B', 2, 0), mk('B', 'C', 2, 0), mk('C', 'A', 1, 0)];
  // avulsa points: A 3 (beat B), B 3 (beat C), C 3 (beat A) → all 3; then avulsa GD: A 2-1=+1, B 2-2=0, C 1-2=-1.
  const { rows: out } = rankStanding(rows, matches, ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(out.map((r) => r.team)).toEqual(['A', 'B', 'C']);
});

test('test_rank_goalDifferenceThenGoalsFor', () => {
  const rows = [row('A', 3, 5, 3), row('B', 3, 4, 3), row('C', 3, 4, 4)];
  // No H2H matches → fall to GD: A +2, B +1, C 0.
  const { rows: out, unresolved } = rankStanding(rows, [], ['GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(out.map((r) => r.team)).toEqual(['A', 'B', 'C']);
  expect(unresolved).toEqual([]);
});

test('test_rank_goalsFor_breaksAfterEqualGoalDiff', () => {
  const rows = [row('A', 3, 5, 3), row('B', 3, 4, 2)]; // both GD +2; A more goals for
  const { rows: out, unresolved } = rankStanding(rows, [], ['GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(out.map((r) => r.team)).toEqual(['A', 'B']);
  expect(unresolved).toEqual([]);
});

test('test_rank_residualTie_isUnresolved_nameSorted', () => {
  // Identical on everything, direct match drawn → nothing separates them.
  const rows = [row('Bravo', 4, 3, 3), row('Alfa', 4, 3, 3)];
  const matches = [mk('Alfa', 'Bravo', 1, 1)];
  const { rows: out, unresolved } = rankStanding(rows, matches, ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(out.map((r) => r.team)).toEqual(['Alfa', 'Bravo']); // name-sorted, arbitrary order
  expect(unresolved).toEqual([['Alfa', 'Bravo']]);
});

test('test_rank_override_resolvesTie_andClearsUnresolved', () => {
  const rows = [row('Bravo', 4, 3, 3), row('Alfa', 4, 3, 3)];
  const matches = [mk('Alfa', 'Bravo', 1, 1)];
  const { rows: out, unresolved } = rankStanding(rows, matches, ['HEAD_TO_HEAD'], [['Bravo', 'Alfa']]);
  expect(out.map((r) => r.team)).toEqual(['Bravo', 'Alfa']); // override order honoured
  expect(unresolved).toEqual([]);
});

test('test_rank_override_ignoredWhenSetDiffers_selfInvalidation', () => {
  // Override names a set (Alfa, Charlie) that is not the tied set (Alfa, Bravo) → ignored.
  const rows = [row('Bravo', 4, 3, 3), row('Alfa', 4, 3, 3)];
  const matches = [mk('Alfa', 'Bravo', 1, 1)];
  const { unresolved } = rankStanding(rows, matches, ['HEAD_TO_HEAD'], [['Alfa', 'Charlie']]);
  expect(unresolved).toEqual([['Alfa', 'Bravo']]); // still unresolved
});

test('test_rank_headToHead_ignoresLiveAndCancelled', () => {
  // The direct match that would separate A/B is only LIVE (not counted) → residual tie stands.
  const rows = [row('A', 4, 3, 3), row('B', 4, 3, 3)];
  const matches = [mk('A', 'B', 2, 0, 'LIVE')];
  const { unresolved } = rankStanding(rows, matches, ['HEAD_TO_HEAD']);
  expect(unresolved).toEqual([['A', 'B']]);
});

test('test_defaultTieBreak_perSportAndGeneric', () => {
  expect(defaultTieBreak('Calcio')).toEqual<TieBreakCriterion[]>(['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(defaultTieBreak('Pallavolo')).toEqual<TieBreakCriterion[]>(['GOAL_DIFFERENCE', 'GOALS_FOR']);
  expect(defaultTieBreak(undefined)).toEqual<TieBreakCriterion[]>(['GOAL_DIFFERENCE', 'GOALS_FOR']);
});
