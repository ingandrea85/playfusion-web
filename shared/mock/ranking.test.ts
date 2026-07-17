import { describe, expect, it } from 'vitest'
import { rankStanding } from './ranking'
import type { StandingRow, ScheduledMatch, TieBreakCriterion } from './types'

const P: TieBreakCriterion[] = ['HEAD_TO_HEAD', 'GOAL_DIFFERENCE', 'GOALS_FOR']

const row = (team: string, points: number, goalsFor: number, goalsAgainst: number): StandingRow => ({
  eventId: 'e', categoryId: 'c', groupLabel: 'Girone A', team,
  played: 0, won: 0, drawn: 0, lost: 0, goalsFor, goalsAgainst, points,
})
let mseq = 0
const mt = (home: string, hs: number, away: string, as: number): ScheduledMatch => ({
  id: `m${++mseq}`, eventId: 'e', categoryId: 'c', groupLabel: 'Girone A',
  day: '2026-01-01', time: '09:00', field: 'Campo 1', home, away, homeScore: hs, awayScore: as,
})
const order = (r: StandingRow[], m: ScheduledMatch[]) => rankStanding(r, m, P).rows.map(x => x.team)

describe('rankStanding — policy engine', () => {
  it('head-to-head separates two teams tied on points, GD and GF', () => {
    const rows = [row('Alfa', 6, 2, 1), row('Bravo', 6, 2, 1)]
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 0)], P)
    expect(res.rows.map(r => r.team)).toEqual(['Alfa', 'Bravo'])
    expect(res.unresolved).toEqual([])
  })

  it('classifica avulsa separates three tied teams (and can differ from overall goals-for)', () => {
    // Overall goals-for would put Bravo first (6); avulsa puts Alfa, Charlie, Bravo.
    const rows = [row('Alfa', 6, 4, 1), row('Bravo', 6, 6, 3), row('Charlie', 6, 4, 1)]
    const matches = [mt('Alfa', 3, 'Bravo', 0), mt('Bravo', 1, 'Charlie', 0), mt('Charlie', 1, 'Alfa', 0)]
    expect(order(rows, matches)).toEqual(['Alfa', 'Charlie', 'Bravo'])
  })

  it('falls through to goal difference when head-to-head is drawn', () => {
    const rows = [row('Alfa', 4, 4, 1), row('Bravo', 4, 2, 1)] // GD +3 vs +1
    expect(order(rows, [mt('Alfa', 1, 'Bravo', 1)])).toEqual(['Alfa', 'Bravo'])
  })

  it('falls through to goals for when head-to-head and GD are equal', () => {
    const rows = [row('Alfa', 4, 5, 3), row('Bravo', 4, 4, 2)] // GD both +2, GF 5 vs 4
    expect(order(rows, [mt('Alfa', 2, 'Bravo', 2)])).toEqual(['Alfa', 'Bravo'])
  })

  it('reports an unresolved group when every criterion ties', () => {
    const rows = [row('Bravo', 4, 3, 1), row('Alfa', 4, 3, 1)]
    const res = rankStanding(rows, [mt('Alfa', 1, 'Bravo', 1)], P)
    expect(res.rows.map(r => r.team)).toEqual(['Alfa', 'Bravo']) // name-stable
    expect(res.unresolved).toEqual([['Alfa', 'Bravo']])
  })

  it('does not mutate the input rows array', () => {
    const rows = [row('B', 1, 0, 0), row('A', 2, 0, 0)]
    const before = rows.map(r => r.team)
    rankStanding(rows, [], P)
    expect(rows.map(r => r.team)).toEqual(before)
  })
})
