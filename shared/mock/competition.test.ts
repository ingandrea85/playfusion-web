import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, addCategory, getCompetition, getCompetitions, upsertCompetition, applyToAllCategories,
} from './store'
import type { CompetitionConfig } from './types'

const RR: CompetitionConfig = { format: 'ROUND_ROBIN', legs: 'HOME_AWAY', groupsCount: 1, qualifiersPerGroup: 1, finalsType: 'PLACEMENT' }

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('competition store', () => {
  it('seeds one competition per category, all identical', () => {
    const comps = getCompetitions('evt-1')
    expect(comps).toHaveLength(3)
    expect(getCompetition('cat-1')?.format).toBe('GROUPS_KNOCKOUT')
    expect(comps.every(c => c.legs === 'SINGLE' && c.groupsCount === 2)).toBe(true)
  })

  it('upsertCompetition updates the existing row for a category (no duplicate)', () => {
    upsertCompetition({ eventId: 'evt-1', categoryId: 'cat-1', ...RR })
    expect(getCompetitions('evt-1')).toHaveLength(3)
    expect(getCompetition('cat-1')?.format).toBe('ROUND_ROBIN')
    expect(getCompetition('cat-1')?.legs).toBe('HOME_AWAY')
  })

  it('upsertCompetition creates a row for a category that has none', () => {
    const cat = addCategory('evt-1', 'U16', 8)
    expect(getCompetition(cat.id)).toBeUndefined()
    upsertCompetition({ eventId: 'evt-1', categoryId: cat.id, ...RR })
    expect(getCompetition(cat.id)?.format).toBe('ROUND_ROBIN')
    expect(getCompetitions('evt-1')).toHaveLength(4)
  })

  it('applyToAllCategories writes the same config to every category of the event', () => {
    applyToAllCategories('evt-1', RR)
    const comps = getCompetitions('evt-1')
    expect(comps).toHaveLength(3)
    expect(comps.every(c => c.format === 'ROUND_ROBIN' && c.legs === 'HOME_AWAY')).toBe(true)
  })
})
