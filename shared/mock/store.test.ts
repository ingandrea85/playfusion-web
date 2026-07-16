import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getEvents, getEvent, createEvent, getCategories, addCategory,
  setRegistrationsOpen, getRegistrations, addRegistration, confirmTeam, markPaid,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('store', () => {
  it('seeds one event with three categories and three registrations', () => {
    expect(getEvents()).toHaveLength(1)
    expect(getEvent('evt-1')?.name).toBe('Torneo Estivo Memorial')
    expect(getCategories('evt-1')).toHaveLength(3)
    expect(getRegistrations('evt-1')).toHaveLength(3)
  })

  it('createEvent appends an event with a fresh id and open registrations off', () => {
    const e = createEvent({ name: 'Coppa Primavera', sport: 'Calcio', startDate: '2026-09-01', endDate: '2026-09-02' })
    expect(e.id).toBe('evt-2')
    expect(e.registrationsOpen).toBe(false)
    expect(getEvents()).toHaveLength(2)
  })

  it('addCategory appends to the event', () => {
    const c = addCategory('evt-1', 'U16')
    expect(c.id).toBe('cat-4')
    expect(getCategories('evt-1').map(x => x.name)).toContain('U16')
  })

  it('setRegistrationsOpen toggles the flag', () => {
    setRegistrationsOpen('evt-1', false)
    expect(getEvent('evt-1')?.registrationsOpen).toBe(false)
  })

  it('addRegistration creates a PENDING/UNPAID registration visible in the list', () => {
    const r = addRegistration({ eventId: 'evt-1', categoryId: 'cat-3', teamName: 'Nuova Squadra',
      contactName: 'Test Referente', contactPhone: '000' })
    expect(r.id).toBe('reg-4')
    expect(r.status).toBe('PENDING')
    expect(r.paymentStatus).toBe('UNPAID')
    expect(getRegistrations('evt-1')).toHaveLength(4)
  })

  it('confirmTeam and markPaid mutate the registration', () => {
    confirmTeam('reg-3'); markPaid('reg-3')
    const r = getRegistrations('evt-1').find(x => x.id === 'reg-3')!
    expect(r.status).toBe('CONFIRMED')
    expect(r.paymentStatus).toBe('PAID')
  })

  it('persists across store reads via localStorage', () => {
    addCategory('evt-1', 'U16')
    expect(getCategories('evt-1')).toHaveLength(4)
  })
})
