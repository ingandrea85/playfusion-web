import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, generateSchedule, getScheduledMatches, getStandings, getFinals, recordResult } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}
const isQualifierSlot = (s: string) => /^\d+ª Girone /.test(s)

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('finals qualifier resolution', () => {
  it('leaves qualifier slots unresolved while the group is incomplete', () => {
    generateSchedule('evt-1', config)
    const finals = getFinals('evt-1').filter(f => f.categoryId === 'cat-1')
    expect(finals.length).toBeGreaterThan(0)
    expect(finals.every(f => f.homeResolved === null && f.awayResolved === null)).toBe(true)
  })

  it('resolves qualifier slots to ranked teams once the category groups are complete', () => {
    generateSchedule('evt-1', config)
    for (const m of getScheduledMatches('evt-1').filter(x => x.categoryId === 'cat-1')) recordResult(m.id, 1, 0)
    const teams = new Set(getStandings('evt-1').filter(s => s.categoryId === 'cat-1').map(s => s.team))
    for (const f of getFinals('evt-1').filter(f => f.categoryId === 'cat-1')) {
      if (isQualifierSlot(f.home)) { expect(f.homeResolved).not.toBeNull(); expect(teams.has(f.homeResolved!)).toBe(true) }
      if (isQualifierSlot(f.away)) { expect(f.awayResolved).not.toBeNull(); expect(teams.has(f.awayResolved!)).toBe(true) }
    }
  })

  it('resolves only the completed group, leaving the incomplete sibling group as placeholders', () => {
    generateSchedule('evt-1', config)
    const cat1 = getScheduledMatches('evt-1').filter(x => x.categoryId === 'cat-1')
    const doneGroup = cat1[0].groupLabel
    // Complete only one girone; its sibling(s) stay unplayed.
    for (const m of cat1.filter(x => x.groupLabel === doneGroup)) recordResult(m.id, 1, 0)
    const check = (slot: string, resolved: string | null) => {
      if (!isQualifierSlot(slot)) return
      const group = slot.replace(/^\d+ª /, '')
      if (group === doneGroup) expect(resolved).not.toBeNull() // completed → resolved
      else expect(resolved).toBeNull()                          // incomplete → placeholder
    }
    for (const f of getFinals('evt-1').filter(f => f.categoryId === 'cat-1')) {
      check(f.home, f.homeResolved)
      check(f.away, f.awayResolved)
    }
  })
})
