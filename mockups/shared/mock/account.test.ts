import { beforeEach, describe, expect, it } from 'vitest'
import {
  resetDemo, getCurrentOrgId, getSession, signUp, activatePro, expireTrial,
  trialDaysLeft, planOf, hasModule, canCreateEvent, getSubscription, createEvent, logout,
} from './store'

beforeEach(() => { localStorage.clear(); resetDemo() })

describe('session default', () => {
  it('no session → current org is org-1', () => {
    expect(getSession()).toBeNull()
    expect(getCurrentOrgId()).toBe('org-1')
  })
})

describe('signUp', () => {
  it('creates org + user + trial subscription and sets the session', () => {
    const { user, organization } = signUp({ name: 'Marco Test', email: 'marco@test.it', orgName: 'ASD Prova' })
    expect(organization.name).toBe('ASD Prova')
    expect(user.role).toBe('OWNER')
    expect(getCurrentOrgId()).toBe(organization.id)
    const sub = getSubscription(organization.id)!
    expect(sub.plan).toBe('PRO')
    expect(sub.status).toBe('TRIAL')
    expect(planOf(organization.id)).toBe('PRO')
    expect(hasModule(organization.id, 'M-Broadcast')).toBe(true)
    expect(trialDaysLeft(organization.id)).toBeGreaterThan(12)
  })
})

describe('trial lifecycle', () => {
  it('expireTrial downgrades to limited Free', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org X' })
    expireTrial(organization.id)
    expect(planOf(organization.id)).toBe('FREE')
    expect(getSubscription(organization.id)!.status).toBe('ACTIVE')
    expect(hasModule(organization.id, 'M-Broadcast')).toBe(false)
    expect(hasModule(organization.id, 'M-Payments')).toBe(false)
    expect(hasModule(organization.id, 'M-Compete')).toBe(true)
    expect(trialDaysLeft(organization.id)).toBe(0)
  })
  it('activatePro restores Pro + modules', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Y' })
    expireTrial(organization.id)
    activatePro(organization.id)
    expect(planOf(organization.id)).toBe('PRO')
    expect(getSubscription(organization.id)!.status).toBe('ACTIVE')
    expect(hasModule(organization.id, 'M-Payments')).toBe(true)
  })
})

describe('event cap on Free', () => {
  it('Free org may create one active event, not a second', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org Z' })
    expireTrial(organization.id) // now FREE, session still on this org
    expect(canCreateEvent(organization.id)).toBe(true)
    createEvent({ name: 'T1', sport: 'Calcio', location: 'X', startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01' })
    expect(canCreateEvent(organization.id)).toBe(false) // 1 active event already
  })
  it('Pro (trial) org has no cap', () => {
    const { organization } = signUp({ name: 'A', email: 'a@b.it', orgName: 'Org W' })
    createEvent({ name: 'T1', sport: 'Calcio', location: 'X', startDate: '2026-09-01', startTime: '09:00', endDate: '2026-09-01' })
    expect(canCreateEvent(organization.id)).toBe(true) // PRO → unlimited
  })
})

describe('logout', () => {
  it('clears session back to default org', () => {
    signUp({ name: 'A', email: 'a@b.it', orgName: 'Org L' })
    logout()
    expect(getSession()).toBeNull()
    expect(getCurrentOrgId()).toBe('org-1')
  })
})
