import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getSchedule, getScheduledMatches, generateSchedule, approveSchedule, publishSchedule } from './store'
import type { ScheduleConfig } from './types'

const config: ScheduleConfig = {
  dailyStart: '09:00', slotsPerDay: 8,
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
})
