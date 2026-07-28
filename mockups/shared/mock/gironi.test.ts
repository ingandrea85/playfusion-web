import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getGroupSlots, drawGroups, moveTeam, setGroupsLocked, generateSchedule, getScheduledMatches } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8, finalsDate: '2026-08-30',
  byCategory: {
    'cat-1': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-2': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
    'cat-3': { fields: ['Campo A', 'Campo B'], periods: 2, periodMinutes: 20, breakMinutes: 10 },
  },
}

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('gironi composition', () => {
  it('drawGroups seeds one slot per confirmed team, across groupsCount gironi', () => {
    drawGroups('evt-1', 'cat-1')
    const slots = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1')
    expect(slots.length).toBeGreaterThan(0)
    expect(new Set(slots.map(s => s.groupLabel))).toEqual(new Set(['Girone A', 'Girone B']))
  })

  it('moveTeam changes a team girone', () => {
    drawGroups('evt-1', 'cat-1')
    const t = getGroupSlots('evt-1').find(s => s.categoryId === 'cat-1')!
    moveTeam('evt-1', 'cat-1', t.team, 'Girone B')
    expect(getGroupSlots('evt-1').find(s => s.categoryId === 'cat-1' && s.team === t.team)!.groupLabel).toBe('Girone B')
  })

  it('locked category refuses draw and move', () => {
    drawGroups('evt-1', 'cat-1')
    setGroupsLocked('cat-1', true)
    const before = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1').map(s => `${s.team}:${s.groupLabel}`).sort()
    moveTeam('evt-1', 'cat-1', before[0].split(':')[0], 'Girone B')
    const after = getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1').map(s => `${s.team}:${s.groupLabel}`).sort()
    expect(after).toEqual(before)
  })

  it('generateSchedule uses the explicit composition when slots exist', () => {
    // put ALL cat-1 confirmed teams in Girone A → single round-robin → all matches share Girone A
    drawGroups('evt-1', 'cat-1')
    for (const s of getGroupSlots('evt-1').filter(s => s.categoryId === 'cat-1')) moveTeam('evt-1', 'cat-1', s.team, 'Girone A')
    generateSchedule('evt-1', config)
    const cat1 = getScheduledMatches('evt-1').filter(m => m.categoryId === 'cat-1')
    expect(cat1.length).toBeGreaterThan(0)
    expect(cat1.every(m => m.groupLabel === 'Girone A')).toBe(true)
  })
})
