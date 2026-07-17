import { describe, expect, it } from 'vitest'
import { rankStanding } from './ranking'
import type { StandingRow } from './types'

const row = (team: string, points: number, goalsFor: number, goalsAgainst: number): StandingRow => ({
  eventId: 'evt-1', categoryId: 'cat-1', groupLabel: 'Girone A', team,
  played: 0, won: 0, drawn: 0, lost: 0, goalsFor, goalsAgainst, points,
})

describe('rankStanding', () => {
  it('orders by points, then goal difference, then goals for, then team name', () => {
    const out = rankStanding([
      row('Delta', 3, 1, 0),   // 3 pts, dr +1
      row('Alfa', 6, 2, 2),    // 6 pts
      row('Charlie', 3, 5, 3), // 3 pts, dr +2
      row('Bravo', 3, 4, 2),   // 3 pts, dr +2, gf 4
    ]).map(r => r.team)
    expect(out).toEqual(['Alfa', 'Charlie', 'Bravo', 'Delta'])
  })

  it('does not mutate the input array', () => {
    const input = [row('B', 1, 0, 0), row('A', 2, 0, 0)]
    const before = input.map(r => r.team)
    rankStanding(input)
    expect(input.map(r => r.team)).toEqual(before)
  })
})
