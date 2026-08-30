import { describe, it, expect } from 'vitest'
import { entitlements, atEventCap } from '../src/index.js'

describe('entitlements', () => {
  it('FREE is the restricted solo plan', () => {
    expect(entitlements('FREE')).toMatchObject({ maxSeats: 1, canInviteMembers: false, maxActiveEvents: 1, hasBrand: false, hasAnnouncements: false, hasPayments: false, hasEventSite: false, hasFinalsFormats: false, hasResources: false })
  })
  it('PRO unlocks the team (5 seats, unlimited events, modules)', () => {
    expect(entitlements('PRO')).toMatchObject({ maxSeats: 5, canInviteMembers: true, maxActiveEvents: null, hasBrand: true, hasAnnouncements: true, hasPayments: true, hasEventSite: true, hasFinalsFormats: true, hasResources: true, hasBusinessFeatures: false })
  })
  it('BUSINESS adds seats + the business-only feature flag', () => {
    expect(entitlements('BUSINESS')).toMatchObject({ maxSeats: 20, hasBusinessFeatures: true })
  })
  it('an unknown/missing plan falls back to FREE', () => {
    expect(entitlements(undefined)).toEqual(entitlements('FREE'))
    expect(entitlements('WHATEVER')).toEqual(entitlements('FREE'))
  })
})

describe('atEventCap', () => {
  it('FREE caps at 1 active event', () => {
    expect(atEventCap('FREE', 0)).toBe(false)
    expect(atEventCap('FREE', 1)).toBe(true)
  })
  it('PRO/BUSINESS never cap', () => {
    expect(atEventCap('PRO', 99)).toBe(false)
    expect(atEventCap('BUSINESS', 500)).toBe(false)
  })
})
