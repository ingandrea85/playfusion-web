import { describe, expect, it } from 'vitest'
import { buildFixtures } from './fixtures'
import type { FixtureCategory, ScheduleConfig } from './types'

const config: ScheduleConfig = { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, dailyStart: '09:00', slotsPerDay: 8 }

describe('buildFixtures', () => {
  it('splits teams into groups and produces single-leg round-robin pairs', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('doubles matches for home-away', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 1, legs: 'HOME_AWAY', teams: ['A', 'B', 'C'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('treats ROUND_ROBIN as a single group regardless of groupsCount', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'ROUND_ROBIN', groupsCount: 5, legs: 'SINGLE', teams: ['A', 'B', 'C'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(3)
    expect(m.every(x => x.groupLabel === 'Girone A')).toBe(true)
  })

  it('places field then slot: the 3rd match wraps to the next slot', () => {
    const cats: FixtureCategory[] = [{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 1, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'] }]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', config, cats)
    expect(m).toHaveLength(6)
    expect(m[2]).toMatchObject({ field: 'Campo A', time: '09:50' })
  })
})
