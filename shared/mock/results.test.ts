import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, generateSchedule, getScheduledMatches, getStandings, recordResult } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}
const rowFor = (eventId: string, m: { categoryId: string; team: string }) =>
  getStandings(eventId).find(s => s.categoryId === m.categoryId && s.team === m.team)!

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('results + standings recompute', () => {
  it('unplayed → all standings zero', () => {
    generateSchedule('evt-1', config)
    expect(getStandings('evt-1').every(s => s.played === 0 && s.points === 0)).toBe(true)
  })

  it('a win gives 3 pts to home, 0 to away, with goals', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    recordResult(m.id, 2, 1)
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.home })).toMatchObject({ played: 1, won: 1, drawn: 0, lost: 0, goalsFor: 2, goalsAgainst: 1, points: 3 })
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.away })).toMatchObject({ played: 1, won: 0, drawn: 0, lost: 1, goalsFor: 1, goalsAgainst: 2, points: 0 })
  })

  it('re-recording as a draw recomputes to 1 pt each', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    recordResult(m.id, 2, 1)
    recordResult(m.id, 1, 1)
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.home })).toMatchObject({ played: 1, won: 0, drawn: 1, lost: 0, points: 1 })
    expect(rowFor('evt-1', { categoryId: m.categoryId, team: m.away })).toMatchObject({ played: 1, drawn: 1, points: 1 })
  })
})
