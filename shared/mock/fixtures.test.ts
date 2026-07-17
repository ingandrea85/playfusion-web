import { describe, expect, it } from 'vitest'
import { buildFixtures } from './fixtures'
import type { FixtureCategory } from './types'

function cat(over: Partial<FixtureCategory>): FixtureCategory {
  return { id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE',
    teams: ['A', 'B', 'C', 'D'], fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10, ...over }
}

describe('buildFixtures', () => {
  it('splits teams into groups and produces single-leg round-robin pairs on the category fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({})])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('doubles matches for home-away', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ groupsCount: 1, legs: 'HOME_AWAY', teams: ['A', 'B', 'C'] })])
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('treats ROUND_ROBIN as a single group', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ format: 'ROUND_ROBIN', groupsCount: 5, teams: ['A', 'B', 'C'] })])
    expect(m).toHaveLength(3)
    expect(m.every(x => x.groupLabel === 'Girone A')).toBe(true)
  })

  it('uses each category slot length: single field → 2nd match at 09:50 (slot = 2*20+10)', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [cat({ groupsCount: 1, fields: ['Solo'] })])
    expect(m).toHaveLength(6)
    expect(m[1]).toMatchObject({ field: 'Solo', time: '09:50' })
  })

  it('places each category independently on its own fields from dailyStart', () => {
    const cats: FixtureCategory[] = [
      cat({ id: 'c1', name: 'U10', format: 'ROUND_ROBIN', groupsCount: 1, teams: ['A', 'B'], fields: ['Campo Nord'], periodMinutes: 15, breakMinutes: 5 }),
      cat({ id: 'c2', name: 'U14', format: 'ROUND_ROBIN', groupsCount: 1, teams: ['X', 'Y'], fields: ['Campo Sud'], periodMinutes: 30, breakMinutes: 10 }),
    ]
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, cats)
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ categoryId: 'c1', field: 'Campo Nord', time: '09:00' })
    expect(m[1]).toMatchObject({ categoryId: 'c2', field: 'Campo Sud', time: '09:00' })
  })
})
