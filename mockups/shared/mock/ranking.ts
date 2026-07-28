import type { StandingRow, ScheduledMatch, TieBreakCriterion } from './types'

export interface RankResult {
  rows: StandingRow[]
  unresolved: string[][]
}

const cmpDesc = (a: number[], b: number[]): number => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i]
  return 0
}
const eqTuple = (a: number[], b: number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

// Bucket a group into ranked buckets by a per-row tuple (desc, lexicographic). Teams
// with an identical tuple land in the same bucket (still tied on this criterion).
function bucketByTuple(group: StandingRow[], tuple: (r: StandingRow) => number[]): StandingRow[][] {
  const arr = group.map(r => ({ r, t: tuple(r) })).sort((x, y) => cmpDesc(x.t, y.t))
  const buckets: StandingRow[][] = []
  let curT: number[] | null = null
  for (const { r, t } of arr) {
    if (curT && eqTuple(curT, t)) buckets[buckets.length - 1].push(r)
    else { buckets.push([r]); curT = t }
  }
  return buckets
}

// Mini-league over only the matches whose home AND away are both in the group.
function headToHeadTuple(group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  const names = new Set(group.map(r => r.team))
  const mini = new Map<string, { pts: number; gf: number; ga: number }>()
  for (const r of group) mini.set(r.team, { pts: 0, gf: 0, ga: 0 })
  for (const m of matches) {
    if (m.homeScore === null || m.awayScore === null) continue
    if (!names.has(m.home) || !names.has(m.away)) continue
    const h = mini.get(m.home)!, a = mini.get(m.away)!
    h.gf += m.homeScore; h.ga += m.awayScore; a.gf += m.awayScore; a.ga += m.homeScore
    if (m.homeScore > m.awayScore) h.pts += 3
    else if (m.homeScore < m.awayScore) a.pts += 3
    else { h.pts++; a.pts++ }
  }
  return r => { const s = mini.get(r.team)!; return [s.pts, s.gf - s.ga, s.gf] }
}

function tupleFor(crit: TieBreakCriterion, group: StandingRow[], matches: ScheduledMatch[]): (r: StandingRow) => number[] {
  if (crit === 'GOAL_DIFFERENCE') return r => [r.goalsFor - r.goalsAgainst]
  if (crit === 'GOALS_FOR') return r => [r.goalsFor]
  return headToHeadTuple(group, matches)
}

export function rankStanding(rows: StandingRow[], matches: ScheduledMatch[], policy: TieBreakCriterion[], overrides: string[][] = []): RankResult {
  const unresolved: string[][] = []

  const order = (group: StandingRow[], ci: number): StandingRow[] => {
    if (group.length <= 1) return group
    if (ci >= policy.length) {
      const names = group.map(r => r.team)
      // Match only a genuine permutation of the tied group (exact set, no duplicates).
      const ov = overrides.find(o => o.length === group.length && new Set(o).size === o.length && o.every(t => names.includes(t)))
      if (ov) return ov.map(t => group.find(r => r.team === t)!) // resolved manually — not unresolved
      const sorted = [...group].sort((a, b) => a.team.localeCompare(b.team))
      unresolved.push(sorted.map(r => r.team))
      return sorted
    }
    const buckets = bucketByTuple(group, tupleFor(policy[ci], group, matches))
    const out: StandingRow[] = []
    for (const b of buckets) out.push(...(b.length > 1 ? order(b, ci + 1) : b))
    return out
  }

  // Primary criterion: points.
  const byPoints = bucketByTuple(rows, r => [r.points])
  const result: StandingRow[] = []
  for (const b of byPoints) result.push(...(b.length > 1 ? order(b, 0) : b))
  return { rows: result, unresolved }
}
