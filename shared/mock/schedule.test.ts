import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getSchedule, getScheduledMatches, getStandings, generateSchedule, approveSchedule, publishSchedule, getFinals, rescheduleMatch } from './store'
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

describe('schedule store', () => {
  it('starts at NONE with no matches', () => {
    expect(getSchedule('evt-1')?.status).toBe('NONE')
    expect(getScheduledMatches('evt-1')).toHaveLength(0)
  })

  it('generate produces matches from confirmed teams and sets GENERATED', () => {
    generateSchedule('evt-1', config)
    expect(getSchedule('evt-1')?.status).toBe('GENERATED')
    expect(getScheduledMatches('evt-1').length).toBeGreaterThan(0)
  })

  it('regenerate replaces matches (no accumulation) while not approved', () => {
    generateSchedule('evt-1', config)
    const first = getScheduledMatches('evt-1').length
    generateSchedule('evt-1', config)
    expect(getScheduledMatches('evt-1')).toHaveLength(first)
  })

  it('approve then publish advance the status; generate is a no-op once approved', () => {
    generateSchedule('evt-1', config)
    approveSchedule('evt-1')
    expect(getSchedule('evt-1')?.status).toBe('APPROVED')
    generateSchedule('evt-1', { ...config, dailyStart: '08:00' })
    expect(getSchedule('evt-1')?.status).toBe('APPROVED')
    publishSchedule('evt-1')
    expect(getSchedule('evt-1')?.status).toBe('PUBLISHED')
  })

  it('generate initializes zero-point standings per group; reset clears them', () => {
    expect(getStandings('evt-1')).toHaveLength(0)
    generateSchedule('evt-1', config)
    const s = getStandings('evt-1')
    expect(s.length).toBeGreaterThan(0)
    expect(s.every(r => r.points === 0 && r.played === 0)).toBe(true)
    resetDemo()
    expect(getStandings('evt-1')).toHaveLength(0)
  })

  it('generate also creates finals on the finals date; reset clears them', () => {
    expect(getFinals('evt-1')).toHaveLength(0)
    generateSchedule('evt-1', config)
    const f = getFinals('evt-1')
    expect(f.length).toBeGreaterThan(0)
    expect(f.every(m => m.day === '2026-08-30')).toBe(true)
    resetDemo()
    expect(getFinals('evt-1')).toHaveLength(0)
  })

  it('rescheduleMatch updates a match day/time/field in place', () => {
    generateSchedule('evt-1', config)
    const m = getScheduledMatches('evt-1')[0]
    rescheduleMatch(m.id, { day: '2026-08-31', time: '15:30', field: 'Campo Z' })
    const after = getScheduledMatches('evt-1').find(x => x.id === m.id)!
    expect(after).toMatchObject({ day: '2026-08-31', time: '15:30', field: 'Campo Z' })
    // other matches untouched
    expect(getScheduledMatches('evt-1').filter(x => x.field === 'Campo Z')).toHaveLength(1)
  })
})
