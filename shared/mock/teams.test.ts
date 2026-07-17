import { beforeEach, describe, expect, it } from 'vitest'
import { resetDemo, getEvent, getRegistrations, getGroupSlots, addTeam, updateTeam, removeTeam, upsertCompetition, drawGroups } from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('direct roster (PB-2)', () => {
  it('evt-direct is a PB-2 event with four confirmed teams and no gironi', () => {
    expect(getEvent('evt-direct')?.playbook).toBe('PB-2')
    const regs = getRegistrations('evt-direct')
    expect(regs).toHaveLength(4)
    expect(regs.every(r => r.status === 'CONFIRMED')).toBe(true)
    expect(getGroupSlots('evt-direct')).toHaveLength(0)
  })

  it('addTeam appends a CONFIRMED team', () => {
    const t = addTeam('evt-direct', 'evt-direct-cat', 'Nuova ASD', { contactName: 'Mario Rossi' })
    expect(t.status).toBe('CONFIRMED')
    expect(t.contactName).toBe('Mario Rossi')
    expect(t.contactEmail).toBe('') // missing contact → empty string
    expect(getRegistrations('evt-direct')).toHaveLength(5)
  })

  it('updateTeam renames and can change category', () => {
    const r = getRegistrations('evt-direct')[0]
    updateTeam(r.id, { teamName: 'Rinominata', categoryId: 'evt-direct-cat' })
    expect(getRegistrations('evt-direct').find(x => x.id === r.id)?.teamName).toBe('Rinominata')
  })

  it('removeTeam deletes the registration and prunes its group slots', () => {
    // Give evt-direct a competition and draw gironi so its teams get group slots.
    upsertCompetition({ eventId: 'evt-direct', categoryId: 'evt-direct-cat', format: 'GROUPS_KNOCKOUT', legs: 'SINGLE', groupsCount: 1, qualifiersPerGroup: 2, finalsType: 'SINGLE_GROUP_CROSSOVER' })
    drawGroups('evt-direct', 'evt-direct-cat')
    const r = getRegistrations('evt-direct')[0]
    expect(getGroupSlots('evt-direct').some(s => s.team === r.teamName)).toBe(true) // slot exists after draw
    removeTeam(r.id)
    expect(getRegistrations('evt-direct').some(x => x.id === r.id)).toBe(false)
    expect(getGroupSlots('evt-direct').some(s => s.team === r.teamName)).toBe(false) // pruned
  })
})
