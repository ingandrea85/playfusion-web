import { describe, expect, it } from 'vitest'
import { buildFixtures, buildGroups } from './fixtures'
import type { ScheduledCategory } from './types'

function sc(over: Partial<ScheduledCategory>): ScheduledCategory {
  return { id: 'c1', legs: 'SINGLE', fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10,
    groups: [{ groupLabel: 'Girone A', teams: ['A', 'C'] }, { groupLabel: 'Girone B', teams: ['B', 'D'] }], ...over }
}

describe('buildFixtures (pre-resolved groups)', () => {
  it('round-robin pairs per group, placed on the fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({})])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ home: 'A', away: 'C', groupLabel: 'Girone A', field: 'Campo A', time: '09:00', day: '2026-08-29' })
    expect(m[1]).toMatchObject({ home: 'B', away: 'D', groupLabel: 'Girone B', field: 'Campo B', time: '09:00' })
  })

  it('home-away doubles each pair', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({ legs: 'HOME_AWAY', groups: [{ groupLabel: 'Girone A', teams: ['A', 'B', 'C'] }] })])
    expect(m).toHaveLength(6)
    expect(m.filter(x => x.home === 'B' && x.away === 'A')).toHaveLength(1)
  })

  it('single field advances the slot: 2nd match at 09:50', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [sc({ fields: ['Solo'], groups: [{ groupLabel: 'Girone A', teams: ['A', 'B', 'C', 'D'] }] })])
    expect(m).toHaveLength(6)
    expect(m[1]).toMatchObject({ field: 'Solo', time: '09:50' })
  })

  it('places each category independently on its own fields', () => {
    const m = buildFixtures('evt-1', '2026-08-29', '2026-08-30', '09:00', 8, [
      sc({ id: 'c1', fields: ['Campo Nord'], groups: [{ groupLabel: 'Girone A', teams: ['A', 'B'] }] }),
      sc({ id: 'c2', fields: ['Campo Sud'], periodMinutes: 30, groups: [{ groupLabel: 'Girone A', teams: ['X', 'Y'] }] }),
    ])
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ categoryId: 'c1', field: 'Campo Nord', time: '09:00' })
    expect(m[1]).toMatchObject({ categoryId: 'c2', field: 'Campo Sud', time: '09:00' })
  })

  it('buildGroups still auto-splits by i % groups (used by the auto path)', () => {
    expect(buildGroups([{ id: 'c1', name: 'U10', format: 'GROUPS_KNOCKOUT', groupsCount: 2, legs: 'SINGLE', teams: ['A', 'B', 'C', 'D'], fields: [], periods: 2, periodMinutes: 20, breakMinutes: 10 }]))
      .toEqual([
        { categoryId: 'c1', groupLabel: 'Girone A', teams: ['A', 'C'] },
        { categoryId: 'c1', groupLabel: 'Girone B', teams: ['B', 'D'] },
      ])
  })
})
