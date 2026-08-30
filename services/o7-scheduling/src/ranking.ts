import { countsForStandings, isPlayed, type ScheduledMatch, type StandingRow, type TieBreakCriterion } from './domain.js';

/** S11 tie-break ranking (ported from the mockup `shared/mock/ranking.ts`). Pure. Turns the raw
 *  standing rows of ONE group into a total, deterministic order by applying the configured policy,
 *  and reports the sets that remain perfectly tied (so the UI can flag them / the organizer can
 *  resolve them manually).
 *
 *  Points is always the implicit primary criterion. Each set of teams tied on points is resolved
 *  by applying the `policy` criteria in order, recursing on still-tied sub-sets with the next
 *  criterion. When the policy is exhausted and a set is still tied: a manual `override` covering
 *  exactly that set orders it (and it is NOT unresolved); otherwise the set is name-sorted and
 *  added to `unresolved`. `rows` is always a stable total order so the UI always renders. */

export interface RankResult {
  rows: StandingRow[];
  unresolved: string[][];
}

const cmpDesc = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i]! - a[i]!;
  return 0;
};
const eqTuple = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

// Bucket a group into ranked buckets by a per-row tuple (desc, lexicographic). Teams with an
// identical tuple land in the same bucket (still tied on this criterion).
function bucketByTuple(group: StandingRow[], tuple: (r: StandingRow) => number[]): StandingRow[][] {
  const arr = group.map((r) => ({ r, t: tuple(r) })).sort((x, y) => cmpDesc(x.t, y.t));
  const buckets: StandingRow[][] = [];
  let curT: number[] | null = null;
  for (const { r, t } of arr) {
    if (curT && eqTuple(curT, t)) buckets[buckets.length - 1]!.push(r);
    else { buckets.push([r]); curT = t; }
  }
  return buckets;
}

// Mini-league (classifica avulsa) over only the matches whose home AND away are both in the set,
// counting the same fixtures the main table counts (FINISHED / legacy played — never LIVE/CANCELLED).
function headToHeadTuple(group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  const names = new Set(group.map((r) => r.team));
  const mini = new Map<string, { pts: number; gf: number; ga: number }>();
  for (const r of group) mini.set(r.team, { pts: 0, gf: 0, ga: 0 });
  for (const m of matches) {
    if (!countsForStandings(m) || !isPlayed(m)) continue;
    if (!names.has(m.home) || !names.has(m.away)) continue;
    const h = mini.get(m.home)!, a = mini.get(m.away)!;
    const hs = m.homeScore as number, as = m.awayScore as number;
    h.gf += hs; h.ga += as; a.gf += as; a.ga += hs;
    if (hs > as) h.pts += 3;
    else if (hs < as) a.pts += 3;
    else { h.pts++; a.pts++; }
  }
  return (r) => { const s = mini.get(r.team)!; return [s.pts, s.gf - s.ga, s.gf]; };
}

// Accepts the legacy football criteria AND the generic sport-agnostic ones (Epic #143):
// SCORE_DIFFERENCE ≡ GOAL_DIFFERENCE, SCORE_FOR ≡ GOALS_FOR, plus WINS.
function tupleFor(crit: string, group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  if (crit === 'GOAL_DIFFERENCE' || crit === 'SCORE_DIFFERENCE') return (r) => [r.goalsFor - r.goalsAgainst];
  if (crit === 'GOALS_FOR' || crit === 'SCORE_FOR') return (r) => [r.goalsFor];
  if (crit === 'WINS') return (r) => [r.won];
  return headToHeadTuple(group, matches);
}

export function rankStanding(
  rows: StandingRow[],
  matches: ScheduledMatch[],
  policy: readonly string[],
  overrides: string[][] = [],
): RankResult {
  const unresolved: string[][] = [];

  const order = (group: StandingRow[], ci: number): StandingRow[] => {
    if (group.length <= 1) return group;
    if (ci >= policy.length) {
      const names = group.map((r) => r.team);
      // Match only a genuine permutation of the tied set (exact set, no duplicates).
      const ov = overrides.find((o) => o.length === group.length && new Set(o).size === o.length && o.every((t) => names.includes(t)));
      if (ov) return ov.map((t) => group.find((r) => r.team === t)!); // resolved manually — not unresolved
      const sorted = [...group].sort((a, b) => a.team.localeCompare(b.team));
      unresolved.push(sorted.map((r) => r.team));
      return sorted;
    }
    const buckets = bucketByTuple(group, tupleFor(policy[ci]!, group, matches));
    const out: StandingRow[] = [];
    for (const b of buckets) out.push(...(b.length > 1 ? order(b, ci + 1) : b));
    return out;
  };

  // Primary criterion: points.
  const byPoints = bucketByTuple(rows, (r) => [r.points]);
  const result: StandingRow[] = [];
  for (const b of byPoints) result.push(...(b.length > 1 ? order(b, 0) : b));
  return { rows: result, unresolved };
}

/** Per-sport default policy, applied when the event carries no explicit `tieBreak` (ported from the
 *  mockup `shared/mock/tiebreak.ts`). */
const TIEBREAK_DEFAULTS: Record<string, TieBreakCriterion[]> = {
  Calcio: ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR'],
};
const GENERIC_DEFAULT: TieBreakCriterion[] = ['GOAL_DIFFERENCE', 'GOALS_FOR'];

export function defaultTieBreak(sport: string | undefined): TieBreakCriterion[] {
  return (sport ? TIEBREAK_DEFAULTS[sport] : undefined) ?? GENERIC_DEFAULT;
}
